// Loads the synthetic case pack into MongoDB and creates demo staff and businesses in every journey state.
// Usage: npm run seed            (reference data + demo data if empty)
//        npm run seed -- --reset (wipe transactional data and recreate the demo)
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import {
  User, Business, Consent, Quote, Order, Job, Case, Product, GstRecord, UdyamRecord, Lead, Notification, Ticket, Invoice, AuditLog, DataRequest, OtpCode,
} from '../models/index.js';
import { readCsv } from '../libs/csv.js';
import { config } from '../libs/config.js';
import { documentSvg, installationSvg } from '../libs/specimenArt.js';
import { encrypt, hmac, maskGstin } from '../libs/security.js';
import { putObject } from '../libs/storage.js';
import { buildQuote } from '../libs/pricing.js';
import { trainPropensity } from '../libs/propensity.js';
import { getCatalogue, invalidateCatalogue, gstRow } from '../services/reference.js';
import { evaluateBusiness } from '../services/kycService.js';
import { newOrderRef, setStatus, pushEvent, isoDate, addBusinessDays, raiseMonthlyBills } from '../services/orderFlow.js';
import { runChecks } from '../services/scheduler.js';
import { resetLeadCaches } from '../services/leadModel.js';
import { resetInsights } from '../services/insights.js';
import { connectDB, disconnectDB } from './connect.js';

export async function seedReference({ force = false } = {}) {
  if (force || !(await Product.estimatedDocumentCount())) {
    await Product.deleteMany({});
    await Product.insertMany(readCsv('product_catalogue.csv'));
    invalidateCatalogue();
  }
  if (force || !(await GstRecord.estimatedDocumentCount())) { await GstRecord.deleteMany({}); await GstRecord.insertMany(readCsv('mock_gstin_registry.csv')); }
  if (force || !(await UdyamRecord.estimatedDocumentCount())) { await UdyamRecord.deleteMany({}); await UdyamRecord.insertMany(readCsv('mock_udyam_registry.csv')); }
  if (force || !(await Lead.estimatedDocumentCount())) {
    const rows = readCsv('smb_leads.csv');
    const model = trainPropensity(rows);
    const open = rows.filter(row => row.outcome !== 'Activated').map(row => ({ row, ...model.score(row) })).sort((a, b) => a.priority - b.priority);
    const scores = new Map(open.map((entry, index) => [entry.row.lead_id, { score: Math.round((100 * index) / (open.length - 1)), probability: Math.round(entry.probability * 1000) / 10, reasons: entry.reasons }]));
    await Lead.deleteMany({});
    await Lead.insertMany(rows.map(row => ({ ...row, ...(scores.get(row.lead_id) || { score: null, probability: null, reasons: [] }) })));
    resetLeadCaches();
    resetInsights();
  }
}

