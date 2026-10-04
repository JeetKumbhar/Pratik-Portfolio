import mongoose from 'mongoose';

export default async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is missing. Copy .env.example to .env and fill it in.');

  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000, // fail fast with a clear error instead of hanging
  });

  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}
