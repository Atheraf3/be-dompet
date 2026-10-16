import asyncHandler from '../middleware/asyncHandler.js';
import Transaction from '../models/Transaction.js';

export const getTransactions = asyncHandler(async (req, res) => {
  const transactions = await Transaction.findAllByUser(
    req.user.id,
    req.query,
    req.supabase
  );
  res.status(200).json(transactions);
});

export const createTransaction = asyncHandler(async (req, res) => {
  try {
    const transaction = await Transaction.create(
      req.user.id,
      req.body,
      req.supabase
    );
    res.status(201).json(transaction);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const updateTransaction = asyncHandler(async (req, res) => {
  try {
    const transaction = await Transaction.updateById(
      req.params.id,
      req.user.id,
      req.body,
      req.supabase
    );
    res.status(200).json(transaction);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const deleteTransaction = asyncHandler(async (req, res) => {
  try {
    await Transaction.deleteById(req.params.id, req.user.id, req.supabase);
    res.status(200).json({
      message: 'Transaksi berhasil dihapus dan saldo dompet telah disesuaikan.',
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});
