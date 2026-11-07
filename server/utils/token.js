import jwt from 'jsonwebtoken';
import { httpError } from './httpError.js';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw httpError(500, 'JWT_SECRET is missing or too short. Put at least 32 random characters in .env');
  }
  return s;
}

/** `tokenVersion` (User.tokenVersion) lets "log out everywhere" invalidate every older token */
export const signToken = (userId, tokenVersion = 0) =>
  jwt.sign({ id: String(userId), tv: tokenVersion }, secret(), { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

/** Throws JsonWebTokenError / TokenExpiredError when invalid → errorMiddleware answers 401 */
export const verifyToken = (token) => jwt.verify(token, secret(), { algorithms: ['HS256'] });
