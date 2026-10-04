import Package from '../models/Package.js';
import asyncHandler from '../utils/asyncHandler.js';

// @route GET /api/packages   (public)
export const getPackages = asyncHandler(async (req, res) => {
  const packages = await Package.find({ isActive: true }).sort({ sortOrder: 1, price: 1 });
  res.json({ success: true, count: packages.length, data: packages });
});

// TODO (admin phase): createPackage, updatePackage, deletePackage