const STAFF = [
  { role: 'partner', name: 'Ravi Kumar', email: 'ravi.partner@udyam.demo', region: { cities: ['Mumbai', 'Pune', 'Nagpur'], states: ['Maharashtra'], languages: ['Marathi', 'Hindi', 'English'] } },
  { role: 'partner', name: 'Lakshmi Iyer', email: 'lakshmi.partner@udyam.demo', region: { cities: ['Chennai', 'Kochi', 'Coimbatore'], states: ['Tamil Nadu', 'Kerala'], languages: ['Tamil', 'Malayalam', 'English'] } },
  { role: 'partner', name: 'Arjun Reddy', email: 'arjun.partner@udyam.demo', region: { cities: ['Hyderabad', 'Visakhapatnam', 'Bengaluru', 'Mysuru'], states: ['Telangana', 'Andhra Pradesh', 'Karnataka'], languages: ['Telugu', 'Kannada', 'English'] } },
  { role: 'partner', name: 'Simran Kaur', email: 'simran.partner@udyam.demo', region: { cities: ['Delhi', 'Ludhiana', 'Jaipur', 'Lucknow'], states: ['Delhi', 'Punjab', 'Rajasthan', 'Uttar Pradesh'], languages: ['Punjabi', 'Hindi', 'English'] } },
  { role: 'partner', name: 'Ananya Ghosh', email: 'ananya.partner@udyam.demo', region: { cities: ['Kolkata', 'Patna'], states: ['West Bengal', 'Bihar'], languages: ['Bengali', 'Hindi', 'English'] } },
  { role: 'partner', name: 'Mehul Shah', email: 'mehul.partner@udyam.demo', region: { cities: ['Ahmedabad', 'Vadodara', 'Surat', 'Indore', 'Bhopal'], states: ['Gujarat', 'Madhya Pradesh'], languages: ['Gujarati', 'Hindi', 'English'] } },
  { role: 'delivery', name: 'Deepak Yadav', email: 'deepak.delivery@udyam.demo', region: { cities: ['Vadodara', 'Ahmedabad', 'Mumbai', 'Pune', 'Nagpur', 'Surat'] } },
  { role: 'delivery', name: 'Imran Khan', email: 'imran.delivery@udyam.demo', region: { cities: ['Visakhapatnam', 'Hyderabad', 'Chennai', 'Kochi', 'Delhi', 'Ludhiana', 'Kolkata'] } },
  { role: 'technician', name: 'Suresh Patil', email: 'suresh.tech@udyam.demo', region: { cities: ['Nagpur', 'Mumbai', 'Pune', 'Vadodara', 'Ahmedabad', 'Surat'] } },
  { role: 'technician', name: 'Karthik N', email: 'karthik.tech@udyam.demo', region: { cities: ['Visakhapatnam', 'Hyderabad', 'Chennai', 'Kochi', 'Bengaluru', 'Delhi', 'Ludhiana', 'Kolkata'] } },
  { role: 'kyc_officer', name: 'Priya Nair', email: 'priya.kyc@udyam.demo' },
  { role: 'ops_admin', name: 'Vikram Mehta', email: 'vikram.ops@udyam.demo' },
];

export async function seedStaff() {
  const passwordHash = await bcrypt.hash(config.demoPassword, 10);
  for (const member of STAFF) await User.updateOne({ email: member.email }, { $setOnInsert: { ...member, passwordHash, demo: true, active: true } }, { upsert: true });
  if (!(await User.exists({ role: 'super_admin' }))) await User.create({ role: 'super_admin', name: 'Platform Admin', email: config.adminEmail, passwordHash: await bcrypt.hash(config.adminPassword, 10) });
}

