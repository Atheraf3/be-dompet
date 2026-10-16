import asyncHandler from '../middleware/asyncHandler.js';
import Wallet from '../models/Wallet.js';

export const getWallets = asyncHandler(async (req, res) => {
  const wallets = await Wallet.findAllByUser(req.user.id, req.supabase);
  res.status(200).json(wallets);
});

export const createWallet = asyncHandler(async (req, res) => {
  try {
    const wallet = await Wallet.create(req.user.id, req.body, req.supabase);
    res.status(201).json(wallet);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const updateWallet = asyncHandler(async (req, res) => {
  try {
    const wallet = await Wallet.updateById(
      req.params.id,
      req.user.id,
      req.body,
      req.supabase
    );
    res.status(200).json(wallet);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const deleteWallet = asyncHandler(async (req, res) => {
  try {
    await Wallet.deleteById(req.params.id, req.user.id, req.supabase);
    res.status(200).json({
      message: 'Dompet berhasil dihapus.',
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});
