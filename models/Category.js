import crypto from 'node:crypto';
import { z } from 'zod';
import { isSupabaseConfigured, readLocalDb, writeLocalDb } from './db.js';

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi.').max(100),
  type: z.enum(['income', 'expense'], {
    errorMap: () => ({ message: 'Tipe kategori harus income atau expense.' }),
  }),
  icon_name: z.string().trim().min(1).max(50).default('Tag'),
  color_code: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Kode warna harus berformat hex.')
    .default('#0f766e'),
});

const Category = {
  async findAllForUser(userId, type, supabase) {
    if (isSupabaseConfigured) {
      let query = supabase
        .from('categories')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('created_at', { ascending: true });

      if (type === 'income' || type === 'expense') {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    const db = readLocalDb();
    return db.categories.filter((c) => {
      const matchesOwner = c.user_id === null || c.user_id === userId;
      const matchesType = type === 'income' || type === 'expense' ? c.type === type : true;
      return matchesOwner && matchesType;
    });
  },

  async create(userId, payload, supabase) {
    const parsed = categoryCreateSchema.parse(payload);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          user_id: userId,
          name: parsed.name,
          type: parsed.type,
          icon_name: parsed.icon_name,
          color_code: parsed.color_code,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return data;
    }

    const db = readLocalDb();
    const newCategory = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: parsed.name,
      type: parsed.type,
      icon_name: parsed.icon_name,
      color_code: parsed.color_code,
      created_at: new Date().toISOString(),
    };

    db.categories.push(newCategory);
    writeLocalDb(db);
    return newCategory;
  },

  async deleteById(id, userId, supabase) {
    if (isSupabaseConfigured) {
      const { data: cat } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (!cat) {
        const err = new Error('Kategori tidak ditemukan.');
        err.statusCode = 404;
        throw err;
      }

      if (cat.user_id === null) {
        const err = new Error('Kategori sistem bawaan tidak dapat dihapus.');
        err.statusCode = 400;
        throw err;
      }

      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('category_id', id);

      if ((count || 0) > 0) {
        const err = new Error(
          `Kategori ini sedang digunakan pada ${count} transaksi dan tidak dapat dihapus.`
        );
        err.statusCode = 400;
        throw err;
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
      return;
    }

    const db = readLocalDb();
    const catIndex = db.categories.findIndex((c) => c.id === id);
    if (catIndex === -1) {
      const err = new Error('Kategori tidak ditemukan.');
      err.statusCode = 404;
      throw err;
    }

    const cat = db.categories[catIndex];
    if (cat.user_id === null) {
      const err = new Error('Kategori sistem bawaan tidak dapat dihapus.');
      err.statusCode = 400;
      throw err;
    }
    if (cat.user_id !== userId) {
      const err = new Error('Anda tidak memiliki akses untuk menghapus kategori ini.');
      err.statusCode = 403;
      throw err;
    }

    const usedCount = db.transactions.filter(
      (t) => t.user_id === userId && t.category_id === id
    ).length;

    if (usedCount > 0) {
      const err = new Error(
        `Kategori ini sedang digunakan pada ${usedCount} transaksi dan tidak dapat dihapus.`
      );
      err.statusCode = 400;
      throw err;
    }

    db.categories.splice(catIndex, 1);
    writeLocalDb(db);
  },
};

export default Category;