// Fields as read by on-device OCR from the specimen documents (see backend/tests for the OCR run itself).
const SPECIMENS = {
  K03: { gstin: '27XUIXG0767D1ZP', 'Address proof': { billed_to: 'Ganesh Woodcraft', address: 'Shop/Unit 80, Civil Lines, Nagpur, Maharashtr a-411231', bill_date: '2026-05-30' }, 'Signatory ID': { name: 'Joseph Singh', designation: 'Owner', for_business: 'Ganesh Woodcraft', id_number: 'SYN-ID-447889', valid_till: '2028-07-04' } },
  K07: { gstin: '07CPCXN0398P1ZT', 'GST certificate': { gstin: '07CPCXN0398P1ZT', legal_name: 'Neha Banerjee (Prop. Shri Physio Clinic)', trade_name: 'Neelgiri Physio Clinic', constitution: 'Proprietorship', address: 'Shop/Unit 52, Transport Nagar, Delhi, Delhi - 334596', registration_date: '2024-01-13' }, 'Address proof': { billed_to: 'Neelgiri Physio Clinic', address: 'Shop/Unit 52, Transport Nagar, Delhi, Delhi - 334596', bill_date: '2026-07-05' }, 'Signatory ID': { name: 'Neha Banerjee', designation: 'Manager', for_business: 'Neelgiri Physio Clinic', id_number: 'SYN-ID-178237', valid_till: '2030-05-05' } },
  K08: { gstin: '24XORXG9365M1Z3', 'Address proof': { billed_to: 'Green Leaf Legal Associates', address: 'Shop/Unit 238, Ring Road, Vadodara, Gujarat - 348176', bill_date: '2026-05-26' }, 'Signatory ID': { name: 'Joseph Rao', designation: 'Office admin', for_business: 'Green Leaf Legal Associates', id_number: 'SYN-ID-393148', valid_till: '2027-09-18' } },
  K09: { gstin: '37LDYXK0296F1ZB', 'Address proof': { billed_to: 'Kaveri Insurance Advisors', address: 'Shop/Unit 217, Civil Lines, Visakhapatnam, An dhra Pradesh - 405337', bill_date: '2026-07-10' }, 'Signatory ID': { name: 'Anita Kulkarni', designation: 'Office admin', for_business: 'Kaveri Insurance Advisors', id_number: 'SYN-ID-126040', valid_till: '2027-12-22' } },
  K10: { gstin: '27QHJXK0658U1ZL', 'Address proof': { billed_to: 'Kaveri Stays LLP', address: 'Shop/Unit 21, Sector 14, Mumbai, Maharashtra -570043', bill_date: '2026-06-18' }, 'Signatory ID': { name: 'Nisha Arora', designation: 'Owner', for_business: 'Kaveri Stays LLP', id_number: 'SYN-ID-247542', valid_till: '2029-06-01' } },
  K11: { gstin: '03KGZXT1320R1ZZ', 'Address proof': { billed_to: 'Trinity Bake House Pvt Ltd', address: 'Shop/Unit 188, Industrial Area Phase 2, Ludhi ana, Punjab - 541498', bill_date: '2025-10-31' }, 'Signatory ID': { name: 'Vikram Pillai', designation: 'Owner', for_business: 'Trinity Bake House Pvt Ltd', id_number: 'SYN-ID-440312', valid_till: '2028-12-23' } },
  K12: { gstin: '37NBLXS1145E1ZU', 'Address proof': { billed_to: 'Star Electronics', address: 'Shop/Unit 216, Nehru Nagar, Visakhapatnam, An dhra Pradesh - 762071', bill_date: '2026-07-06' }, 'Signatory ID': { name: 'Pooja Agarwal', designation: 'Owner', for_business: 'Star Electronics', id_number: 'SYN-ID-365512', valid_till: '2029-03-03' } },
  SAFFRON: { gstin: '03PJNXS4821G1ZB', 'Address proof': { billed_to: 'Saffron Bakers', address: 'Shop/Unit 83, Market Yard, Ludhiana, Punjab - 416059', bill_date: '2026-06-20' }, 'Signatory ID': { name: 'Sneha Rao', designation: 'Owner', for_business: 'Saffron Bakers', id_number: 'SYN-ID-552301', valid_till: '2029-01-15' } },
};
const SPECIMEN_FILE = { 'GST certificate': 'gst_certificate', 'Address proof': 'address_proof', 'Signatory ID': 'signatory_id', 'Udyam certificate': 'udyam_certificate' };

async function makeCustomer({ phone, name, language = 'en-IN', demo = false }) {
  return User.findOneAndUpdate({ phone }, { $setOnInsert: { role: 'customer', phone, name, preferredLanguage: language, demo } }, { upsert: true, returnDocument: 'after' });
}

