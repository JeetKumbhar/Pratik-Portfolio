import httpError from '../utils/httpError.js';

/** Use AFTER protect. */
export const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  return next(httpError(403, 'Admin access required.'));
};
