import crypto from 'node:crypto';
import { z } from 'zod';
import { isSupabaseConfigured, readLocalDb, writeLocalDb } from './db.js';

export const walletCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama dompet wajib diisi.').max(100),
  color_code: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Kode warna harus berformat hex (contoh: #0f766e).')
    .default('#0f766e'),
  initial_balance: z.coerce.number().default(0),
});

export const walletUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Nama dompet wajib diisi.').max(100).optional(),
  color_code: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Kode warna harus berformat hex.')
    .optional(),
  initial_balance: z.coerce.number().optional(),
});

const Wallet = {
  async findAllByUser(userId, supabase) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      return data.map((w) => ({
        ...w,
        initial_balance: Number(w.initial_balance),
        balance: Number(w.balance),
      }));
    }

    const db = readLocalDb();
    return db.wallets
      .filter((w) => w.user_id === userId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((w) => ({
        ...w,
        initial_balance: Number(w.initial_balance),
        balance: Number(w.balance),
      }));
  },

  async create(userId, payload, supabase) {
    const parsed = walletCreateSchema.parse(payload);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('wallets')
        .insert({
          user_id: userId,
          name: parsed.name,
          color_code: parsed.color_code,
          initial_balance: parsed.initial_balance,
          balance: parsed.initial_balance,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      return {
        ...data,
        initial_balance: Number(data.initial_balance),
        balance: Number(data.balance),
      };
    }

    const db = readLocalDb();
    const newWallet = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: parsed.name,
      color_code: parsed.color_code,
      initial_balance: Number(parsed.initial_balance),
      balance: Number(parsed.initial_balance),
      created_at: new Date().toISOString(),
    };

    db.wallets.push(newWallet);
    writeLocalDb(db);
    return newWallet;
  },

  async updateById(id, userId, payload, supabase) {
    const parsed = walletUpdateSchema.parse(payload);

    if (isSupabaseConfigured) {
      const { data: existing, error: findErr } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (findErr || !existing) {
        const err = new Error('Dompet tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }

      const updates = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.color_code !== undefined) updates.color_code = parsed.color_code;
      if (parsed.initial_balance !== undefined) {
        updates.initial_balance = parsed.initial_balance;
      }

      const { data, error } = await supabase
        .from('wallets')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      return {
        ...data,
        initial_balance: Number(data.initial_balance),
        balance: Number(data.balance),
      };
    }

    const db = readLocalDb();
    const wallet = db.wallets.find((w) => w.id === id && w.user_id === userId);
    if (!wallet) {
      const err = new Error('Dompet tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    if (parsed.name !== undefined) wallet.name = parsed.name;
    if (parsed.color_code !== undefined) wallet.color_code = parsed.color_code;
    if (parsed.initial_balance !== undefined) {
      const diff = Number(parsed.initial_balance) - Number(wallet.initial_balance);
      wallet.initial_balance = Number(parsed.initial_balance);
      wallet.balance = Number(wallet.balance) + diff;
    }

    writeLocalDb(db);
    return wallet;
  },

  async deleteById(id, userId, supabase) {
    if (isSupabaseConfigured) {
      const { count, error: countErr } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or(`wallet_id.eq.${id},to_wallet_id.eq.${id}`);

      if (countErr) throw new Error(countErr.message);

      if ((count || 0) > 0) {
        const err = new Error(
          `Dompet tidak dapat dihapus karena masih memiliki ${count} riwayat transaksi. Hapus atau pindahkan transaksinya terlebih dahulu.`
        );
        err.statusCode = 400;
        throw err;
      }

      const { error } = await supabase
        .from('wallets')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
      return;
    }

    const db = readLocalDb();
    const walletIndex = db.wallets.findIndex((w) => w.id === id && w.user_id === userId);
    if (walletIndex === -1) {
      const err = new Error('Dompet tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const relatedTxCount = db.transactions.filter(
      (t) => t.user_id === userId && (t.wallet_id === id || t.to_wallet_id === id)
    ).length;

    if (relatedTxCount > 0) {
      const err = new Error(
        `Dompet tidak dapat dihapus karena masih memiliki ${relatedTxCount} riwayat transaksi. Hapus atau pindahkan transaksinya terlebih dahulu.`
      );
      err.statusCode = 400;
      throw err;
    }

    db.wallets.splice(walletIndex, 1);
    writeLocalDb(db);
  },
};

export default Wallet;
