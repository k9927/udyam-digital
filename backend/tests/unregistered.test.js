// Businesses with neither GST nor Udyam: owner Aadhaar e-KYC + proof of the shop, or the Udyam assistant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { startServer, dropDatabase, loginCustomer, loginDemo, backendRoot } from './helpers.js';
import { aadhaarValid, withCheckDigit } from '../libs/aadhaar.js';
import { checkDocuments, decide } from '../libs/kycRules.js';
import { redactIdentifiers } from '../libs/redact.js';

const DB = 'udyam_digital_unreg_test';
const AADHAAR = withCheckDigit('49911234567');
const png = fs.readFileSync(path.join(backendRoot, 'data', 'specimens', 'K12_address_proof.png'));
const upload = (client, type, fields, confidence = 93) => { const form = new FormData(); form.append('type', type); form.append('confidence', String(confidence)); form.append('fields', JSON.stringify(fields)); form.append('file', new Blob([png], { type: 'image/png' }), `${type}.png`); return client.post('/kyc/documents', form); };
const SHOP = { name: 'Lakshmi Tailoring', address: '12, Gandhi Road', city: 'Pune', state: 'Maharashtra', activity: 'Tailoring and alterations' };
const BILL = { billed_to: 'Ravi Kumar', address: '12, Gandhi Road, Pune, Maharashtra - 411001', bill_date: '2026-07-01' };
const LICENCE = { licence_number: 'SE-2024-118822', business_name: 'Lakshmi Tailoring', owner_name: 'Ravi Kumar', address: '12, Gandhi Road, Pune, Maharashtra - 411001', valid_till: '2028-03-31' };

await dropDatabase(DB);
const server = await startServer(5097, DB);
test.after(async () => { server.stop(); await dropDatabase(DB); });

async function ownerWithEkyc(phone, name = 'Ravi Kumar') {
  const client = server.actor();
  await loginCustomer(client, phone, name);
  await client.post('/kyc/consent');
  assert.equal((await client.post('/kyc/unregistered', SHOP)).status, 200);
  const otp = await client.post('/kyc/owner/otp', { aadhaar: AADHAAR });
  const verified = await client.post('/kyc/owner/verify', { aadhaar: AADHAAR, code: otp.body.devCode });
  assert.equal(verified.status, 200, verified.text);
  return client;
}

test('switching to "verify without registration" drops registered-path documents from another identity', async () => {
  const client = server.actor();
  await loginCustomer(client, '9800055501', 'Sham Lal');
  await client.post('/kyc/consent');
  // A demo sample for a different, registered business, uploaded before switching path.
  await upload(client, 'Address proof', { billed_to: 'Star Electronics', address: 'Shop/Unit 4, Lake View Colony, Chennai, Tamil Nadu - 304733', bill_date: '2026-07-01' });
  await upload(client, 'GST certificate', { gstin: '33MFTXS9954Q1Z9', legal_name: 'Star Electronics', trade_name: 'Star Electronics' });
  await upload(client, 'Signatory ID', { name: 'Someone Else', for_business: 'Star Electronics', id_number: 'SYN-1', valid_till: '2029-01-01' });
  const declared = await client.post('/kyc/unregistered', { ...SHOP, name: 'Sham Traders' });
  assert.equal(declared.status, 200, declared.text);
  const types = declared.body.business.documents.map(doc => doc.type);
  assert.deepEqual(types, ['Address proof'], 'GST certificate and signatory ID are removed');
  const bill = declared.body.business.documents[0];
  assert.equal(bill.status, 'fail', 'the bill is now checked against the declared business');
  assert.ok(bill.checks.some(check => /does not match/.test(check.label) && /Sham Traders/.test(check.detail)), JSON.stringify(bill.checks));
});

test('an account without a name gives it at the Aadhaar step', async () => {
  const client = server.actor();
  const otpLogin = await client.post('/auth/otp/request', { phone: '9800055502' });
  await client.post('/auth/otp/verify', { phone: '9800055502', code: otpLogin.body.devCode });
  await client.post('/kyc/consent');
  await client.post('/kyc/unregistered', SHOP);
  const otp = await client.post('/kyc/owner/otp', { aadhaar: AADHAAR });
  const missing = await client.post('/kyc/owner/verify', { aadhaar: AADHAAR, code: otp.body.devCode });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /full name/);
  const again = await client.post('/kyc/owner/otp', { aadhaar: AADHAAR });
  const verified = await client.post('/kyc/owner/verify', { aadhaar: AADHAAR, code: again.body.devCode, name: 'Ravi Kumar' });
  assert.equal(verified.status, 200, verified.text);
  assert.equal(verified.body.business.ownerKyc.name, 'Ravi Kumar');
});

test('an upload whose contents do not match its declared type is refused', async () => {
  const client = server.actor();
  await loginCustomer(client, '9800055504', 'Ravi Kumar');
  await client.post('/kyc/consent');
  await client.post('/kyc/unregistered', SHOP);
  const form = new FormData(); form.append('type', 'Address proof'); form.append('confidence', '93'); form.append('fields', JSON.stringify(BILL));
  form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'bill.png');
  const fake = await client.post('/kyc/documents', form);
  assert.equal(fake.status, 400);
  assert.match(fake.body.error, /not a valid JPEG, PNG, WebP or PDF/);
  assert.equal((await upload(client, 'Address proof', BILL)).status, 201, 'a real PNG is still accepted');
});

