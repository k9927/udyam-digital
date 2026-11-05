import mongoose from 'mongoose';

export const ROLES = ['customer', 'partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin', 'super_admin'];

const userSchema = new mongoose.Schema({
  role: { type: String, enum: ROLES, required: true, index: true },
  name: { type: String, trim: true, default: '' },
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  preferredLanguage: { type: String, default: 'en-IN' },
  region: { cities: [String], states: [String], languages: [String] },
  active: { type: Boolean, default: true },
  demo: { type: Boolean, default: false },
  lastLoginAt: Date,
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
