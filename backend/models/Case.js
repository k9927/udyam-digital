import mongoose from 'mongoose';

export const CASE_KINDS = ['callback', 'kyc_help', 'payment_failed', 'abandoned_quote', 'sla_risk', 'cancelled', 'no_registration', 'lead'];

// Anything the digital journey could not close on its own, routed to a partner.
const caseSchema = new mongoose.Schema({
  kind: { type: String, enum: CASE_KINDS, required: true, index: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  quote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  title: String,
  contactName: String,
  contactEnc: String,
  reason: String,
  city: String,
  state: String,
  language: String,
  priority: { type: Number, default: 50 },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
  notes: [{ by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, text: String, outcome: String, at: { type: Date, default: Date.now } }],
  dueAt: Date,
  resolvedAt: Date,
}, { timestamps: true });

export const Case = mongoose.model('Case', caseSchema);