async function makeBusiness(owner, key, { city, language = 'en-IN', profile }) {
  const spec = SPECIMENS[key];
  const row = await gstRow(spec.gstin);
  const business = await Business.create({
    owner: owner._id, name: row.trade_name, city, state: row.state, preferredLanguage: language, profile,
    gst: { gstinEnc: encrypt(spec.gstin), gstinHash: hmac(spec.gstin), masked: maskGstin(spec.gstin), legalName: row.legal_name, tradeName: row.trade_name, constitution: row.constitution, address: row.principal_place_of_business, state: row.state, status: row.status, registrationDate: row.registration_date, verifiedAt: new Date() },
  });
  await Consent.create({ user: owner._id, business: business._id, purpose: 'Verify business registration and process this connection application', scope: ['gst_udyam_registry_lookup', 'document_check', 'document_storage_for_review'], expiresAt: new Date(Date.now() + 30 * 60_000) });
  for (const type of ['GST certificate', 'Address proof', 'Signatory ID']) {
    if (!spec[type]) continue;
    const file = path.join(config.dataDir, 'specimens', `${key}_${SPECIMEN_FILE[type]}.png`);
    // A specimen image from the pack when there is one; otherwise a drawn synthetic document with the same details.
    const specimen = fs.existsSync(file);
    const buffer = specimen ? fs.readFileSync(file) : Buffer.from(documentSvg(type, spec[type]));
    const mime = specimen ? 'image/png' : 'image/svg+xml';
    const storageKey = `kyc/${business._id}/${type.toLowerCase().replace(/\s+/g, '-')}-seed.${specimen ? 'png' : 'svg'}`;
    await putObject(storageKey, buffer, mime);
    business.documents.push({ type, storageKey, mime, size: buffer.length, confidence: 94, fields: spec[type], uploadedAt: new Date() });
  }
  await business.save();
  await evaluateBusiness(business, { trigger: 'seed' });
  return business;
}

async function makeOrder(business, owner, profile, { wants = [], addons = [] } = {}) {
  const result = buildQuote({ profile, catalogue: await getCatalogue(), gstVerified: business.kyc.tier === 'gst', wants, enabledAddons: addons });
  const quote = await Quote.create({ owner: owner._id, business: business._id, profile: result.profile, wants, enabledAddons: result.enabledAddons, result, status: 'ordered', savedAt: new Date() });
  const order = new Order({ ref: await newOrderRef(), business: business._id, owner: owner._id, quote: quote._id, bundleName: result.bundleName, items: result.items, totals: result.totals, profile: result.profile, status: 'awaiting_signature' });
  pushEvent(order, { status: 'awaiting_signature', note: 'Business already verified; KYC reused', role: 'customer' });
  await order.save();
  return order;
}

async function advance(order, owner, target, { slotDate = isoDate(new Date()), window = '11:00–13:00', failures = 0, rating } = {}) {
  const steps = ['awaiting_payment', 'awaiting_slot', 'packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed'];
  const actor = { _id: owner._id, role: 'customer' };
  for (const status of steps) {
    if (status === 'awaiting_payment') { order.signature = { signerName: owner.name, signedAt: new Date(), documentHash: 'seed' }; }
    if (status === 'awaiting_slot') {
      order.payments.push({ amount: order.totals.dueNow, status: 'success', method: 'upi', reference: 'UPISEED' });
      order.paidAt = new Date(); order.autopay = true; order.dueBy = addBusinessDays(new Date(), Number(order.totals.installDays || 3));
    }
    if (status === 'packing') { order.slot = { date: slotDate, window }; order.dueBy = new Date(`${slotDate}T18:00:00`); }
    if (status === 'out_for_delivery' || status === 'delivered') {
      await Job.updateOne({ order: order._id, type: 'delivery' }, { $set: { status: status === 'delivered' ? 'done' : 'in_progress', completedAt: status === 'delivered' ? new Date() : undefined } });
    }
    if (status === 'installing' || status === 'installed') {
      const job = await Job.findOne({ order: order._id, type: 'installation' });
      if (job) await completeDemoChecklist(job, order, status === 'installed');
    }
    await setStatus(order, status, { actor, role: ['ready_for_dispatch'].includes(status) ? 'ops_admin' : ['out_for_delivery', 'delivered'].includes(status) ? 'delivery' : ['installing', 'installed'].includes(status) ? 'technician' : 'customer' });
    if (status === 'awaiting_payment' && failures) {
      for (let i = 0; i < failures; i++) { order.payments.push({ amount: order.totals.dueNow, status: 'failed', method: 'upi', reason: 'Bank declined the UPI request' }); order.paymentFailures += 1; }
      pushEvent(order, { type: 'payment_failed', note: `${failures} payment attempts failed`, role: 'customer' });
      await order.save();
    }
    if (status === target) break;
  }
  if (rating !== undefined) { order.rating = { score: rating, comment: 'Quick and clear', at: new Date() }; await order.save(); }
  return order;
}

