import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import 'dotenv/config';

// Polyfill global WebSocket for Node.js < 22 environments.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbFilePath = path.join(dataDir, 'local-db.json');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')
);

// Forward the caller's token so Supabase RLS policies evaluate auth.uid() per request.
export function getSupabaseClient(accessToken) {
  if (!isSupabaseConfigured) {
    return null;
  }

  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: ws,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : {},
  };

  return createClient(supabaseUrl, supabaseKey, options);
}

const DEFAULT_GLOBAL_CATEGORIES = [
  { id: 'cat-exp-food', user_id: null, type: 'expense', name: 'Makanan & Minuman', icon_name: 'Utensils', color_code: '#be123c' },
  { id: 'cat-exp-transport', user_id: null, type: 'expense', name: 'Transportasi', icon_name: 'Car', color_code: '#b45309' },
  { id: 'cat-exp-shopping', user_id: null, type: 'expense', name: 'Belanja Harian', icon_name: 'ShoppingBag', color_code: '#a21caf' },
  { id: 'cat-exp-bills', user_id: null, type: 'expense', name: 'Tagihan & Utilitas', icon_name: 'Receipt', color_code: '#0369a1' },
  { id: 'cat-exp-home', user_id: null, type: 'expense', name: 'Tempat Tinggal & Kos', icon_name: 'Home', color_code: '#4338ca' },
  { id: 'cat-exp-fun', user_id: null, type: 'expense', name: 'Hiburan & Rekreasi', icon_name: 'Film', color_code: '#7e22ce' },
  { id: 'cat-exp-health', user_id: null, type: 'expense', name: 'Kesehatan', icon_name: 'HeartPulse', color_code: '#dc2626' },
  { id: 'cat-exp-edu', user_id: null, type: 'expense', name: 'Pendidikan', icon_name: 'GraduationCap', color_code: '#0d9488' },
  { id: 'cat-exp-other', user_id: null, type: 'expense', name: 'Pengeluaran Lain', icon_name: 'MoreHorizontal', color_code: '#57534e' },
  { id: 'cat-inc-salary', user_id: null, type: 'income', name: 'Gaji Bulanan', icon_name: 'Briefcase', color_code: '#15803d' },
  { id: 'cat-inc-bonus', user_id: null, type: 'income', name: 'Bonus & Tunjangan', icon_name: 'Gift', color_code: '#0f766e' },
  { id: 'cat-inc-business', user_id: null, type: 'income', name: 'Hasil Usaha / Freelance', icon_name: 'Store', color_code: '#047857' },
  { id: 'cat-inc-invest', user_id: null, type: 'income', name: 'Imbal Hasil Investasi', icon_name: 'TrendingUp', color_code: '#1d4ed8' },
  { id: 'cat-inc-other', user_id: null, type: 'income', name: 'Penghasilan Lain', icon_name: 'PlusCircle', color_code: '#166534' },
];

function ensureDbFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(dbFilePath)) {
    const initial = {
      users: [],
      sessions: [],
      wallets: [],
      categories: DEFAULT_GLOBAL_CATEGORIES.map((c) => ({
        ...c,
        created_at: new Date().toISOString(),
      })),
      transactions: [],
    };
    fs.writeFileSync(dbFilePath, JSON.stringify(initial, null, 2), 'utf8');
  }
}

export function readLocalDb() {
  ensureDbFile();
  const parsed = JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
  if (!parsed.categories || parsed.categories.length === 0) {
    parsed.categories = DEFAULT_GLOBAL_CATEGORIES.map((c) => ({
      ...c,
      created_at: new Date().toISOString(),
    }));
  }
  return parsed;
}

export function writeLocalDb(db) {
  ensureDbFile();
  fs.writeFileSync(dbFilePath, JSON.stringify(db, null, 2), 'utf8');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, originalHash] = (storedHash || '').split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(originalHash, 'hex')
  );
}

// Mirrors fn_sync_wallet_balance in supabase/schema.sql for local persistence mode.
export function applyTransactionBalanceEffect(wallets, transaction, direction = 1) {
  const amount = Number(transaction.amount) * direction;
  const sourceWallet = wallets.find((w) => w.id === transaction.wallet_id);

  if (transaction.type === 'income' && sourceWallet) {
    sourceWallet.balance = Number(sourceWallet.balance) + amount;
  } else if (transaction.type === 'expense' && sourceWallet) {
    sourceWallet.balance = Number(sourceWallet.balance) - amount;
  } else if (transaction.type === 'transfer') {
    if (sourceWallet) {
      sourceWallet.balance = Number(sourceWallet.balance) - amount;
    }
    const targetWallet = wallets.find((w) => w.id === transaction.to_wallet_id);
    if (targetWallet) {
      targetWallet.balance = Number(targetWallet.balance) + amount;
    }
  }
}
