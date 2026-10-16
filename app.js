import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import statisticsRoutes from './routes/statisticsRoutes.js';
import { errorHandler, notFoundPath } from './middleware/errorMiddleware.js';
import { isSupabaseConfigured } from './models/db.js';

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'be-dompet',
    storage_mode: isSupabaseConfigured ? 'supabase' : 'local',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/statistics', statisticsRoutes);

app.use(notFoundPath);
app.use(errorHandler);

if (isSupabaseConfigured) {
  console.log('Berhasil terhubung ke Supabase PostgreSQL');
} else {
  console.log('Berjalan dengan penyimpanan lokal (data/local-db.json)');
}

app.listen(port, () => {
  console.log(`Berjalan di port ${port}`);
});
