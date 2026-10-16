import asyncHandler from './asyncHandler.js';
import User from '../models/User.js';

export const protectedMiddleware = asyncHandler(async (req, res, next) => {
  let token = req.cookies?.jwt || null;

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    res.status(401);
    throw new Error('Token tidak ada, silakan login terlebih dahulu.');
  }

  const verified = await User.verifyToken(token);
  if (!verified || !verified.user) {
    res.status(401);
    throw new Error('Token tidak valid atau sesi telah berakhir, silakan login kembali.');
  }

  req.user = verified.user;
  req.accessToken = token;
  req.supabase = verified.supabase || null;
  next();
});
