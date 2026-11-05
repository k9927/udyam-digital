import { Product, GstRecord, UdyamRecord } from '../models/index.js';
import { similarity } from '../libs/kycRules.js';

let catalogueCache = null;
const clean = ({ _id, __v, ...rest }) => rest;

export async function getCatalogue() {
  catalogueCache ||= (await Product.find().sort({ product_id: 1 }).lean()).map(clean);
  return catalogueCache;
}
export const invalidateCatalogue = () => { catalogueCache = null; };

export const gstRow = async gstin => (gstin ? GstRecord.findOne({ gstin: String(gstin).trim().toUpperCase() }).lean() : null);
export const udyamRow = async number => (number ? UdyamRecord.findOne({ udyam_number: String(number).trim().toUpperCase() }).lean() : null);
export async function gstByTradeName(tradeName, address) {
  if (!tradeName) return null;
  const candidates = await GstRecord.find({ trade_name: tradeName }).lean();
  return candidates.find(row => similarity(row.principal_place_of_business, address) >= 0.9) || null;
}
export const lookups = { gstRow, udyamRow, gstByTradeName };
