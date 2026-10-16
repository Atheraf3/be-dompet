import express from 'express';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../controllers/transactionController.js';
import { protectedMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protectedMiddleware, getTransactions);
router.post('/', protectedMiddleware, createTransaction);
router.put('/:id', protectedMiddleware, updateTransaction);
router.delete('/:id', protectedMiddleware, deleteTransaction);

export default router;
