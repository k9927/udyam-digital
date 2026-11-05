import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Business, Consent } from '../models/index.js';
import { DOC_TYPES, DOC_FIELDS, sameEnterprise } from '../libs/kycRules.js';
import { gstinChecksumValid, normalizeUdyam } from '../libs/kycParse.js';
import { encrypt, hmac, maskGstin, maskUdyam } from '../libs/security.js';
import { putObject, getObject, deleteObject, storageDriver } from '../libs/storage.js';
import { config } from '../libs/config.js';
import { gstRow, udyamRow } from '../services/reference.js';
import { evaluateBusiness, activeConsent, afterKycChange, registryGst, registryUdyam, syncIdentity } from '../services/kycService.js';
import { ensureBusiness } from './quoteController.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

export function presentBusiness(business, { includeFields = true } = {}) {
  if (!business) return null;
  return {
    id: String(business._id), name: business.name, city: business.city, state: business.state, preferredLanguage: business.preferredLanguage, profile: business.profile,
    gst: business.gst?.masked ? { masked: business.gst.masked, legalName: business.gst.legalName, tradeName: business.gst.tradeName, constitution: business.gst.constitution, address: business.gst.address, state: business.gst.state, status: business.gst.status, verifiedAt: business.gst.verifiedAt } : null,
    udyam: business.udyam?.masked ? { masked: business.udyam.masked, enterpriseName: business.udyam.enterpriseName, enterpriseType: business.udyam.enterpriseType, majorActivity: business.udyam.majorActivity, city: business.udyam.city, state: business.udyam.state, verifiedAt: business.udyam.verifiedAt } : null,
    kyc: {
      status: business.kyc?.status, tier: business.kyc?.tier, verifiedAt: business.kyc?.verifiedAt, expiresAt: business.kyc?.expiresAt, checkedAt: business.kyc?.checkedAt,
      missing: business.kyc?.missing || [], failed: business.kyc?.failed || [], warnings: business.kyc?.warnings || [],
      reviewRequests: (business.kyc?.reviewRequests || []).map(request => ({ docType: request.docType, message: request.message, at: request.at, resolved: Boolean(request.resolvedAt) })),
      decisions: (business.kyc?.decisions || []).map(decision => ({ decision: decision.decision, note: decision.note, at: decision.at })),
    },
    registration: { path: business.registration?.path || null, declared: business.registration?.declared?.name ? { name: business.registration.declared.name, address: business.registration.declared.address, city: business.registration.declared.city, state: business.registration.declared.state, activity: business.registration.declared.activity } : null, udyamAssistStartedAt: business.registration?.udyamAssist?.startedAt || null },
    ownerKyc: business.ownerKyc?.verifiedAt ? { name: business.ownerKyc.name, aadhaar: `XXXX XXXX ${business.ownerKyc.last4}`, yearOfBirth: business.ownerKyc.yearOfBirth, verifiedAt: business.ownerKyc.verifiedAt } : null,
    documents: (business.documents || []).map(doc => ({ id: String(doc._id), type: doc.type, mime: doc.mime, size: doc.size, confidence: doc.confidence, status: doc.status, checks: doc.checks, uploadedAt: doc.uploadedAt, hasFile: Boolean(doc.storageKey), fields: includeFields ? doc.fields : undefined })),
  };
}

async function myBusiness(req) {
  return ensureBusiness(req.user);
}
async function requireConsent(req, business) {
  const consent = await activeConsent(req.user, business);
  if (!consent) throw new HttpError(403, 'Please give consent before we check your business details.');
  return consent;
}

export async function getMine(req, res) {
  const business = await myBusiness(req);
  const consent = await activeConsent(req.user, business);
  res.json({ business: presentBusiness(business), consent: consent && { grantedAt: consent.grantedAt, expiresAt: consent.expiresAt, purpose: consent.purpose }, storage: storageDriver() });
}

export async function updateMine(req, res) {
  const body = z.object({ name: z.string().trim().min(2).max(80).optional(), city: z.string().trim().max(60).optional(), state: z.string().trim().max(60).optional() }).parse(req.body);
  const business = await myBusiness(req);
  Object.assign(business, body);
  await business.save();
  res.json({ business: presentBusiness(business) });
}

