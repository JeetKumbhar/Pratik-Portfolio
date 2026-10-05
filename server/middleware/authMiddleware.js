import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';

/** Requires "Authorization: Bearer <token>". Puts the logged-in user on req.user. */
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw httpError(401, 'Not authorized. Please log in.');

  // Throws JsonWebTokenError / TokenExpiredError → errorHandler turns those into a 401
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

  const user = await User.findById(payload.id);
  if (!user) throw httpError(401, 'Not authorized. Please log in.');

  req.user = user;
  next();
});
