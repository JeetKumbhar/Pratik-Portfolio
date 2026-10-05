import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import asyncHandler from '../utils/asyncHandler.js';
import httpError from '../utils/httpError.js';

// Compared against when the email doesn't exist, so "no such user" takes as long as "wrong password"
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const signToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// @route POST /api/auth/login   { email, password }  → { token, user }
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw httpError(400, 'Email and password are required.');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
  const valid = user ? await user.matchPassword(password) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !valid) throw httpError(401, 'Invalid email or password.'); // same message either way

  res.json({ success: true, token: signToken(user), user });
});

// @route GET /api/auth/me   (needs token)
export const getMe = (req, res) => {
  res.json({ success: true, user: req.user });
};

// TODO (auth phase): logout / httpOnly-cookie storage, change password
