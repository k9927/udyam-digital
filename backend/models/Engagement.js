import mongoose from 'mongoose';

const id = ref => ({ type: mongoose.Schema.Types.ObjectId, ref });

export const Notification = mongoose.model('Notification', new mongoose.Schema({
  user: { ...id('User'), required: true, index: true },
  kind: String,
  title: String,
  body: String,
  channel: { type: String, enum: ['sms', 'whatsapp', 'in_app'], default: 'whatsapp' },
  link: String,
  language: String,
  read: { type: Boolean, default: false },
}, { timestamps: true }));

export const Ticket = mongoose.model('Ticket', new mongoose.Schema({
  business: { ...id('Business'), required: true, index: true },
  owner: id('User'),
  order: id('Order'),
  category: { type: String, enum: ['no_internet', 'slow_speed', 'billing', 'device', 'other'], default: 'other' },
  subject: String,
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
  messages: [{ by: id('User'), role: String, text: String, at: { type: Date, default: Date.now } }],
  visitJob: id('Job'),
  resolvedAt: Date,
}, { timestamps: true }));

export const Invoice = mongoose.model('Invoice', new mongoose.Schema({
  business: { ...id('Business'), required: true, index: true },
  number: { type: String, unique: true },
  period: String,
  lines: [{ productId: String, name: String, quantity: Number, amount: Number, orderRef: String }],
  subtotal: Number,
  tax: Number,
  oneTime: Number,
  total: Number,
  status: { type: String, enum: ['due', 'paid'], default: 'due' },
  dueDate: Date,
  paidAt: Date,
  autopay: Boolean,
}, { timestamps: true }));

export const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
  actor: id('User'),
  role: String,
  action: { type: String, index: true },
  target: String,
  targetId: String,
  meta: mongoose.Schema.Types.Mixed,
}, { timestamps: true }));

export const DataRequest = mongoose.model('DataRequest', new mongoose.Schema({
  user: { ...id('User'), required: true },
  business: id('Business'),
  type: { type: String, enum: ['access', 'correction', 'erasure'], required: true },
  note: String,
  status: { type: String, enum: ['received', 'completed'], default: 'received' },
  // For erasure: what actually happened (KYC records of a live service are kept as telecom KYC rules require).
  outcome: { type: String, enum: ['erased', 'retained_legal', 'nothing_held'] },
  dueBy: Date,
}, { timestamps: true }));
