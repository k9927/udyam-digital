import { z } from 'zod';
import { Case, Lead, Order, Business, Quote, User } from '../models/index.js';
import { notifyCustomer } from '../services/notify.js';
import { HttpError } from '../middlewares/error.js';
import { languageName } from '../services/routing.js';
import { decrypt, maskPhone } from '../libs/security.js';

const NEXT_STEP = {
  callback: 'Call the owner, answer their question, and log the outcome.',
  kyc_help: 'Explain exactly which document check failed and send them the link to re-upload.',
  payment_failed: 'Call to help retry the UPI payment, or suggest another UPI app.',
  abandoned_quote: 'Their quote is saved but not ordered. Call to answer questions and send the link to continue.',
  sla_risk: 'Installation is late. Call the owner with the new date and coordinate with operations.',
  cancelled: 'Find out why they cancelled; offer a better-fitting bundle if it helps.',
  no_registration: 'Help them get a free Udyam registration, then send the link to verify.',
  lead: 'Stalled lead from the historical quarter, ranked by the propensity model.',
};
const LINK = { kyc_help: '/app/kyc', payment_failed: '/app/orders/:order', callback: '/app/orders/:order', sla_risk: '/app/orders/:order', abandoned_quote: '/quote/:quote', cancelled: '/advisor', no_registration: '/app/kyc' };

async function presentCase(item, { detail = false, viewerId = null } = {}) {
  const business = item.business ? await Business.findById(item.business).lean() : null;
  const order = item.order ? await Order.findById(item.order).lean() : null;
  const quote = item.quote ? await Quote.findById(item.quote).lean() : null;
  // Website callers carry their own number; everyone else is reached through the business owner's account.
  const ownerId = business?.owner || order?.owner || quote?.owner;
  const owner = !item.contactEnc && ownerId ? await User.findById(ownerId).lean() : null;
  const raw = item.contactEnc ? { name: item.contactName, phone: decrypt(item.contactEnc) } : owner?.phone ? { name: owner.name, phone: owner.phone } : null;
  const canSeeNumber = detail && viewerId && String(item.assignedTo) === String(viewerId);
  return {
    id: String(item._id), kind: item.kind, title: item.title, reason: item.reason, status: item.status, priority: item.priority, city: item.city, language: languageName(item.language),
    assignedTo: item.assignedTo ? String(item.assignedTo) : null, createdAt: item.createdAt, dueAt: item.dueAt, overdue: item.status !== 'resolved' && item.dueAt && item.dueAt < new Date(),
    nextStep: NEXT_STEP[item.kind],
    business: business && { name: business.name, city: business.city, state: business.state, kycStatus: business.kyc?.status, tier: business.kyc?.tier, gst: business.gst?.masked, udyam: business.udyam?.masked, failed: detail ? business.kyc?.failed : undefined },
    order: order && { id: String(order._id), ref: order.ref, status: order.status, bundleName: order.bundleName, monthly: order.totals?.monthly, slot: order.slot },
    quote: quote && { id: String(quote._id), bundleName: quote.result?.bundleName, monthly: quote.result?.totals?.monthly, savedAt: quote.savedAt },
    notes: detail ? item.notes.map(note => ({ text: note.text, outcome: note.outcome, at: note.at })) : undefined,
    // The full number is visible only to the partner the case is assigned to.
    contact: raw && { name: raw.name, phone: canSeeNumber ? raw.phone : maskPhone(raw.phone) },
  };
}

async function partnerCase(req) {
  const item = await Case.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Case not found.');
  if (req.user.role === 'partner' && item.assignedTo && String(item.assignedTo) !== String(req.user._id)) throw new HttpError(403, 'This case belongs to another partner.');
  return item;
}

