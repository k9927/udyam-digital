import mongoose from 'mongoose';

// DPDP consent record: what the owner agreed to, for which purpose, and when it ended.
const consentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  purpose: { type: String, required: true },
  scope: [String],
  noticeVersion: { type: String, default: '2026-11' },
  language: String,
  grantedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  withdrawnAt: Date,
}, { timestamps: true });

export const Consent = mongoose.model('Consent', consentSchema);
