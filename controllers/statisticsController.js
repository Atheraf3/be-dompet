import asyncHandler from '../middleware/asyncHandler.js';
import Transaction from '../models/Transaction.js';

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await Transaction.getSummary(
    req.user.id,
    req.query,
    req.supabase
  );
  res.status(200).json(summary);
});

export const getChart = asyncHandler(async (req, res) => {
  const chart = await Transaction.getChart(
    req.user.id,
    req.query,
    req.supabase
  );
  res.status(200).json(chart);
});
