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

  // Tokens made before "log out everywhere" existed have no `tv`: they count as version 0, like a user who never used it
  if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) throw httpError(401, 'Your session has ended. Please log in again.');

  req.user = user;
  req.tokenInfo = { issuedAt: decoded.iat, expiresAt: decoded.exp };
  next();
});