export async function giveConsent(req, res) {
  const business = await myBusiness(req);
  const consent = await Consent.create({
    user: req.user._id, business: business._id, purpose: 'Verify business registration and process this connection application',
    scope: ['gst_udyam_registry_lookup', 'document_check', 'document_storage_for_review'], language: req.user.preferredLanguage,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  await audit(req.user, 'consent.given', 'Business', business._id, { consent: String(consent._id) });
  res.status(201).json({ consent: { grantedAt: consent.grantedAt, expiresAt: consent.expiresAt, purpose: consent.purpose } });
}

// Withdrawal ends consent; anything not yet verified (registry results, documents and stored files) is erased.
export async function withdrawConsent(req, res) {
  const business = await myBusiness(req);
  await Consent.updateMany({ user: req.user._id, business: business._id, withdrawnAt: null }, { $set: { withdrawnAt: new Date() } });
  let erased = 0;
  if (business.kyc.status !== 'verified') {
    for (const doc of business.documents) { await deleteObject(doc.storageKey).catch(() => {}); erased++; }
    business.documents = [];
    business.gst = undefined;
    business.udyam = undefined;
    business.ownerKyc = undefined;
    business.set('registration.declared', undefined);
    business.set('registration.path', null);
    syncIdentity(business);
    business.kyc = { status: 'not_started', tier: null, missing: [], failed: [], warnings: [], reviewRequests: business.kyc.reviewRequests, decisions: business.kyc.decisions };
    await business.save();
  }
  await audit(req.user, 'consent.withdrawn', 'Business', business._id, { erasedDocuments: erased });
  res.json({ withdrawn: true, erasedDocuments: erased, business: presentBusiness(business) });
}

// The second registration must be the same enterprise as the first (both orders: GST then Udyam, or Udyam then GST).
const where = (name, city, state) => ({ name, place: [city, state].filter(Boolean).join(', ') });
function requireSameEnterprise(gst, udyam, existing) {
  const match = sameEnterprise(gst, udyam);
  if (match.same) return;
  const gstSide = where(gst.trade_name, gst.principal_place_of_business?.split(',').slice(-2, -1)[0]?.trim(), gst.state);
  const udyamSide = where(udyam.enterprise_name, udyam.city, udyam.state);
  const [entered, current] = existing === 'udyam' ? [gstSide, udyamSide] : [udyamSide, gstSide];
  throw new HttpError(409, `This registration is for ${entered.name} (${entered.place}), but your ${existing === 'udyam' ? 'Udyam' : 'GST'} registration is for ${current.name} (${current.place}). Both must be for the same business.`, { code: 'registry_mismatch', existing, entered, current, reasons: match.reasons });
}

// Once verified, the business's identity is fixed: re-checking the same number is fine, swapping it is not.
function guardRegistry(business, kind, numberHash) {
  const record = kind === 'gst' ? business.gst : business.udyam;
  const stored = kind === 'gst' ? record?.gstinHash : record?.numberHash;
  if (business.kyc.status === 'verified' && stored && stored !== numberHash) {
    throw new HttpError(409, `Your business is verified with ${kind === 'gst' ? 'GSTIN' : 'Udyam number'} ${record.masked}. To switch to a different business, contact support.`, { code: 'registry_locked', kind, masked: record.masked });
  }
}

// An owner can remove a registration entered by mistake, until the business is verified.
export async function removeRegistry(req, res) {
  const kind = req.params.kind;
  if (!['gst', 'udyam'].includes(kind)) throw new HttpError(404, 'Not found.');
  const business = await myBusiness(req);
  if (business.kyc.status === 'verified') throw new HttpError(409, 'Your business is verified. To change its registration, contact support.', { code: 'registry_locked', kind });
  business[kind] = undefined;
  syncIdentity(business);
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, `kyc.${kind}_removed`, 'Business', business._id);
  res.json({ business: presentBusiness(business) });
}

export async function lookupGstin(req, res) {
  const business = await myBusiness(req);
  await requireConsent(req, business);
  const gstin = String(req.body?.gstin || '').trim().toUpperCase();
  if (!gstinChecksumValid(gstin)) throw new HttpError(400, 'That is not a valid GSTIN. Check the 15 characters.');
  const row = await gstRow(gstin);
  if (!row) throw new HttpError(404, 'This GSTIN is not in the GST registry.');
  guardRegistry(business, 'gst', hmac(gstin));
  requireSameEnterprise({ gstin, ...row }, registryUdyam(business), 'udyam');
  business.set('registration.path', 'registered');
  business.gst = { gstinEnc: encrypt(gstin), gstinHash: hmac(gstin), masked: maskGstin(gstin), legalName: row.legal_name, tradeName: row.trade_name, constitution: row.constitution, address: row.principal_place_of_business, state: row.state, status: row.status, registrationDate: row.registration_date, verifiedAt: new Date() };
  syncIdentity(business);
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, 'kyc.gstin_lookup', 'Business', business._id, { status: row.status });
  res.json({ found: true, status: row.status, active: row.status === 'Active', business: presentBusiness(business) });
}

