import mongoose from 'mongoose';

export const ORDER_STATUSES = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed', 'active', 'cancelled'];

const item = new mongoose.Schema({ productId: String, name: String, category: String, unit: String, quantity: Number, monthly: Number, monthlyMax: Number, setup: Number, months: Number, installDays: Number, why: String }, { _id: false });
const event = new mongoose.Schema({ type: String, status: String, note: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, role: String, at: { type: Date, default: Date.now } }, { _id: false });

const orderSchema = new mongoose.Schema({
  ref: { type: String, unique: true, required: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  quote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
  kind: { type: String, enum: ['new', 'addon'], default: 'new' },
  bundleName: String,
  items: [item],
  totals: { type: mongoose.Schema.Types.Mixed },
  profile: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
  events: [event],
  signature: { signerName: String, signedAt: Date, documentHash: String },
  payments: [{ amount: Number, status: { type: String, enum: ['success', 'failed'] }, method: String, reason: String, reference: String, at: { type: Date, default: Date.now } }],
  paymentFailures: { type: Number, default: 0 },
  autopay: { type: Boolean, default: false },
  slot: { date: String, window: String },
  kit: [{ item: String, quantity: Number, serials: [String] }],
  // Encrypted hand-over codes, shown only to the owner (as an SMS would be); verification uses the hashed OTP record.
  handover: { type: mongoose.Schema.Types.Mixed, default: {} },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  callbackRequestedAt: Date,
  statusCalls: { type: Number, default: 0 },
  rating: { score: Number, comment: String, at: Date },
  paidAt: Date,
  activatedAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  dueBy: Date,
  slaBreached: { type: Boolean, default: false },
}, { timestamps: true });

export const Order = mongoose.model('Order', orderSchema);
