// Verify once, reuse: runs document checks against the verified registry records, decides the business's
// verification state, tells the owner exactly what to do, and moves waiting orders on when verified.
import { Business, Order, Consent } from '../models/index.js';
import { checkDocuments, decide } from '../libs/kycRules.js';
import { decrypt } from '../libs/security.js';
import { deleteObject } from '../libs/storage.js';
import { validateLines } from '../libs/pricing.js';
import { lookups, getCatalogue } from './reference.js';
import { notifyCustomer } from './notify.js';
import { openCase, resolveCases } from './routing.js';
import { setStatus } from './orderFlow.js';

export const registryGst = business => (business.gst?.gstinEnc ? {
  gstin: decrypt(business.gst.gstinEnc), status: business.gst.status, legal_name: business.gst.legalName,
  trade_name: business.gst.tradeName, principal_place_of_business: business.gst.address, state: business.gst.state,
} : null);
export const registryUdyam = business => (business.udyam?.numberEnc ? {
  udyam_number: decrypt(business.udyam.numberEnc), enterprise_name: business.udyam.enterpriseName, city: business.udyam.city, state: business.udyam.state,
} : null);

// The registry decides who the business is and where it is (GST first, else Udyam), so the name and location
// can never lag behind a replaced registration. Partner and field-staff routing use this city and state.
const cityFromAddress = address => String(address || '').split(',').slice(-2, -1)[0]?.trim() || '';
export function syncIdentity(business) {
  if (business.gst?.tradeName) Object.assign(business, { name: business.gst.tradeName, city: cityFromAddress(business.gst.address) || business.udyam?.city || business.city, state: business.gst.state || business.udyam?.state || business.state });
  else if (business.udyam?.enterpriseName) Object.assign(business, { name: business.udyam.enterpriseName, city: business.udyam.city, state: business.udyam.state });
  else if (business.registration?.path === 'unregistered' && business.registration.declared?.name) {
    const { name, city, state } = business.registration.declared;
    Object.assign(business, { name, city, state });
  } else Object.assign(business, { name: 'My business', city: undefined, state: undefined });
  return business;
}

// Run at start-up: corrects any business whose name or location lags behind its registrations.
// Documents that belong to the registered path. An owner who switches to verifying without registration
// should not carry another identity's certificates (often a demo sample) into the new checks.
export const REGISTERED_ONLY_DOCS = ['GST certificate', 'Udyam certificate', 'Signatory ID'];
export async function dropRegisteredOnlyDocuments(business) {
  const dropped = business.documents.filter(doc => REGISTERED_ONLY_DOCS.includes(doc.type));
  for (const doc of dropped) await deleteObject(doc.storageKey).catch(() => {});
  business.documents = business.documents.filter(doc => !REGISTERED_ONLY_DOCS.includes(doc.type));
  return dropped.map(doc => doc.type);
}

// Startup repair for businesses that switched path before the clean-up above existed.
export async function repairUnregisteredDocuments() {
  const rows = await Business.find({ 'registration.path': 'unregistered', 'kyc.status': { $ne: 'verified' }, 'documents.type': { $in: REGISTERED_ONLY_DOCS } });
  for (const business of rows) {
    await dropRegisteredOnlyDocuments(business);
    await evaluateBusiness(business, { trigger: 'registry' });
  }
  return rows.length;
}

export async function repairBusinessIdentities() {
  let repaired = 0;
  for (const business of await Business.find({ $or: [{ 'gst.tradeName': { $exists: true } }, { 'udyam.enterpriseName': { $exists: true } }, { 'registration.declared.name': { $exists: true } }] })) {
    const before = `${business.name}|${business.city}|${business.state}`;
    syncIdentity(business);
    if (`${business.name}|${business.city}|${business.state}` !== before) { await business.save(); repaired++; }
  }
  return repaired;
}