test('a mistyped Aadhaar number gets a message that says so', async () => {
  const client = server.actor();
  await loginCustomer(client, '9800055503', 'Ravi Kumar');
  await client.post('/kyc/consent');
  await client.post('/kyc/unregistered', SHOP);
  const typo = await client.post('/kyc/owner/otp', { aadhaar: AADHAAR.slice(0, 11) + ((Number(AADHAAR[11]) + 1) % 10) });
  assert.equal(typo.status, 400);
  assert.match(typo.body.error, /not a valid Aadhaar number/);
});

test('identifiers typed into the chat are removed before any text goes to the AI provider', () => {
  const { text, removed } = redactIdentifiers('My GSTIN is 27XUIXG0767D1ZP, PAN ABCDE1234F, Aadhaar 4991 1234 5677, Udyam UDYAM-MH-00-1234567, call 98765 43210 or a@b.in. We have 8 staff in Pune and spend 3000.');
  for (const leaked of ['27XUIXG0767D1ZP', 'ABCDE1234F', '4991 1234 5677', 'UDYAM-MH-00-1234567', '98765 43210', 'a@b.in']) assert.ok(!text.includes(leaked), leaked);
  assert.deepEqual(removed.sort(), ['Aadhaar number', 'GSTIN', 'PAN', 'Udyam number', 'email', 'phone number']);
  assert.match(text, /8 staff in Pune and spend 3000/, 'ordinary business details are untouched');
});

test('Aadhaar numbers carry a Verhoeff check digit', () => {
  assert.equal(aadhaarValid(AADHAAR), true);
  assert.equal(aadhaarValid(AADHAAR.slice(0, 11) + ((Number(AADHAAR[11]) + 1) % 10)), false, 'one-digit typo');
  assert.equal(aadhaarValid('123456789012'), false, 'cannot start with 0 or 1');
});

test('rules: licence matched to the owner, photo needs a person, owner tier', async () => {
  const owner = { name: 'Ravi Kumar' }, declared = SHOP;
  const run = documents => checkDocuments({ documents, gst: null, udyam: null, lookups: {}, owner, declared });
  const { results } = await run([{ type: 'Address proof', confidence: 93, fields: BILL }, { type: 'Shop licence', confidence: 93, fields: LICENCE }]);
  assert.ok(results.every(result => result.status === 'pass'), JSON.stringify(results.map(result => result.checks)));
  assert.equal(decide({ gst: null, udyam: null, results, unregistered: true, owner }).tier, 'owner');
  const someoneElse = (await run([{ type: 'Shop licence', confidence: 93, fields: { ...LICENCE, owner_name: 'Suresh Iyer' } }])).results[0];
  assert.ok(someoneElse.checks.some(check => check.status === 'fail' && /Licence holder differs/.test(check.label)));
  const photo = (await run([{ type: 'Shop photo', confidence: 20, fields: { signboard_text: 'LAKSHMI TAILORING Alterations' } }])).results[0];
  assert.deepEqual(photo.checks.map(check => check.status), ['pass', 'warn'], 'signboard matches; a person still looks');
  assert.equal(decide({ gst: null, udyam: null, results: [], unregistered: true, owner: null }).status, 'registry_needed', 'no e-KYC yet');
});

