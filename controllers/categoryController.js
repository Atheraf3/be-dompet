import asyncHandler from '../middleware/asyncHandler.js';
import Category from '../models/Category.js';

export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.findAllForUser(
    req.user.id,
    req.query.type,
    req.supabase
  );
  res.status(200).json(categories);
});

export const createCategory = asyncHandler(async (req, res) => {
  try {
    const category = await Category.create(req.user.id, req.body, req.supabase);
    res.status(201).json(category);
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});

export const deleteCategory = asyncHandler(async (req, res) => {
  try {
    await Category.deleteById(req.params.id, req.user.id, req.supabase);
    res.status(200).json({
      message: 'Kategori kustom berhasil dihapus.',
    });
  } catch (err) {
    if (err.statusCode) res.status(err.statusCode);
    throw err;
  }
});
