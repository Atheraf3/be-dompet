import express from 'express';
import {
  getCategories,
  createCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import { protectedMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protectedMiddleware, getCategories);
router.post('/', protectedMiddleware, createCategory);
router.delete('/:id', protectedMiddleware, deleteCategory);

export default router;
