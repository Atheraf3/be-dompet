import asyncHandler from '../middleware/asyncHandler.js';
import User from '../models/User.js';
import { isSupabaseConfigured } from '../models/db.js';

const setAuthCookie = (token, res) => {
  if (!token) return;
  const cookieOptions = {
    expires: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookie('jwt', token, cookieOptions);
};

export const registerUser = asyncHandler(async (req, res) => {
  try {
    const result = await User.register({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    });

    setAuthCookie(result.access_token, res);
    res.status(201).json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const loginUser = asyncHandler(async (req, res) => {
  if (!req.body.email || !req.body.password) {
    res.status(400);
    throw new Error('Email dan password harus diisi.');
  }

  try {
    const result = await User.login({
      email: req.body.email,
      password: req.body.password,
    });

    setAuthCookie(result.access_token, res);
    res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const currentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.status(404);
    throw new Error('User tidak ditemukan.');
  }

  res.status(200).json({
    user: req.user,
    storage_mode: isSupabaseConfigured ? 'supabase' : 'local',
  });
});

export const logoutUser = asyncHandler(async (req, res) => {
  await User.logout(req.accessToken, req.supabase);

  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(Date.now()),
  });

  res.status(200).json({
    message: 'Logout berhasil.',
  });
});
