import mongoose from 'mongoose';

// One conversation per mobile number, used both by the Meta webhook and by the demo simulator.
const sessionSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  language: { type: String, default: '' },
  state: { type: String, enum: ['menu', 'language', 'advisor', 'quoted'], default: 'menu' },
  profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  answered: [String],
  wants: [String],
  budget: Number,
  city: String,
  pending: String,
  quote: { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },
  callbackCaseAt: Date,
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  text: { type: String, default: '' },
  choices: [{ _id: false, id: String, label: String }],
  kind: { type: String, default: 'chat' },
  delivery: { type: String, enum: ['simulated', 'sent', 'failed', 'received'], default: 'simulated' },
}, { timestamps: true });
messageSchema.index({ phone: 1, createdAt: 1 });

export const WaSession = mongoose.model('WaSession', sessionSchema);
export const WaMessage = mongoose.model('WaMessage', messageSchema);