export async function activeConsent(user, business) {
  return Consent.findOne({ user: user._id, business: business._id, withdrawnAt: null, expiresAt: { $gt: new Date() } }).sort({ grantedAt: -1 });
}

const NOTIFY = { verified: 'kyc_verified', action_needed: 'kyc_action_needed', in_review: 'kyc_in_review' };

export async function evaluateBusiness(business, { trigger = 'documents' } = {}) {
  const gst = registryGst(business), udyam = registryUdyam(business);
  const documents = business.documents.map(doc => ({ type: doc.type, confidence: doc.confidence, fields: doc.fields || {}, looksLike: doc.looksLike }));
  const unregistered = business.registration?.path === 'unregistered';
  const owner = business.ownerKyc?.verifiedAt ? { name: business.ownerKyc.name } : null;
  const declared = unregistered ? business.registration?.declared : null;
  const { results } = await checkDocuments({ documents, gst: gst?.status ? gst : null, udyam, lookups, owner, declared });
  for (const doc of business.documents) {
    const result = results.find(item => item.type === doc.type);
    if (result) { doc.status = result.status; doc.checks = result.checks; }
  }
  const outstandingRequest = business.kyc.reviewRequests?.find(request => !request.resolvedAt && !business.documents.some(doc => doc.type === request.docType && doc.uploadedAt > request.at));
  const decision = decide({ gst: gst?.status ? gst : null, udyam, results, unregistered, owner });
  const previous = business.kyc.status;
  let status = decision.status;
  if (outstandingRequest && status === 'verified') status = 'action_needed';
  if (previous === 'verified' && trigger === 'reuse') status = 'verified';
  Object.assign(business.kyc, {
    status, tier: decision.tier, checkedAt: new Date(), missing: decision.missing, failed: decision.failed, warnings: decision.warnings,
  });
  for (const request of business.kyc.reviewRequests || []) if (!request.resolvedAt && business.documents.some(doc => doc.type === request.docType && doc.uploadedAt > request.at)) request.resolvedAt = new Date();
  if (status === 'verified' && previous !== 'verified') { business.kyc.verifiedAt = new Date(); business.kyc.expiresAt = new Date(Date.now() + 365 * 86_400_000); }
  if (status === 'in_review') business.kyc.submittedForReviewAt ||= new Date();
  await business.save();
  if (status !== previous) await afterKycChange(business, status);
  return business;
}

export async function afterKycChange(business, status) {
  if (NOTIFY[status]) await notifyCustomer(business.owner, NOTIFY[status], { count: business.kyc.failed.length || business.kyc.missing.length }, '/app/kyc');
  if (status === 'action_needed') {
    await openCase({ kind: 'kyc_help', business: business._id, title: `${business.name}: documents need attention`, reason: business.kyc.failed.map(item => `${item.type}: ${item.label}`).join('; ') || 'Re-upload requested', city: business.city, state: business.state, language: business.preferredLanguage, ownerId: business.owner });
  }
  if (status === 'verified') {
    await resolveCases({ business: business._id, kind: 'kyc_help' }, 'Business verified');
    await promoteWaitingOrders(business);
  }
}

// Orders placed before verification move to signature once the business is verified and still eligible.
export async function promoteWaitingOrders(business) {
  const catalogue = await getCatalogue();
  const waiting = await Order.find({ business: business._id, status: 'awaiting_kyc' });
  for (const order of waiting) {
    const error = validateLines(order.items, order.profile, catalogue, business.kyc.tier === 'gst');
    if (error) { await setStatus(order, 'cancelled', { note: `Not eligible after verification: ${error}`, role: 'system' }); continue; }
    await setStatus(order, 'awaiting_signature', { note: `Business verified (${business.kyc.tier === 'gst' ? 'GST' : 'Udyam'})`, role: 'system' });
  }
}

export const isVerified = business => business?.kyc?.status === 'verified' && (!business.kyc.expiresAt || business.kyc.expiresAt > new Date());
