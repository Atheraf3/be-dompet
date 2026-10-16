import crypto from 'node:crypto';
import { z } from 'zod';
import {
  getSupabaseClient,
  hashPassword,
  isSupabaseConfigured,
  readLocalDb,
  verifyPassword,
  writeLocalDb,
} from './db.js';

export const userAuthSchema = z.object({
  email: z.string().email('Inputan harus berupa email yang valid.'),
  password: z.string().min(6, 'Password minimal 6 karakter.'),
  name: z.string().trim().max(100).optional(),
});

const User = {
  async register({ name, email, password }) {
    const parsed = userAuthSchema.parse({ name, email, password });
    const normalizedEmail = parsed.email.trim().toLowerCase();

    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: parsed.password,
        options: {
          data: { name: parsed.name || normalizedEmail.split('@')[0] },
        },
      });

      if (error) {
        const err = new Error(error.message);
        err.statusCode = 400;
        throw err;
      }

      const token = data.session?.access_token || null;
      if (token && data.user) {
        const authedClient = getSupabaseClient(token);
        await authedClient.from('wallets').insert({
          user_id: data.user.id,
          name: 'Dompet Utama',
          color_code: '#0f766e',
          initial_balance: 0,
          balance: 0,
        });
      }

      return {
        user: data.user
          ? {
              id: data.user.id,
              email: data.user.email,
              name: data.user.user_metadata?.name || normalizedEmail.split('@')[0],
            }
          : null,
        access_token: token,
        requires_email_confirmation: !token,
      };
    }

    const db = readLocalDb();
    const exists = db.users.some((u) => u.email === normalizedEmail);
    if (exists) {
      const err = new Error('Email tersebut sudah terdaftar. Silakan masuk menggunakan akun Anda.');
      err.statusCode = 400;
      throw err;
    }

    const userId = crypto.randomUUID();
    const newUser = {
      id: userId,
      email: normalizedEmail,
      name: parsed.name || normalizedEmail.split('@')[0],
      password_hash: hashPassword(parsed.password),
      created_at: new Date().toISOString(),
    };

    const token = crypto.randomBytes(32).toString('hex');
    db.users.push(newUser);
    db.sessions.push({
      token,
      user_id: userId,
      created_at: new Date().toISOString(),
    });

    db.wallets.push({
      id: crypto.randomUUID(),
      user_id: userId,
      name: 'Dompet Utama',
      color_code: '#0f766e',
      initial_balance: 0,
      balance: 0,
      created_at: new Date().toISOString(),
    });

    writeLocalDb(db);

    return {
      user: { id: newUser.id, email: newUser.email, name: newUser.name },
      access_token: token,
      requires_email_confirmation: false,
    };
  },

  async login({ email, password }) {
    const parsed = userAuthSchema.parse({ email, password });
    const normalizedEmail = parsed.email.trim().toLowerCase();

    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: parsed.password,
      });

      if (error || !data.session) {
        const err = new Error(error?.message || 'Email atau password salah.');
        err.statusCode = 401;
        throw err;
      }

      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0],
        },
        access_token: data.session.access_token,
      };
    }

    const db = readLocalDb();
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user || !verifyPassword(parsed.password, user.password_hash)) {
      const err = new Error('Email atau password tidak sesuai.');
      err.statusCode = 401;
      throw err;
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.sessions.push({
      token,
      user_id: user.id,
      created_at: new Date().toISOString(),
    });
    writeLocalDb(db);

    return {
      user: { id: user.id, email: user.email, name: user.name },
      access_token: token,
    };
  },

  async verifyToken(token) {
    if (isSupabaseConfigured) {
      const supabase = getSupabaseClient(token);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return null;
      }
      return {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email?.split('@')[0],
        },
        supabase,
      };
    }

    const db = readLocalDb();
    const session = db.sessions.find((s) => s.token === token);
    if (!session) return null;

    const user = db.users.find((u) => u.id === session.user_id);
    if (!user) return null;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      supabase: null,
    };
  },

  async logout(token, supabaseClient) {
    if (isSupabaseConfigured && supabaseClient) {
      await supabaseClient.auth.signOut();
      return;
    }

    const db = readLocalDb();
    db.sessions = db.sessions.filter((s) => s.token !== token);
    writeLocalDb(db);
  },
};

export default User;
