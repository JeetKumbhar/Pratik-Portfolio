import 'dotenv/config'; // must be first: loads .env before anything reads process.env
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';

import connectDB from './config/db.js';
import './models/index.js'; // registers all models
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

import packageRoutes from './routes/packageRoutes.js';
// Later phases:
import authRoutes from './routes/authRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
// import portfolioRoutes from './routes/portfolioRoutes.js';
// import clientRoutes from './routes/clientRoutes.js';
// import messageRoutes from './routes/messageRoutes.js';

const app = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd) app.set('trust proxy', 1); // behind a hosting proxy: needed for correct rate-limit IPs

// ---------- Global middleware ----------
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10kb' }));
if (!isProd) app.use(morgan('dev'));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// ---------- Routes ----------
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: DB_STATES[mongoose.connection.readyState] ?? 'unknown', time: new Date().toISOString() });
});

app.use('/api/packages', packageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
// app.use('/api/portfolio', portfolioRoutes);
// app.use('/api/clients', clientRoutes);
// app.use('/api/messages', messageRoutes);

// ---------- Errors (must be last) ----------
app.use(notFound);
app.use(errorHandler);

// ---------- Start ----------
function explainMongoError(err) {
  const msg = String(err.message);
  if (/bad auth|authentication failed/i.test(msg)) return 'Wrong database username or password in MONGO_URI. (Special characters in the password must be URL-encoded.)';
  if (/ENOTFOUND|querySrv/i.test(msg)) return 'Could not find the cluster. Check the host in MONGO_URI, and your internet connection.';
  if (/ECONNREFUSED|Server selection timed out|could not connect to any servers/i.test(msg)) return 'Could not reach Atlas. In Atlas → Network Access, add your current IP address (or 0.0.0.0/0 while developing).';
  if (/IndexOptionsConflict|IndexKeySpecsConflict|different options|same name/i.test(msg)) return 'A model index changed. Run:  npm run sync:indexes   then start the server again.';
  return null;
}

async function start() {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32 || /^replace-with/i.test(secret)) {
    console.error('\nCould not start: JWT_SECRET in .env is missing, shorter than 32 characters, or still the placeholder.');
    console.error('Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }

  try {
    await connectDB();
    // Make sure every unique/other index exists before accepting requests
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  } catch (err) {
    console.error(`\nCould not start: ${err.message}`);
    const hint = explainMongoError(err);
    if (hint) console.error(`Hint: ${hint}`);
    process.exit(1);
  }

  const server = app.listen(PORT, (err) => {
    // Express 5 passes startup errors (e.g. "port already in use") to this callback
    if (err) {
      console.error(`Could not listen on port ${PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`Server running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
