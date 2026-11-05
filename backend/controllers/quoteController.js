import { z } from 'zod';
import { Quote, Business, Order } from '../models/index.js';
import { buildQuote, normaliseProfile } from '../libs/pricing.js';
import { randomToken } from '../libs/security.js';
import { getCatalogue } from '../services/reference.js';
import { isVerified } from '../services/kycService.js';
import { HttpError } from '../middlewares/error.js';

const PRODUCT_ID = z.string().regex(/^P\d{2}$/);
const inputSchema = z.object({
  profile: z.record(z.any()).optional(),
  wants: z.array(PRODUCT_ID).max(10).optional(),
  budget: z.number().int().min(0).max(1_000_000).nullable().optional(),
  enabledAddons: z.array(PRODUCT_ID).max(15).optional(),
  quantities: z.record(z.number().int().min(1).max(25)).optional(),
  removed: z.array(PRODUCT_ID).max(10).optional(),
  language: z.string().max(8).optional(),
  mode: z.enum(['new', 'addon']).optional(),
  baseOrderId: z.string().optional(),
});

export async function ensureBusiness(user, profile = {}) {
  let business = await Business.findOne({ owner: user._id });
  if (!business) business = await Business.create({ owner: user._id, name: 'My business', profile: normaliseProfile(profile), preferredLanguage: user.preferredLanguage });
  return business;
}

const gstVerifiedFor = business => isVerified(business) && business.kyc.tier === 'gst';

async function compute(quote) {
  const business = quote.business ? await Business.findById(quote.business).lean() : null;
  quote.result = buildQuote({ profile: quote.profile, catalogue: await getCatalogue(), gstVerified: gstVerifiedFor(business), wants: quote.wants, budget: quote.budget, enabledAddons: quote.enabledAddons, quantities: quote.quantities, removed: quote.removed });
  quote.profile = quote.result.profile;
  quote.enabledAddons = quote.result.enabledAddons;
  quote.markModified('result');
  return { business };
}

export const presentQuote = (quote, business) => ({
  id: String(quote._id), status: quote.status, mode: quote.mode, profile: quote.profile, wants: quote.wants, budget: quote.budget, language: quote.language,
  result: quote.result, savedAt: quote.savedAt, createdAt: quote.createdAt,
  verification: business ? { status: business.kyc?.status, tier: business.kyc?.tier } : null,
});

async function loadQuote(req) {
  const quote = await Quote.findById(req.params.id);
  if (!quote) throw new HttpError(404, 'Quote not found.');
  const token = req.headers['x-quote-token'];
  const ownerMatch = req.user && quote.owner && String(quote.owner) === String(req.user._id);
  const staff = req.user && req.user.role !== 'customer';
  if (!ownerMatch && !staff && !(token && token === quote.accessToken)) throw new HttpError(404, 'Quote not found.');
  return quote;
}

export async function create(req, res) {
  const body = inputSchema.parse(req.body || {});
  const quote = new Quote({ profile: normaliseProfile(body.profile), wants: body.wants || [], budget: body.budget ?? null, enabledAddons: body.enabledAddons || [], quantities: body.quantities || {}, language: body.language || 'en-IN', accessToken: randomToken(), mode: body.mode || 'new' });
  if (req.user?.role === 'customer') {
    const business = await ensureBusiness(req.user, body.profile);
    quote.owner = req.user._id;
    quote.business = business._id;
    if (body.mode === 'addon' && body.baseOrderId) {
      const base = await Order.findOne({ _id: body.baseOrderId, owner: req.user._id }).lean();
      if (base) { quote.baseOrder = base._id; quote.profile = normaliseProfile(base.profile || body.profile); }
    }
  }
  const { business } = await compute(quote);
  await quote.save();
  res.status(201).json({ quote: presentQuote(quote, business), accessToken: quote.accessToken });
}

export async function get(req, res) {
  const quote = await loadQuote(req);
  const { business } = await compute(quote);
  if (quote.status !== 'ordered') await quote.save();
  res.json({ quote: presentQuote(quote, business) });
}

export async function update(req, res) {
  const quote = await loadQuote(req);
  if (quote.status === 'ordered') throw new HttpError(409, 'This quote is already ordered.');
  const body = inputSchema.parse(req.body || {});
  if (body.profile) quote.profile = normaliseProfile({ ...quote.profile, ...body.profile });
  for (const key of ['wants', 'enabledAddons', 'removed']) if (body[key]) quote[key] = body[key];
  if (body.budget !== undefined) quote.budget = body.budget;
  if (body.quantities) { quote.quantities = { ...(quote.quantities || {}), ...body.quantities }; quote.markModified('quantities'); }
  if (body.language) quote.language = body.language;
  const { business } = await compute(quote);
  await quote.save();
  res.json({ quote: presentQuote(quote, business) });
}

// Signing in turns an anonymous quote into a saved quote on the owner's business account.
export async function save(req, res) {
  const quote = await loadQuote(req);
  if (quote.owner && String(quote.owner) !== String(req.user._id)) throw new HttpError(404, 'Quote not found.');
  const business = await ensureBusiness(req.user, quote.profile);
  business.profile = quote.profile;
  await business.save();
  quote.owner = req.user._id;
  quote.business = business._id;
  if (quote.status === 'draft') { quote.status = 'saved'; quote.savedAt = new Date(); }
  await compute(quote);
  await quote.save();
  res.json({ quote: presentQuote(quote, business) });
}

export async function mine(req, res) {
  const quotes = await Quote.find({ owner: req.user._id }).sort({ updatedAt: -1 }).limit(20).lean();
  res.json({ quotes: quotes.map(quote => presentQuote(quote)) });
}
