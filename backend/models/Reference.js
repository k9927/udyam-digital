import mongoose from 'mongoose';

// Reference data loaded from the synthetic pack: catalogue, mock GST and Udyam registries, historical leads.
const strict = { strict: false, timestamps: false };

export const Product = mongoose.model('Product', new mongoose.Schema({ product_id: { type: String, unique: true } }, strict));
export const GstRecord = mongoose.model('GstRecord', new mongoose.Schema({ gstin: { type: String, unique: true }, trade_name: { type: String, index: true } }, strict));
export const UdyamRecord = mongoose.model('UdyamRecord', new mongoose.Schema({ udyam_number: { type: String, unique: true } }, strict));

const leadSchema = new mongoose.Schema({
  lead_id: { type: String, unique: true },
  outcome: { type: String, index: true },
  segment: { type: String, index: true },
  city: { type: String, index: true },
  score: { type: Number, index: true },
  probability: Number,
  reasons: [String],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  followUp: { status: { type: String, default: 'open' }, outcome: String, at: Date },
}, strict);
export const Lead = mongoose.model('Lead', leadSchema);
