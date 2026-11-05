import mongoose from 'mongoose';

// Field work: kit delivery, installation, and service visits raised from support tickets.
const jobSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
  ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  type: { type: String, enum: ['delivery', 'installation', 'service'], required: true },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, enum: ['waiting', 'scheduled', 'in_progress', 'done', 'failed'], default: 'scheduled', index: true },
  slot: { date: String, window: String },
  city: String,
  address: String,
  checklist: { startedAt: Date, arrivedAt: Date, installedAt: Date, speedMbps: Number, photoKey: String, photoMime: String, photoAt: Date, signedOffAt: Date, notes: String },
  attempts: { type: Number, default: 0 },
  failReason: String,
  history: [{ status: String, note: String, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
  completedAt: Date,
}, { timestamps: true });

export const Job = mongoose.model('Job', jobSchema);
