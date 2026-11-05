import mongoose from 'mongoose';

const check = new mongoose.Schema({ status: String, label: String, detail: String }, { _id: false });
const issue = new mongoose.Schema({ type: String, status: String, label: String, detail: String }, { _id: false });

const documentSchema = new mongoose.Schema({
  type: { type: String, enum: ['GST certificate', 'Udyam certificate', 'Address proof', 'Signatory ID', 'Shop licence', 'Shop photo'], required: true },
  storageKey: String,
  storageDriver: String,
  mime: String,
  size: Number,
  confidence: Number,
  fields: { type: mongoose.Schema.Types.Mixed, default: {} },
  looksLike: String,
  status: { type: String, enum: ['pass', 'warn', 'fail', 'pending'], default: 'pending' },
  checks: [check],
  uploadedAt: { type: Date, default: Date.now },
});

const businessSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: 'My business' },
  profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  city: String,
  state: String,
  preferredLanguage: { type: String, default: 'en-IN' },
  gst: {
    gstinEnc: String, gstinHash: { type: String, index: true }, masked: String,
    legalName: String, tradeName: String, constitution: String, address: String, state: String, status: String, registrationDate: String, verifiedAt: Date,
  },
  udyam: {
    numberEnc: String, numberHash: { type: String, index: true }, masked: String,
    enterpriseName: String, enterpriseType: String, majorActivity: String, city: String, state: String, verifiedAt: Date,
  },
  kyc: {
    status: { type: String, enum: ['not_started', 'registry_needed', 'documents_needed', 'action_needed', 'in_review', 'verified', 'rejected'], default: 'not_started', index: true },
    // owner: an unregistered business verified through its owner's Aadhaar e-KYC and proof of the shop.
    tier: { type: String, enum: ['gst', 'udyam', 'owner', null], default: null },
    checkedAt: Date, verifiedAt: Date, expiresAt: Date, submittedForReviewAt: Date,
    missing: [String], failed: [issue], warnings: [issue],
    reviewRequests: [{ docType: String, message: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, resolvedAt: Date }],
    decisions: [{ decision: String, note: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  },
  // Unregistered businesses: what the owner declared, and the Udyam registration assistant's progress.
  registration: {
    path: { type: String, enum: ['registered', 'unregistered', null], default: null },
    declared: { name: String, address: String, city: String, state: String, activity: String, declaredAt: Date },
    udyamAssist: { startedAt: Date, remindedAt: Date, escalatedAt: Date },
  },
  // The owner's Aadhaar e-KYC. Only the last 4 digits and a keyed hash are kept, never the number.
  ownerKyc: { method: String, last4: String, name: String, yearOfBirth: Number, verifiedAt: Date },
  documents: [documentSchema],
  assignedPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Business = mongoose.model('Business', businessSchema);
