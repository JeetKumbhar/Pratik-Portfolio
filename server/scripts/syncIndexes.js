
/**
 * npm run sync:indexes
 * Makes the indexes in Atlas match the models exactly (drops ones that no longer exist in a schema,
 * creates new ones). Run it after you change an index in a model.
 * Needed once now: BlockedDate.date used to be UNIQUE, and it must not be any more.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import '../models/index.js';

try {
  await connectDB();
  for (const [name, model] of Object.entries(mongoose.models)) {
    const dropped = await model.syncIndexes();
    console.log(`${name}: ${dropped.length ? `dropped index ${dropped.join(', ')}` : 'indexes already up to date'}`);
  }
  console.log('Done.');
} catch (err) {
  console.error('sync:indexes failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
