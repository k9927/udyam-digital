import mongoose from 'mongoose';
import { config } from '../libs/config.js';

export async function connectDB(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export const disconnectDB = () => mongoose.disconnect();
