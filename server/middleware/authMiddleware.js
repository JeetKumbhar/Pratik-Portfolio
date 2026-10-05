import { User } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { verifyToken } from '../utils/token.js';

/** Requires:  Authorization: Bearer <token>   → sets req.user */
export const protect = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw httpError(401, 'Not authorized. Please log in.');

  const decoded = verifyToken(token); // invalid / expired → errorMiddleware answers 401
  const user = await User.findById(decoded.id);
  if (!user) throw httpError(401, 'Not authorized. Please log in again.');

  req.user = user;
  next();
});
