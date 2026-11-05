import mongoose from 'mongoose';

// One-time codes for login, e-sign, delivery hand-over and installation sign-off. Stored hashed; expire automatically.
const otpSchema = new mongoose.Schema({
  purpose: { type: String, enum: ['login', 'esign', 'delivery', 'install', 'aadhaar'], required: true },
  target: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  consumedAt: Date,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpCode = mongoose.model('OtpCode', otpSchema);
