import { httpError } from '../utils/httpError.js';

/** Use AFTER protect: router.use(protect, adminOnly) */
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return next(httpError(403, 'Admin access only.'));
  return next();
};
