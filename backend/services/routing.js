// Routes work to people: partners by city > state > language > lightest load; field staff by city > lightest load.
import { Case, Job, User } from '../models/index.js';
import { notifyStaff, notifyCustomer } from './notify.js';

const LANGUAGE_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'gu-IN': 'Gujarati', 'bn-IN': 'Bengali', 'ml-IN': 'Malayalam', 'pa-IN': 'Punjabi' };
export const languageName = code => LANGUAGE_NAMES[code] || code || 'English';

async function leastLoaded(users, countFor) {
  if (!users.length) return null;
  const loads = await Promise.all(users.map(async user => ({ user, load: await countFor(user._id) })));
  return loads.sort((a, b) => a.load - b.load)[0].user;
}

export async function pickPartner({ city, state, language }) {
  const partners = await User.find({ role: 'partner', active: true }).lean();
  const lang = languageName(language);
  const tiers = [
    partners.filter(p => city && p.region?.cities?.some(c => c.toLowerCase() === city.toLowerCase())),
    partners.filter(p => state && p.region?.states?.some(s => s.toLowerCase() === state.toLowerCase())),
    partners.filter(p => p.region?.languages?.includes(lang)),
    partners,
  ];
  const pool = tiers.find(group => group.length) || [];
  return leastLoaded(pool, id => Case.countDocuments({ assignedTo: id, status: { $ne: 'resolved' } }));
}

export async function pickFieldStaff(role, city) {
  const staff = await User.find({ role, active: true }).lean();
  const local = staff.filter(user => city && user.region?.cities?.some(c => c.toLowerCase() === city.toLowerCase()));
  return leastLoaded(local.length ? local : staff, id => Job.countDocuments({ assignee: id, status: { $in: ['scheduled', 'in_progress', 'waiting'] } }));
}

const PRIORITY = { callback: 90, payment_failed: 85, sla_risk: 80, kyc_help: 70, cancelled: 60, abandoned_quote: 55, no_registration: 50, lead: 40 };

// Opens a case once per (kind, order|business|quote); assigns a partner and tells both sides.
export async function openCase({ kind, business, order, quote, title, reason, city, state, language, ownerId }) {
  const key = { kind, status: { $ne: 'resolved' } };
  if (order) key.order = order; else if (quote) key.quote = quote; else if (business) key.business = business;
  const existing = order || quote || business ? await Case.findOne(key) : null;
  if (existing) return existing;
  const partner = await pickPartner({ city, state, language });
  const created = await Case.create({ kind, business, order, quote, title, reason, city, state, language, priority: PRIORITY[kind] ?? 50, assignedTo: partner?._id, dueAt: new Date(Date.now() + 24 * 3600_000) });
  if (partner) {
    await notifyStaff(partner._id, `New case: ${title}`, reason, `/partner/cases/${created._id}`);
    if (ownerId && ['callback', 'kyc_help', 'payment_failed'].includes(kind)) await notifyCustomer(ownerId, 'partner_assigned', { name: partner.name });
  }
  return created;
}

export async function resolveCases(filter, note = 'Resolved automatically') {
  await Case.updateMany({ ...filter, status: { $ne: 'resolved' } }, { $set: { status: 'resolved', resolvedAt: new Date() }, $push: { notes: { text: note, outcome: 'auto' } } });
}
