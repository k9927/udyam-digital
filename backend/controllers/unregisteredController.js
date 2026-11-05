// Businesses with neither GST nor Udyam: verify the owner (Aadhaar e-KYC) and the shop, or get Udyam with guidance.
import { z } from 'zod';
import { User } from '../models/index.js';
import { aadhaarValid, normalizeAadhaar } from '../libs/aadhaar.js';
import { hmac, maskPhone, sha256 } from '../libs/security.js';
import { documentSvg, shopPhotoSvg } from '../libs/specimenArt.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { evaluateBusiness, activeConsent, syncIdentity, dropRegisteredOnlyDocuments } from '../services/kycService.js';
import { audit } from '../services/audit.js';
import { ensureBusiness } from './quoteController.js';
import { presentBusiness } from './kycController.js';
import { HttpError } from '../middlewares/error.js';

async function consentedBusiness(req) {
  const business = await ensureBusiness(req.user);
  if (!(await activeConsent(req.user, business))) throw new HttpError(403, 'Please give consent before we check your business details.');
  return business;
}
const lockedIfVerified = business => {
  if (business.kyc.status === 'verified') throw new HttpError(409, 'Your business is already verified. To change its details, contact support.', { code: 'registry_locked' });
};

const declareSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(80),
  address: z.string().trim().min(8, 'Enter the shop address.').max(200),
  city: z.string().trim().min(2, 'Enter the city.').max(60),
  state: z.string().trim().min(2, 'Enter the state.').max(60),
  activity: z.string().trim().max(120).default(''),
});

export async function declare(req, res) {
  const body = declareSchema.parse(req.body);
  const business = await consentedBusiness(req);
  lockedIfVerified(business);
  if (business.gst?.masked || business.udyam?.masked) throw new HttpError(409, 'This business already has a GST or Udyam registration. Remove it first to continue without registration.');
  business.set('registration.path', 'unregistered');
  business.set('registration.declared', { ...body, declaredAt: new Date() });
  const removed = await dropRegisteredOnlyDocuments(business);
  syncIdentity(business);
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, 'kyc.unregistered_declared', 'Business', business._id, { city: body.city, ...(removed.length ? { removed: removed.join(', ') } : {}) });
  res.json({ business: presentBusiness(business) });
}

// Aadhaar e-KYC (simulated, like e-sign and UPI): an OTP goes to the Aadhaar-linked mobile; the number is never stored.
const otpTarget = (req, aadhaar) => `${req.user._id}:${hmac(`aadhaar:${aadhaar}`)}`;
const aadhaarSchema = z.object({ aadhaar: z.string().transform(normalizeAadhaar).refine(aadhaarValid, 'That is not a valid Aadhaar number. Check the 12 digits.') });

export async function requestAadhaarOtp(req, res) {
  const { aadhaar } = aadhaarSchema.parse(req.body);
  const business = await consentedBusiness(req);
  lockedIfVerified(business);
  const { devCode } = await issueOtp('aadhaar', otpTarget(req, aadhaar));
  res.json({ sentTo: maskPhone(req.user.phone), devCode });
}

export async function verifyAadhaar(req, res) {
  const { aadhaar, code, name } = aadhaarSchema.extend({ code: z.string().trim().min(4).max(8), name: z.string().trim().min(2).max(80).optional() }).parse(req.body);
  if (!req.user.name && !name) throw new HttpError(400, 'Enter your full name as it appears on your Aadhaar.');
  const business = await consentedBusiness(req);
  lockedIfVerified(business);
  await verifyOtp('aadhaar', otpTarget(req, aadhaar), code);
  if (!req.user.name && name) { await User.updateOne({ _id: req.user._id }, { $set: { name } }); req.user.name = name; }
  // A real e-KYC response returns the resident's name, year of birth and address. The simulation returns the name on
  // this account, so a licence or bill in someone else's name is still caught by the document checks.
  const seed = parseInt(sha256(aadhaar).slice(0, 6), 16);
  business.set('ownerKyc', { method: 'aadhaar_otp', last4: aadhaar.slice(-4), name: req.user.name, yearOfBirth: 1962 + (seed % 40), verifiedAt: new Date() });
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, 'kyc.aadhaar_ekyc', 'Business', business._id, { last4: aadhaar.slice(-4) });
  res.json({ business: presentBusiness(business) });
}

// The Udyam assistant: what to keep ready, the owner's details pre-filled, and a suggested activity (NIC) code.
const NIC = {
  retail: { code: '47', label: 'Retail trade (shops, pharmacies, salons: pick the closest 4-digit code)' },
  professional: { code: '86 / 69 / 70', label: 'Health, legal, accounting or consulting services' },
  multi: { code: '5610', label: 'Restaurants and food service' },
  manufacturing: { code: '10–33', label: 'Manufacturing: pick the code for what you make' },
};
function guide(business, user) {
  const declared = business.registration?.declared || {};
  const nic = NIC[business.profile?.business] || NIC.retail;
  return {
    startedAt: business.registration?.udyamAssist?.startedAt || null,
    portal: 'https://udyamregistration.gov.in/UdyamRegistration.aspx',
    prefill: { ownerName: user.name || '', businessName: declared.name || (business.name !== 'My business' ? business.name : ''), address: declared.address || '', city: declared.city || business.city || '', state: declared.state || business.state || '', activity: declared.activity || '', nic, enterpriseType: 'Micro' },
  };
}

export async function udyamGuide(req, res) {
  const business = await ensureBusiness(req.user);
  res.json({ guide: guide(business, req.user) });
}

export async function startUdyamAssist(req, res) {
  const business = await ensureBusiness(req.user);
  if (!business.registration?.udyamAssist?.startedAt) {
    business.set('registration.udyamAssist.startedAt', new Date());
    await business.save();
    await audit(req.user, 'kyc.udyam_assist_started', 'Business', business._id);
  }
  res.json({ guide: guide(business, req.user) });
}

// Demo helper: documents for a fictional unregistered shop, drawn with this owner's name so the e-KYC check matches.
export async function demoDocument(req, res) {
  const business = await ensureBusiness(req.user);
  const declared = business.registration?.declared || {};
  const shop = declared.name || 'Lakshmi Tailoring', owner = req.user.name || 'Account holder';
  const address = declared.address ? `${declared.address}, ${declared.city || ''}, ${declared.state || ''}` : '12, Gandhi Road, Pune, Maharashtra - 411001';
  const kind = req.params.kind;
  const svg = kind === 'licence' ? documentSvg('Shop licence', { licence_number: 'SE-2024-118822', business_name: shop, owner_name: owner, address, valid_till: '2028-03-31' })
    : kind === 'bill' ? documentSvg('Address proof', { billed_to: owner, address, bill_date: '2026-06-28' })
      : kind === 'photo' ? shopPhotoSvg(shop) : null;
  if (!svg) throw new HttpError(404, 'Not found.');
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
}