export async function lookupUdyam(req, res) {
  const business = await myBusiness(req);
  await requireConsent(req, business);
  const number = normalizeUdyam(req.body?.udyam);
  if (!number) throw new HttpError(400, 'Use the format UDYAM-XX-00-0000000.');
  const row = await udyamRow(number);
  if (!row) throw new HttpError(404, 'This Udyam number is not in the Udyam registry.');
  guardRegistry(business, 'udyam', hmac(number));
  requireSameEnterprise(registryGst(business), row, 'gst');
  business.set('registration.path', 'registered');
  business.udyam = { numberEnc: encrypt(number), numberHash: hmac(number), masked: maskUdyam(number), enterpriseName: row.enterprise_name, enterpriseType: row.enterprise_type, majorActivity: row.major_activity, city: row.city, state: row.state, verifiedAt: new Date() };
  syncIdentity(business);
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, 'kyc.udyam_lookup', 'Business', business._id);
  res.json({ found: true, business: presentBusiness(business) });
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export async function uploadDocument(req, res) {
  const business = await myBusiness(req);
  await requireConsent(req, business);
  if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
  const type = String(req.body?.type || '');
  if (!DOC_TYPES.includes(type)) throw new HttpError(400, 'Choose a supported document type.');
  let fields = {};
  try { fields = JSON.parse(req.body?.fields || '{}'); } catch { fields = {}; }
  const clean = Object.fromEntries(DOC_FIELDS[type].map(key => [key, String(fields?.[key] || '').slice(0, 200)]));
  const confidence = Math.max(0, Math.min(100, Math.round(Number(req.body?.confidence) || 0)));
  const key = `kyc/${business._id}/${type.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.${EXT[req.file.mimetype]}`;
  await putObject(key, req.file.buffer, req.file.mimetype);
  const previous = business.documents.find(doc => doc.type === type);
  if (previous) { await deleteObject(previous.storageKey).catch(() => {}); business.documents.pull(previous._id); }
  business.documents.push({ type, storageKey: key, storageDriver: storageDriver(), mime: req.file.mimetype, size: req.file.size, confidence, fields: clean, looksLike: DOC_TYPES.includes(req.body?.looksLike) && req.body.looksLike !== type ? req.body.looksLike : undefined, uploadedAt: new Date() });
  await business.save();
  await evaluateBusiness(business, { trigger: 'documents' });
  await audit(req.user, 'kyc.document_uploaded', 'Business', business._id, { type });
  res.status(201).json({ business: presentBusiness(business) });
}

export async function deleteDocument(req, res) {
  const business = await myBusiness(req);
  const doc = business.documents.find(item => item.type === req.params.type);
  if (!doc) throw new HttpError(404, 'Document not found.');
  await deleteObject(doc.storageKey).catch(() => {});
  business.documents.pull(doc._id);
  await business.save();
  await evaluateBusiness(business, { trigger: 'documents' });
  res.json({ business: presentBusiness(business) });
}

// The owner believes a failed check is wrong: send it to a KYC officer instead of re-uploading.
export async function requestReview(req, res) {
  const business = await myBusiness(req);
  if (!['action_needed', 'documents_needed'].includes(business.kyc.status) || !business.documents.length) throw new HttpError(409, 'There is nothing to review right now.');
  business.kyc.status = 'in_review';
  business.kyc.submittedForReviewAt = new Date();
  business.kyc.decisions.push({ decision: 'owner_requested_review', note: String(req.body?.note || '').slice(0, 300), at: new Date(), by: req.user._id });
  await business.save();
  await afterKycChange(business, 'in_review');
  res.json({ business: presentBusiness(business) });
}

// Streams a stored document to its owner or to KYC/ops staff (every staff view is audited).
export async function viewDocument(req, res) {
  const business = await Business.findOne({ 'documents._id': req.params.docId });
  const doc = business?.documents.id(req.params.docId);
  if (!doc?.storageKey) throw new HttpError(404, 'Document not found.');
  const isOwner = String(business.owner) === String(req.user._id);
  if (!isOwner && !['kyc_officer', 'ops_admin', 'super_admin'].includes(req.user.role)) throw new HttpError(403, 'You do not have access to this document.');
  if (!isOwner) await audit(req.user, 'kyc.document_viewed', 'Business', business._id, { type: doc.type });
  const { stream, contentType } = await getObject(doc.storageKey);
  res.set('Content-Type', contentType || doc.mime || 'application/octet-stream');
  res.set('Cache-Control', 'private, no-store');
  // A stored document is only ever displayed, never run, even when opened in its own tab.
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  if (stream.pipe) stream.pipe(res); else res.send(Buffer.from(await stream.transformToByteArray()));
}

// Demo helper: the 12 specimen applicants from the case pack, for trying Smart KYC quickly.
const specimenDir = path.join(config.dataDir, 'specimens');
export function listSpecimens(req, res) {
  const applicants = {};
  for (const name of fs.readdirSync(specimenDir).filter(file => /^K\d{2}_[a-z_]+\.png$/.test(file))) (applicants[name.slice(0, 3)] ||= []).push(name);
  res.json({ applicants });
}
export function specimenFile(req, res) {
  const name = path.basename(req.params.name);
  if (!/^K\d{2}_[a-z_]+\.png$/.test(name)) throw new HttpError(404, 'Not found.');
  res.sendFile(path.join(specimenDir, name));
}
