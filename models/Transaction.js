import crypto from 'node:crypto';
import { z } from 'zod';
import {
  applyTransactionBalanceEffect,
  isSupabaseConfigured,
  readLocalDb,
  writeLocalDb,
} from './db.js';

export const transactionSchema = z
  .object({
    wallet_id: z.string().min(1, 'Dompet wajib dipilih.'),
    to_wallet_id: z.string().nullable().optional(),
    category_id: z.string().nullable().optional(),
    type: z.enum(['income', 'expense', 'transfer'], {
      errorMap: () => ({ message: 'Tipe transaksi harus income, expense, atau transfer.' }),
    }),
    amount: z.coerce.number().positive('Jumlah nominal harus lebih besar dari Rp 0.'),
    transaction_date: z.string().min(1, 'Tanggal transaksi wajib diisi.'),
    description: z.string().trim().min(1, 'Keterangan transaksi wajib diisi.').max(255),
    memo: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'transfer') {
      if (!val.to_wallet_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_wallet_id'],
          message: 'Dompet tujuan wajib dipilih untuk transaksi transfer.',
        });
      } else if (val.to_wallet_id === val.wallet_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['to_wallet_id'],
          message: 'Dompet tujuan tidak boleh sama dengan dompet asal.',
        });
      }
    } else if (!val.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category_id'],
        message: 'Kategori wajib dipilih untuk pemasukan atau pengeluaran.',
      });
    }
  });

function enrichLocalTransaction(tx, walletsMap, categoriesMap) {
  return {
    ...tx,
    amount: Number(tx.amount),
    wallet: walletsMap.get(tx.wallet_id) || null,
    to_wallet: tx.to_wallet_id ? walletsMap.get(tx.to_wallet_id) || null : null,
    category: tx.category_id ? categoriesMap.get(tx.category_id) || null : null,
  };
}

function getNetMutationForScope(tx, walletId) {
  const amount = Number(tx.amount);
  if (!walletId) {
    if (tx.type === 'income') return amount;
    if (tx.type === 'expense') return -amount;
    return 0;
  }

  if (tx.type === 'income' && tx.wallet_id === walletId) return amount;
  if (tx.type === 'expense' && tx.wallet_id === walletId) return -amount;
  if (tx.type === 'transfer') {
    if (tx.wallet_id === walletId) return -amount;
    if (tx.to_wallet_id === walletId) return amount;
  }
  return 0;
}

async function loadUserFinancialData(userId, supabase) {
  if (isSupabaseConfigured) {
    const [walletsRes, categoriesRes, txRes] = await Promise.all([
      supabase.from('wallets').select('*').eq('user_id', userId),
      supabase.from('categories').select('*').or(`user_id.is.null,user_id.eq.${userId}`),
      supabase.from('transactions').select('*').eq('user_id', userId),
    ]);

    if (walletsRes.error) throw new Error(walletsRes.error.message);
    if (categoriesRes.error) throw new Error(categoriesRes.error.message);
    if (txRes.error) throw new Error(txRes.error.message);

    return {
      wallets: walletsRes.data || [],
      categories: categoriesRes.data || [],
      transactions: txRes.data || [],
    };
  }

  const db = readLocalDb();
  return {
    wallets: db.wallets.filter((w) => w.user_id === userId),
    categories: db.categories.filter((c) => c.user_id === null || c.user_id === userId),
    transactions: db.transactions.filter((t) => t.user_id === userId),
  };
}

