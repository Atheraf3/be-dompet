import express from 'express';
import {
  getWallets,
  createWallet,
  updateWallet,
  deleteWallet,
} from '../controllers/walletController.js';
import { protectedMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protectedMiddleware, getWallets);
router.post('/', protectedMiddleware, createWallet);
router.put('/:id', protectedMiddleware, updateWallet);
router.delete('/:id', protectedMiddleware, deleteWallet);

export default router;
