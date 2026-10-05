import Package from '../models/Package.js';
import asyncHandler from '../utils/asyncHandler.js';
import { PACKAGE_CATEGORIES } from '../config/constants.js';

// @route GET /api/packages                    (public)  every active package
// @route GET /api/packages?category=wedding   (public)  active packages for that shoot type + the "general" ones
export const getPackages = asyncHandler(async (req, res) => {
  const filter = { active: true };
  const { category } = req.query;

  if (category !== undefined) {
    if (typeof category !== 'string' || !PACKAGE_CATEGORIES.includes(category)) {
      const err = new Error(`Invalid category. Use one of: ${PACKAGE_CATEGORIES.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    filter.category = category === 'general' ? 'general' : { $in: ['general', category] };
  }

  const packages = await Package.find(filter).sort({ sortOrder: 1, price: 1 });
  res.json({ success: true, count: packages.length, data: packages });
});

// TODO (admin phase): getAllPackages (incl. inactive), createPackage, updatePackage, deletePackage