const Transaction = {
  async findAllByUser(userId, filters, supabase) {
    const { start_date, end_date, wallet_id, type } = filters || {};

    if (isSupabaseConfigured) {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          wallet:wallets!transactions_wallet_id_fkey(id, name, color_code),
          to_wallet:wallets!transactions_to_wallet_id_fkey(id, name, color_code),
          category:categories(id, name, icon_name, color_code, type)
        `)
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (start_date) {
        query = query.gte('transaction_date', new Date(start_date).toISOString());
      }
      if (end_date) {
        const endObj = new Date(end_date);
        if (String(end_date).length <= 10) {
          endObj.setHours(23, 59, 59, 999);
        }
        query = query.lte('transaction_date', endObj.toISOString());
      }
      if (wallet_id) {
        query = query.or(`wallet_id.eq.${wallet_id},to_wallet_id.eq.${wallet_id}`);
      }
      if (type && ['income', 'expense', 'transfer'].includes(type)) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data.map((t) => ({
        ...t,
        amount: Number(t.amount),
      }));
    }

    const db = readLocalDb();
    const walletsMap = new Map(
      db.wallets
        .filter((w) => w.user_id === userId)
        .map((w) => [w.id, { id: w.id, name: w.name, color_code: w.color_code }])
    );
    const categoriesMap = new Map(
      db.categories
        .filter((c) => c.user_id === null || c.user_id === userId)
        .map((c) => [
          c.id,
          { id: c.id, name: c.name, icon_name: c.icon_name, color_code: c.color_code, type: c.type },
        ])
    );

    const startMs = start_date ? new Date(start_date).setHours(0, 0, 0, 0) : null;
    const endMs = end_date ? new Date(end_date).setHours(23, 59, 59, 999) : null;

    return db.transactions
      .filter((t) => {
        if (t.user_id !== userId) return false;
        const txMs = new Date(t.transaction_date).getTime();
        if (startMs !== null && txMs < startMs) return false;
        if (endMs !== null && txMs > endMs) return false;
        if (wallet_id && t.wallet_id !== wallet_id && t.to_wallet_id !== wallet_id) return false;
        if (type && t.type !== type) return false;
        return true;
      })
      .sort((a, b) => {
        const diff = new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
        return diff !== 0 ? diff : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .map((t) => enrichLocalTransaction(t, walletsMap, categoriesMap));
  },

  async create(userId, rawPayload, supabase) {
    const parsed = transactionSchema.parse(rawPayload);
    const payload = {
      wallet_id: parsed.wallet_id,
      to_wallet_id: parsed.type === 'transfer' ? parsed.to_wallet_id : null,
      category_id: parsed.type === 'transfer' ? null : parsed.category_id,
      type: parsed.type,
      amount: Number(parsed.amount),
      transaction_date: new Date(parsed.transaction_date).toISOString(),
      description: parsed.description,
      memo: parsed.memo || null,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: userId,
          ...payload,
        })
        .select(`
          *,
          wallet:wallets!transactions_wallet_id_fkey(id, name, color_code),
          to_wallet:wallets!transactions_to_wallet_id_fkey(id, name, color_code),
          category:categories(id, name, icon_name, color_code, type)
        `)
        .single();

      if (error) throw new Error(error.message);
      return {
        ...data,
        amount: Number(data.amount),
      };
    }

    const db = readLocalDb();
    const userWallets = db.wallets.filter((w) => w.user_id === userId);
    const sourceWallet = userWallets.find((w) => w.id === payload.wallet_id);
    if (!sourceWallet) {
      const err = new Error('Dompet asal tidak ditemukan.');
      err.statusCode = 400;
      throw err;
    }
    if (payload.type === 'transfer') {
      const targetWallet = userWallets.find((w) => w.id === payload.to_wallet_id);
      if (!targetWallet) {
        const err = new Error('Dompet tujuan tidak ditemukan.');
        err.statusCode = 400;
        throw err;
      }
    }

    const newTx = {
      id: crypto.randomUUID(),
      user_id: userId,
      ...payload,
      created_at: new Date().toISOString(),
    };

    db.transactions.push(newTx);
    applyTransactionBalanceEffect(db.wallets, newTx, 1);
    writeLocalDb(db);

    const walletsMap = new Map(
      userWallets.map((w) => [w.id, { id: w.id, name: w.name, color_code: w.color_code }])
    );
    const categoriesMap = new Map(
      db.categories.map((c) => [
        c.id,
        { id: c.id, name: c.name, icon_name: c.icon_name, color_code: c.color_code, type: c.type },
      ])
    );

    return enrichLocalTransaction(newTx, walletsMap, categoriesMap);
  },

  async updateById(id, userId, rawPayload, supabase) {
    const parsed = transactionSchema.parse(rawPayload);
    const payload = {
      wallet_id: parsed.wallet_id,
      to_wallet_id: parsed.type === 'transfer' ? parsed.to_wallet_id : null,
      category_id: parsed.type === 'transfer' ? null : parsed.category_id,
      type: parsed.type,
      amount: Number(parsed.amount),
      transaction_date: new Date(parsed.transaction_date).toISOString(),
      description: parsed.description,
      memo: parsed.memo || null,
    };

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId)
        .select(`
          *,
          wallet:wallets!transactions_wallet_id_fkey(id, name, color_code),
          to_wallet:wallets!transactions_to_wallet_id_fkey(id, name, color_code),
          category:categories(id, name, icon_name, color_code, type)
        `)
        .single();

      if (error) throw new Error(error.message);
      return {
        ...data,
        amount: Number(data.amount),
      };
    }

    const db = readLocalDb();
    const txIndex = db.transactions.findIndex((t) => t.id === id && t.user_id === userId);
    if (txIndex === -1) {
      const err = new Error('Transaksi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const oldTx = db.transactions[txIndex];
    applyTransactionBalanceEffect(db.wallets, oldTx, -1);

    const updatedTx = {
      ...oldTx,
      ...payload,
    };

    db.transactions[txIndex] = updatedTx;
    applyTransactionBalanceEffect(db.wallets, updatedTx, 1);
    writeLocalDb(db);

    const walletsMap = new Map(
      db.wallets
        .filter((w) => w.user_id === userId)
        .map((w) => [w.id, { id: w.id, name: w.name, color_code: w.color_code }])
    );
    const categoriesMap = new Map(
      db.categories.map((c) => [
        c.id,
        { id: c.id, name: c.name, icon_name: c.icon_name, color_code: c.color_code, type: c.type },
      ])
    );

    return enrichLocalTransaction(updatedTx, walletsMap, categoriesMap);
  },

  async deleteById(id, userId, supabase) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
      return;
    }

    const db = readLocalDb();
    const txIndex = db.transactions.findIndex((t) => t.id === id && t.user_id === userId);
    if (txIndex === -1) {
      const err = new Error('Transaksi tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const oldTx = db.transactions[txIndex];
    applyTransactionBalanceEffect(db.wallets, oldTx, -1);
    db.transactions.splice(txIndex, 1);
    writeLocalDb(db);
  },

  async getSummary(userId, filters, supabase) {
    const { start_date, end_date, wallet_id } = filters || {};
    const { wallets, transactions } = await loadUserFinancialData(userId, supabase);

    const scopedWallets = wallet_id
      ? wallets.filter((w) => w.id === wallet_id)
      : wallets;

    const baseInitialBalance = scopedWallets.reduce(
      (sum, w) => sum + Number(w.initial_balance || 0),
      0
    );

    const startMs = start_date ? new Date(start_date).setHours(0, 0, 0, 0) : null;
    const endMs = end_date ? new Date(end_date).setHours(23, 59, 59, 999) : null;

    let priorMutation = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    let periodNetTransfer = 0;

    for (const tx of transactions) {
      const txMs = new Date(tx.transaction_date).getTime();
      const amount = Number(tx.amount);

      if (startMs !== null && txMs < startMs) {
        priorMutation += getNetMutationForScope(tx, wallet_id);
        continue;
      }

      if (endMs !== null && txMs > endMs) {
        continue;
      }

      if (!wallet_id || tx.wallet_id === wallet_id) {
        if (tx.type === 'income') totalIncome += amount;
        if (tx.type === 'expense') totalExpense += amount;
      }

      if (wallet_id && tx.type === 'transfer') {
        if (tx.wallet_id === wallet_id) periodNetTransfer -= amount;
        if (tx.to_wallet_id === wallet_id) periodNetTransfer += amount;
      }
    }

    const openingBalance = baseInitialBalance + priorMutation;
    const closingBalance = openingBalance + totalIncome - totalExpense + periodNetTransfer;

    return {
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_transfer: periodNetTransfer,
      net_cashflow: totalIncome - totalExpense + periodNetTransfer,
    };
  },

  async getChart(userId, filters, supabase) {
    const { start_date, end_date, wallet_id, type = 'expense' } = filters || {};
    const targetType = type === 'income' ? 'income' : 'expense';
    const { categories, transactions } = await loadUserFinancialData(userId, supabase);

    const categoriesMap = new Map(categories.map((c) => [c.id, c]));
    const startMs = start_date ? new Date(start_date).setHours(0, 0, 0, 0) : null;
    const endMs = end_date ? new Date(end_date).setHours(23, 59, 59, 999) : null;

    const grouped = new Map();
    let grandTotal = 0;

    for (const tx of transactions) {
      if (tx.type !== targetType) continue;
      if (wallet_id && tx.wallet_id !== wallet_id) continue;

      const txMs = new Date(tx.transaction_date).getTime();
      if (startMs !== null && txMs < startMs) continue;
      if (endMs !== null && txMs > endMs) continue;

      const catId = tx.category_id || 'uncategorized';
      const cat = categoriesMap.get(catId);
      const amount = Number(tx.amount);
      grandTotal += amount;

      const existing = grouped.get(catId) || {
        category_id: catId,
        name: cat?.name || 'Tanpa Kategori',
        icon_name: cat?.icon_name || 'Tag',
        color_code: cat?.color_code || '#0f766e',
        amount: 0,
        count: 0,
      };

      existing.amount += amount;
      existing.count += 1;
      grouped.set(catId, existing);
    }

    const items = Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item) => ({
        ...item,
        percentage:
          grandTotal > 0 ? Number(((item.amount / grandTotal) * 100).toFixed(1)) : 0,
      }));

    return {
      type: targetType,
      total: grandTotal,
      items,
    };
  },
};

export default Transaction;