test('verify without registration: declare, Aadhaar e-KYC, bill + licence → owner-verified, order moves on', async () => {
  const client = server.actor();
  await loginCustomer(client, '9833300001', 'Ravi Kumar');
  const quote = await client.post('/quotes', { profile: { business: 'retail', employees: 3, tier: '1', gstin: 'no' } });
  await client.post(`/quotes/${quote.body.quote.id}/save`);
  const order = (await client.post('/orders', { quoteId: quote.body.quote.id })).body.order;
  assert.equal(order.status, 'awaiting_kyc');
  assert.equal((await client.post('/kyc/unregistered', SHOP)).status, 403, 'consent first');
  await client.post('/kyc/consent');
  const declared = (await client.post('/kyc/unregistered', SHOP)).body.business;
  assert.deepEqual([declared.name, declared.city, declared.registration.path], ['Lakshmi Tailoring', 'Pune', 'unregistered']);
  assert.equal((await client.post('/kyc/owner/otp', { aadhaar: '499112345670' })).status, 400, 'checksum');
  const otp = await client.post('/kyc/owner/otp', { aadhaar: AADHAAR });
  assert.match(otp.body.sentTo, /0001$/);
  assert.equal((await client.post('/kyc/owner/verify', { aadhaar: AADHAAR, code: '000000' })).status, 400);
  const ekyc = (await client.post('/kyc/owner/verify', { aadhaar: AADHAAR, code: otp.body.devCode })).body.business;
  assert.equal(ekyc.ownerKyc.aadhaar, `XXXX XXXX ${AADHAAR.slice(-4)}`);
  assert.equal(ekyc.kyc.status, 'documents_needed');
  assert.deepEqual(ekyc.kyc.missing, ['Address proof', 'Shop proof']);
  await upload(client, 'Address proof', BILL);
  const done = (await upload(client, 'Shop licence', LICENCE)).body.business;
  assert.equal(done.kyc.status, 'verified', JSON.stringify(done.kyc));
  assert.equal(done.kyc.tier, 'owner');
  const moved = (await client.get(`/orders/${order.id}`)).body.order;
  assert.equal(moved.status, 'awaiting_signature', 'the waiting order moves on');
  assert.equal(moved.gstUpgrade, null, 'GST-only products stay locked without a verified GSTIN');
  // The Aadhaar number itself is never stored, anywhere.
  const db = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${DB}`).asPromise();
  const stored = JSON.stringify(await db.collection('businesses').findOne({ 'registration.declared.name': 'Lakshmi Tailoring' }));
  assert.ok(!stored.includes('refHash'), 'no Aadhaar-derived hash is kept either');
  const audit = JSON.stringify(await db.collection('auditlogs').find({}).toArray());
  await db.close();
  assert.ok(!stored.includes(AADHAAR) && !audit.includes(AADHAAR));
});

test('a shop photo alone goes to a KYC officer, who approves the owner-verified business', async () => {
  const client = await ownerWithEkyc('9833300002');
  await upload(client, 'Address proof', BILL);
  const pending = (await upload(client, 'Shop photo', { signboard_text: 'LAKSHMI TAILORING' }, 30)).body.business;
  assert.equal(pending.kyc.status, 'in_review');
  const officer = server.actor();
  await loginDemo(officer, 'priya.kyc@udyam.demo');
  const row = (await officer.get('/review/queue')).body.businesses.find(item => item.name === 'Lakshmi Tailoring');
  assert.ok(row, 'in the review queue');
  const detail = (await officer.get(`/review/${row.id}`)).body.business;
  assert.equal(detail.ownerKyc.name, 'Ravi Kumar');
  assert.equal((await officer.post(`/review/${row.id}/decision`, { decision: 'approve' })).body.business.kyc.tier, 'owner');
});

test('a licence in someone else’s name is caught', async () => {
  const client = await ownerWithEkyc('9833300003', 'Anita Desai');
  await upload(client, 'Address proof', { ...BILL, billed_to: 'Anita Desai' });
  const result = (await upload(client, 'Shop licence', LICENCE)).body.business;
  assert.equal(result.kyc.status, 'action_needed');
  assert.ok(result.kyc.failed.some(item => /Licence holder differs/.test(item.label)));
});

test('a registered business cannot switch to the unregistered path, and Udyam later replaces it', async () => {
  const client = await ownerWithEkyc('9833300004');
  const udyam = await client.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' });
  assert.equal(udyam.body.business.registration.path, 'registered');
  assert.equal(udyam.body.business.name, 'Balaji Dental Care LLP', 'the registry now names the business');
  assert.equal((await client.post('/kyc/unregistered', SHOP)).status, 409);
});

test('Udyam assistant: reminder after a day, a local partner after three', async () => {
  const client = server.actor();
  await loginCustomer(client, '9833300005', 'Meena Joshi');
  await client.post('/kyc/consent');
  await client.post('/kyc/unregistered', SHOP);
  const guide = (await client.post('/kyc/udyam-assist')).body.guide;
  assert.ok(guide.startedAt);
  assert.equal(guide.prefill.businessName, 'Lakshmi Tailoring');
  assert.match(guide.portal, /udyamregistration\.gov\.in/);
  const ops = server.actor();
  await loginDemo(ops, 'vikram.ops@udyam.demo');
  const at = hours => new Date(Date.now() + hours * 3600_000).toISOString();
  assert.equal((await ops.post('/ops/scheduler/run', { udyamAssistAt: at(1) })).body.udyam.reminded, 0, 'not yet');
  assert.ok((await ops.post('/ops/scheduler/run', { udyamAssistAt: at(25) })).body.udyam.reminded >= 1);
  assert.ok((await client.get('/notifications')).body.notifications.some(item => item.kind === 'udyam_reminder'));
  assert.ok((await ops.post('/ops/scheduler/run', { udyamAssistAt: at(73) })).body.udyam.escalated >= 1);
  const ravi = server.actor();
  await loginDemo(ravi, 'ravi.partner@udyam.demo');
  assert.ok((await ravi.get('/partner/cases')).body.cases.some(item => item.kind === 'no_registration' && /Lakshmi Tailoring/.test(item.title)), 'the Pune partner calls');
});

test('withdrawing consent before verification erases the e-KYC and the declared business', async () => {
  const client = await ownerWithEkyc('9833300006');
  const after = (await client.post('/kyc/consent/withdraw')).body.business;
  assert.equal(after.ownerKyc, null);
  assert.equal(after.registration.declared, null);
  assert.equal(after.name, 'My business');
});
