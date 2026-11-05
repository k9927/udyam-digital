// Creates (or resets the password of) the platform super admin from ADMIN_EMAIL / ADMIN_PASSWORD in .env.
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from './db/connect.js';
import { User } from './models/index.js';
import { config } from './libs/config.js';

await connectDB();
const passwordHash = await bcrypt.hash(config.adminPassword, 10);
const admin = await User.findOneAndUpdate(
  { email: config.adminEmail.toLowerCase() },
  { $set: { role: 'super_admin', passwordHash, active: true }, $setOnInsert: { name: 'Platform Admin' } },
  { upsert: true, returnDocument: 'after' },
);
console.log(`Super admin ready: ${admin.email}`);
await disconnectDB();