const backdate = async (order, daysAgo, daysToActivate) => {
  const created = new Date(Date.now() - daysAgo * 86_400_000);
  const activated = new Date(created.getTime() + daysToActivate * 86_400_000);
  await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt: created, paidAt: created, activatedAt: activated } });
};

// Demo data created before seeded documents had files: give each such document its drawn file. A real upload
// always has a file, so only seeded documents (fields, no file) are touched, and only in demo mode.
// A seeded installation is either under way (arrived, being installed) or done: every checklist step a technician
// would have completed, including a drawn photo, so the technician, owner and ops screens all read consistently.
async function completeDemoChecklist(job, order, done) {
  const at = new Date();
  Object.assign(job.checklist, { startedAt: job.checklist.startedAt || at, arrivedAt: job.checklist.arrivedAt || at });
  if (done) {
    if (!job.checklist.photoKey) {
      const business = await Business.findById(order.business).select('name').lean();
      const key = `jobs/${job._id}/installation-seed.svg`;
      await putObject(key, Buffer.from(installationSvg({ business: business?.name, kit: order.kit, speedMbps: job.checklist.speedMbps || 96 })), 'image/svg+xml');
      Object.assign(job.checklist, { photoKey: key, photoMime: 'image/svg+xml', photoAt: at });
    }
    Object.assign(job.checklist, { installedAt: job.checklist.installedAt || at, speedMbps: job.checklist.speedMbps || 96, signedOffAt: job.checklist.signedOffAt || at });
    Object.assign(job, { status: 'done', completedAt: job.completedAt || at });
  } else job.status = 'in_progress';
  await job.save();
}

// Demo data seeded before this: finished installations missing steps or a photo are completed the same way.
export async function ensureDemoJobChecklists() {
  let fixed = 0;
  for (const job of await Job.find({ type: 'installation', status: 'done', $or: [{ 'checklist.installedAt': null }, { 'checklist.photoKey': null }] })) {
    const order = await Order.findById(job.order).lean();
    if (!order) continue;
    await completeDemoChecklist(job, order, true);
    fixed++;
  }
  return fixed;
}

export async function ensureDemoDocumentFiles() {
  let added = 0;
  for (const business of await Business.find({ documents: { $elemMatch: { storageKey: null } } })) {
    for (const doc of business.documents.filter(item => !item.storageKey)) {
      const buffer = Buffer.from(documentSvg(doc.type, doc.fields || {}));
      doc.storageKey = `kyc/${business._id}/${doc.type.toLowerCase().replace(/\s+/g, '-')}-seed.svg`;
      await putObject(doc.storageKey, buffer, 'image/svg+xml');
      Object.assign(doc, { mime: 'image/svg+xml', size: buffer.length });
      added++;
    }
    await business.save();
  }
  return added;
}

