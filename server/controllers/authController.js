import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { httpError } from '../utils/httpError.js';
import { signToken } from '../utils/token.js';

// Compared against when the email doesn't exist, so "unknown email" and "wrong password" take the same time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

// @route POST /api/auth/login   { email, password }  → { token, user }
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw httpError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !valid) throw httpError(401, 'Invalid email or password');

  res.json({ success: true, token: signToken(user._id), user });
});

// @route GET /api/auth/me   (needs a token) → who am I
export const getMe = (req, res) => res.json({ success: true, user: req.user });