export async function queue(req, res) {
  const filter = req.user.role === 'partner' ? { $or: [{ assignedTo: req.user._id }, { assignedTo: null }] } : {};
  const status = req.query.status === 'resolved' ? 'resolved' : { $ne: 'resolved' };
  const cases = await Case.find({ ...filter, status, kind: { $ne: 'lead' } }).sort({ priority: -1, createdAt: 1 }).limit(100).lean();
  const counts = await Case.aggregate([{ $match: { ...filter, status: { $ne: 'resolved' } } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]);
  res.json({ cases: await Promise.all(cases.map(item => presentCase(item))), counts: Object.fromEntries(counts.map(row => [row._id, row.n])) });
}

export async function detail(req, res) {
  res.json({ case: await presentCase(await partnerCase(req), { detail: true, viewerId: req.user._id }) });
}

export async function claim(req, res) {
  const item = await partnerCase(req);
  item.assignedTo = req.user._id;
  item.status = 'in_progress';
  item.notes.push({ by: req.user._id, text: `${req.user.name} took the case`, outcome: 'claimed' });
  await item.save();
  res.json({ case: await presentCase(item, { detail: true, viewerId: req.user._id }) });
}

export async function logOutcome(req, res) {
  const item = await partnerCase(req);
  const body = z.object({ outcome: z.enum(['called', 'no_answer', 'helped', 'not_interested', 'sent_link']), note: z.string().trim().max(500).default(''), resolve: z.boolean().default(false) }).parse(req.body);
  item.assignedTo ||= req.user._id;
  item.status = body.resolve ? 'resolved' : 'in_progress';
  if (body.resolve) item.resolvedAt = new Date();
  item.notes.push({ by: req.user._id, text: body.note || body.outcome.replace('_', ' '), outcome: body.outcome });
  await item.save();
  if (item.order) await Order.updateOne({ _id: item.order, partner: null }, { $set: { partner: req.user._id } });
  res.json({ case: await presentCase(item, { detail: true, viewerId: req.user._id }) });
}

// Assisted journey: the partner sends the owner a link back into their own flow; the owner still consents and verifies.
export async function sendLink(req, res) {
  const item = await partnerCase(req);
  const business = item.business ? await Business.findById(item.business).lean() : null;
  if (!business) throw new HttpError(409, 'This case has no customer to message.');
  const link = (LINK[item.kind] || '/app').replace(':order', String(item.order || '')).replace(':quote', String(item.quote || ''));
  await notifyCustomer(business.owner, 'partner_assigned', { name: req.user.name }, link);
  item.assignedTo ||= req.user._id;
  item.status = 'in_progress';
  item.notes.push({ by: req.user._id, text: `Sent link ${link}`, outcome: 'sent_link' });
  await item.save();
  if (item.order) await Order.updateOne({ _id: item.order, partner: null }, { $set: { partner: req.user._id } });
  res.json({ case: await presentCase(item, { detail: true, viewerId: req.user._id }), link });
}

const safeLead = lead => ({
  id: String(lead._id), leadId: lead.lead_id, segment: lead.segment, businessType: lead.business_type, city: lead.city, state: lead.state, language: lead.preferred_language,
  stage: lead.stage_reached, source: lead.lead_source, dropReason: lead.drop_reason, gstinPresent: lead.has_gstin === 'Y', udyamPresent: lead.has_udyam === 'Y',
  monthlySpend: Number(lead.monthly_telecom_spend_inr) || 0, score: lead.score, probability: lead.probability, reasons: lead.reasons,
  assignedToMe: lead.assignedTo ? String(lead.assignedTo) === String(lead._viewer) : false, assigned: Boolean(lead.assignedTo), followUp: lead.followUp,
});

export async function leads(req, res) {
  const q = String(req.query.q || '').trim(), segment = String(req.query.segment || '').trim(), scope = String(req.query.scope || 'region');
  const filter = { outcome: { $ne: 'Activated' } };
  if (segment) filter.segment = segment;
  if (q) filter.$or = ['lead_id', 'city', 'business_type', 'drop_reason', 'stage_reached'].map(key => ({ [key]: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }));
  if (req.user.role === 'partner' && scope === 'region' && (req.user.region?.cities?.length || req.user.region?.states?.length)) filter.$and = [{ $or: [{ city: { $in: req.user.region.cities || [] } }, { state: { $in: req.user.region.states || [] } }] }];
  if (scope === 'mine') filter.assignedTo = req.user._id;
  const [rows, total, high] = await Promise.all([
    Lead.find(filter).sort({ score: -1, probability: -1 }).limit(50).lean(),
    Lead.countDocuments(filter),
    Lead.countDocuments({ ...filter, score: { $gte: 90 } }),
  ]);
  res.json({ leads: rows.map(row => safeLead({ ...row, _viewer: req.user._id })), total, highPriority: high });
}

export async function claimLead(req, res) {
  const body = z.object({ outcome: z.enum(['claimed', 'called', 'no_answer', 'interested', 'not_interested', 'converted']).default('claimed'), note: z.string().max(300).optional() }).parse(req.body || {});
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw new HttpError(404, 'Lead not found.');
  if (lead.assignedTo && String(lead.assignedTo) !== String(req.user._id) && req.user.role === 'partner') throw new HttpError(409, 'Another partner already has this lead.');
  lead.assignedTo = req.user._id;
  lead.followUp = { status: ['not_interested', 'converted'].includes(body.outcome) ? 'closed' : 'open', outcome: body.outcome, at: new Date() };
  await lead.save();
  res.json({ lead: safeLead({ ...lead.toObject(), _viewer: req.user._id }) });
}

export async function activations(req, res) {
  const orders = await Order.find({ partner: req.user._id }).sort({ updatedAt: -1 }).lean();
  const rows = await Promise.all(orders.map(async order => {
    const business = await Business.findById(order.business).select('name city').lean();
    const commission = order.status === 'active' ? Math.round((order.totals?.subtotal || 0) * 12 * 0.08) : 0;
    return { id: String(order._id), ref: order.ref, business: business?.name, city: business?.city, status: order.status, monthly: order.totals?.monthly, activatedAt: order.activatedAt, commission };
  }));
  res.json({ orders: rows, totals: { active: rows.filter(row => row.status === 'active').length, inProgress: rows.filter(row => !['active', 'cancelled'].includes(row.status)).length, commission: rows.reduce((sum, row) => sum + row.commission, 0) } });
}
