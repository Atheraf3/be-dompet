import express from 'express';
import {
  getSummary,
  getChart,
} from '../controllers/statisticsController.js';
import { protectedMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/summary', protectedMiddleware, getSummary);
router.get('/chart', protectedMiddleware, getChart);

export default router;
