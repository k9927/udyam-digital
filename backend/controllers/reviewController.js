import { z } from 'zod';
import { Business, User } from '../models/index.js';
import { DOC_TYPES } from '../libs/kycRules.js';
import { afterKycChange } from '../services/kycService.js';
import { presentBusiness } from './kycController.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

// KYC officers see only flagged applications and only what failed or needs a human look.
export async function queue(req, res) {
  const status = req.query.status === 'decided' ? { $in: ['verified', 'rejected', 'action_needed'] } : 'in_review';
  const businesses = await Business.find({ 'kyc.status': status, ...(req.query.status === 'decided' ? { 'kyc.decisions.0': { $exists: true } } : {}) }).sort({ 'kyc.submittedForReviewAt': 1, updatedAt: -1 }).limit(50).lean();
  res.json({
    businesses: businesses.map(business => ({
      id: String(business._id), name: business.name, city: business.city, status: business.kyc.status, tier: business.kyc.tier,
      submittedAt: business.kyc.submittedForReviewAt || business.updatedAt, waitingHours: Math.round((Date.now() - new Date(business.kyc.submittedForReviewAt || business.updatedAt)) / 3_600_000),
      flags: [...(business.kyc.failed || []), ...(business.kyc.warnings || [])].map(item => `${item.type}: ${item.label}`),
      ownerRequested: business.kyc.decisions?.some(decision => decision.decision === 'owner_requested_review'),
    })),
  });
}

export async function detail(req, res) {
  const business = await Business.findById(req.params.id);
  if (!business) throw new HttpError(404, 'Application not found.');
  const owner = await User.findById(business.owner).select('name preferredLanguage').lean();
  await audit(req.user, 'kyc.review_opened', 'Business', business._id);
  res.json({ business: presentBusiness(business), owner: { name: owner?.name, language: owner?.preferredLanguage } });
}

export async function decide(req, res) {
  const body = z.object({ decision: z.enum(['approve', 'reject', 'request_reupload']), docType: z.enum(DOC_TYPES).optional(), message: z.string().trim().max(400).default('') }).parse(req.body);
  const business = await Business.findById(req.params.id);
  if (!business) throw new HttpError(404, 'Application not found.');
  if (body.decision === 'request_reupload' && (!body.docType || !body.message)) throw new HttpError(400, 'Say which document to re-upload and why.');
  const ownerPath = business.registration?.path === 'unregistered' && !business.gst?.masked && !business.udyam?.masked;
  if (body.decision === 'approve' && !(business.gst?.status === 'Active' || business.udyam?.verifiedAt || (ownerPath && business.ownerKyc?.verifiedAt))) throw new HttpError(409, 'A verified GST or Udyam registration, or the owner\u2019s Aadhaar e-KYC, is required before approval.');
  business.kyc.decisions.push({ decision: body.decision, note: body.message || body.docType, at: new Date(), by: req.user._id });
  if (body.decision === 'approve') {
    business.kyc.status = 'verified';
    business.kyc.tier = business.gst?.status === 'Active' ? 'gst' : business.udyam?.verifiedAt ? 'udyam' : 'owner';
    business.kyc.verifiedAt = new Date();
    business.kyc.expiresAt = new Date(Date.now() + 365 * 86_400_000);
  } else if (body.decision === 'reject') {
    business.kyc.status = 'rejected';
  } else {
    business.kyc.status = 'action_needed';
    business.kyc.reviewRequests.push({ docType: body.docType, message: body.message, at: new Date(), by: req.user._id });
    business.kyc.failed.push({ type: body.docType, status: 'fail', label: 'Reviewer asked for a new upload', detail: body.message });
    const doc = business.documents.find(item => item.type === body.docType);
    if (doc) { doc.status = 'fail'; doc.checks.push({ status: 'fail', label: 'Reviewer asked for a new upload', detail: body.message }); }
  }
  await business.save();
  await audit(req.user, `kyc.${body.decision}`, 'Business', business._id, { docType: body.docType });
  await afterKycChange(business, business.kyc.status);
  res.json({ business: presentBusiness(business) });
}