export async function seedDemoData() {
  if (await Business.exists({})) return { skipped: true };
  const profile = (business, employees, sites, tier, goal, current = 'business') => ({ business, employees, sites, tier, gstin: 'yes', current, goal, spend: '' });
  const today = isoDate(new Date());

  // A · Active customer with a bill (the demo customer login)
  const sneha = await makeCustomer({ phone: '9876500001', name: 'Sneha Rao', demo: true });
  const saffron = await makeBusiness(sneha, 'SAFFRON', { city: 'Ludhiana', profile: profile('retail', 3, 1, '2', 'operations', 'hotspot') });
  const saffronOrder = await advance(await makeOrder(saffron, sneha, saffron.profile), sneha, 'installed', { slotDate: isoDate(new Date(Date.now() - 3 * 86_400_000)), rating: 9 });
  // Live since late September: the first month was paid with the order, so this month's bill is due now.
  await backdate(saffronOrder, 45, 5);
  // B · Kaveri Stays (Mumbai): active, rated 8
  const nisha = await makeCustomer({ phone: '9876500002', name: 'Nisha Arora' });
  const stays = await makeBusiness(nisha, 'K10', { city: 'Mumbai', profile: profile('multi', 15, 3, '1', 'locations') });
  const staysOrder = await advance(await makeOrder(stays, nisha, stays.profile), nisha, 'installed', { rating: 8 });
  await backdate(staysOrder, 12, 6);
  // C · Ganesh Woodcraft (Nagpur): paid, slot booked, waiting in the packing queue
  const joseph = await makeCustomer({ phone: '9876500003', name: 'Joseph Singh', language: 'mr-IN' });
  const woodcraft = await makeBusiness(joseph, 'K03', { city: 'Nagpur', language: 'mr-IN', profile: profile('manufacturing', 15, 1, '2', 'operations', 'home') });
  await advance(await makeOrder(woodcraft, joseph, woodcraft.profile), joseph, 'packing', { slotDate: isoDate(addBusinessDays(new Date(), 2)) });
  // D · Kaveri Insurance (Visakhapatnam): kit delivered, installation due today
  const anita = await makeCustomer({ phone: '9876500004', name: 'Anita Kulkarni', language: 'te-IN' });
  const insurance = await makeBusiness(anita, 'K09', { city: 'Visakhapatnam', language: 'te-IN', profile: profile('professional', 8, 1, '2', 'security') });
  await advance(await makeOrder(insurance, anita, insurance.profile), anita, 'delivered', { slotDate: today, window: '14:00–16:00' });
  // E · Green Leaf Legal (Vadodara): packed, delivery due today, owner asked for a call
  const rao = await makeCustomer({ phone: '9876500005', name: 'Joseph Rao', language: 'gu-IN' });
  const legal = await makeBusiness(rao, 'K08', { city: 'Vadodara', language: 'gu-IN', profile: profile('professional', 8, 1, '2', 'reliable') });
  const legalOrder = await advance(await makeOrder(legal, rao, legal.profile), rao, 'ready_for_dispatch', { slotDate: today, window: '11:00–13:00' });
  legalOrder.callbackRequestedAt = new Date(); legalOrder.statusCalls = 1; await legalOrder.save();
  const { openCase } = await import('../services/routing.js');
  await openCase({ kind: 'callback', business: legal._id, order: legalOrder._id, title: 'Green Leaf Legal Associates asked for a call', reason: `Order ${legalOrder.ref} is at "ready for dispatch"`, city: 'Vadodara', state: 'Gujarat', language: 'gu-IN', ownerId: rao._id });
  // F · Star Electronics (Visakhapatnam): payment failed twice → partner case
  const pooja = await makeCustomer({ phone: '9876500006', name: 'Pooja Agarwal', language: 'te-IN' });
  const electronics = await makeBusiness(pooja, 'K12', { city: 'Visakhapatnam', language: 'te-IN', profile: profile('retail', 8, 1, '2', 'security') });
  const electronicsOrder = await advance(await makeOrder(electronics, pooja, electronics.profile, { wants: ['P23'] }), pooja, 'awaiting_payment', { failures: 2 });
  await openCase({ kind: 'payment_failed', business: electronics._id, order: electronicsOrder._id, title: 'Star Electronics: payment failed twice', reason: `₹${electronicsOrder.totals.dueNow.toLocaleString('en-IN')} for ${electronicsOrder.ref}`, city: 'Visakhapatnam', state: 'Andhra Pradesh', language: 'te-IN', ownerId: pooja._id });
  // G · Neelgiri Physio (Delhi): legal name on certificate differs from registry; owner asked for review
  const neha = await makeCustomer({ phone: '9876500007', name: 'Neha Banerjee', language: 'hi-IN' });
  const physio = await makeBusiness(neha, 'K07', { city: 'Delhi', language: 'hi-IN', profile: profile('professional', 8, 1, '1', 'customers') });
  physio.kyc.status = 'in_review'; physio.kyc.submittedForReviewAt = new Date(Date.now() - 2 * 3_600_000);
  physio.kyc.decisions.push({ decision: 'owner_requested_review', note: 'Our legal name is correct in the registry; the certificate print is old.', at: new Date() });
  await physio.save();
  const physioQuote = buildQuote({ profile: physio.profile, catalogue: await getCatalogue(), gstVerified: false });
  const physioOrderQuote = await Quote.create({ owner: neha._id, business: physio._id, profile: physioQuote.profile, result: physioQuote, status: 'ordered', savedAt: new Date() });
  const physioOrder = new Order({ ref: await newOrderRef(), business: physio._id, owner: neha._id, quote: physioOrderQuote._id, bundleName: physioQuote.bundleName, items: physioQuote.items, totals: physioQuote.totals, profile: physioQuote.profile, status: 'awaiting_kyc' });
  pushEvent(physioOrder, { status: 'awaiting_kyc', note: 'Waiting for business verification', role: 'customer' });
  await physioOrder.save();
  // H · Trinity Bake House (Ludhiana): address proof too old → action needed, partner helps
  const vikram = await makeCustomer({ phone: '9876500008', name: 'Vikram Pillai', language: 'pa-IN' });
  await makeBusiness(vikram, 'K11', { city: 'Ludhiana', language: 'pa-IN', profile: profile('multi', 15, 2, '2', 'operations') });
  // I · Balaji Dental (Kochi): saved a quote two days ago and never ordered → abandoned-quote case
  const prakash = await makeCustomer({ phone: '9876500009', name: 'Prakash Shah', language: 'ml-IN' });
  const dental = await Business.create({ owner: prakash._id, name: 'Balaji Dental Care LLP', city: 'Kochi', state: 'Kerala', preferredLanguage: 'ml-IN', profile: profile('professional', 15, 1, '2', 'reliable') });
  const dentalQuote = buildQuote({ profile: dental.profile, catalogue: await getCatalogue(), gstVerified: false });
  await Quote.create({ owner: prakash._id, business: dental._id, profile: dentalQuote.profile, result: dentalQuote, status: 'saved', savedAt: new Date(Date.now() - 2 * 86_400_000) });
  await runChecks();
  // A support ticket from the active customer
  await Ticket.create({ business: saffron._id, owner: sneha._id, order: saffronOrder._id, category: 'slow_speed', subject: 'Internet slow in the evening', messages: [{ by: sneha._id, role: 'customer', text: 'Billing tablet is slow between 7 and 9 pm.' }] });
  await raiseMonthlyBills();
  return { skipped: false };
}

export async function resetDemo() {
  const { deleteObject } = await import('../libs/storage.js');
  const businesses = await Business.find({}).lean();
  for (const business of businesses) for (const doc of business.documents || []) await deleteObject(doc.storageKey).catch(() => {});
  await Promise.all([Business, Consent, Quote, Order, Job, Case, Notification, Ticket, Invoice, DataRequest, OtpCode].map(model => model.deleteMany({})));
  await AuditLog.deleteMany({});
  await User.deleteMany({ role: 'customer' });
  await Lead.updateMany({}, { $unset: { assignedTo: '', followUp: '' } });
  return seedDemoData();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reset = process.argv.includes('--reset');
  await connectDB();
  console.log('Loading reference data…');
  await seedReference({ force: process.argv.includes('--force') });
  await seedStaff();
  const result = reset ? await resetDemo() : await seedDemoData();
  console.log(result.skipped ? 'Demo data already present (use --reset to recreate).' : 'Demo data created.');
  await disconnectDB();
}
