import mongoose from 'mongoose';

const quoteSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', index: true },
  accessToken: { type: String, index: true },
  mode: { type: String, enum: ['new', 'addon'], default: 'new' },
  baseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  profile: { type: mongoose.Schema.Types.Mixed, default: {} },
  wants: [String],
  budget: Number,
  enabledAddons: [String],
  quantities: { type: mongoose.Schema.Types.Mixed, default: {} },
  removed: [String],
  result: { type: mongoose.Schema.Types.Mixed },
  language: { type: String, default: 'en-IN' },
  status: { type: String, enum: ['draft', 'saved', 'ordered'], default: 'draft', index: true },
  savedAt: Date,
  followUpCaseAt: Date,
}, { timestamps: true });

export const Quote = mongoose.model('Quote', quoteSchema);
