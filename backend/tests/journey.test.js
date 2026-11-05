// One complete journey through the real API, across every actor: owner → KYC → sign → pay → slot →
// warehouse → delivery → technician → live → bill → support → add-on, plus partners, KYC officer, ops and security.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { startServer, dropDatabase, loginCustomer, loginDemo, backendRoot } from './helpers.js';

const DB = 'udyam_digital_test';
const GSTIN = '33MFTXS9954Q1Z9'; // Star Electronics, Chennai: active in the mock registry
const png = fs.readFileSync(path.join(backendRoot, 'data', 'specimens', 'K12_address_proof.png'));
const file = name => new Blob([png], { type: 'image/png' });
const upload = (client, type, fields) => { const form = new FormData(); form.append('type', type); form.append('confidence', '93'); form.append('fields', JSON.stringify(fields)); form.append('file', file(), `${type}.png`); return client.post('/kyc/documents', form); };

await dropDatabase(DB);
const server = await startServer(5099, DB);
test.after(async () => { server.stop(); await dropDatabase(DB); });

const owner = server.actor(), anon = server.actor(), ops = server.actor(), officer = server.actor(), courier = server.actor(), tech = server.actor(), partner = server.actor();
const state = {};

test('public pages: health, catalogue, popular bundles, advisor', async () => {
  assert.equal((await anon.get('/health')).body.ok, true);
  assert.equal((await anon.get('/catalogue')).body.products.length, 25);
  const popular = (await anon.get('/catalogue/popular')).body.bundles;
  assert.equal(popular.length, 4);
  assert.equal(popular[0].monthly_incl_gst, Math.round((999 + 2 * 299) * 1.18));
  const turn = await anon.post('/advisor/message', { text: 'mobile shop in Chennai with 3 staff, we have GST', language: 'en-IN', profile: {}, answered: [] });
  assert.equal(turn.body.mode, 'rules');
  assert.deepEqual([turn.body.updates.business, turn.body.updates.tier, turn.body.updates.gstin], ['retail', '1', 'yes']);
});

test('anonymous quote is private to its token', async () => {
  const created = await anon.post('/quotes', { profile: { business: 'retail', employees: 3, tier: '1', gstin: 'yes' } });
  assert.equal(created.status, 201);
  assert.equal((await owner.get(`/quotes/${created.body.quote.id}`)).status, 404);
  assert.equal((await owner.get(`/quotes/${created.body.quote.id}`, { 'x-quote-token': created.body.accessToken })).status, 200);
});

test('owner signs in with OTP, saves a quote and places an order before verification', async () => {
  const bad = await owner.post('/auth/otp/request', { phone: '12345' });
  assert.equal(bad.status, 400);
  await loginCustomer(owner, '9811100001', 'Joseph Joshi');
  const quote = await owner.post('/quotes', { profile: { business: 'retail', employees: 3, sites: 1, tier: '1', gstin: 'yes', current: 'hotspot', goal: 'operations' } });
  assert.deepEqual(quote.body.quote.result.items.map(item => item.productId), ['P04', 'P18'], 'unverified: non-GST bundle');
  assert.ok(quote.body.quote.result.notes.some(note => note.code === 'gst_unlocks'));
  await owner.post(`/quotes/${quote.body.quote.id}/save`);
  const order = await owner.post('/orders', { quoteId: quote.body.quote.id });
  assert.equal(order.status, 201);
  assert.equal(order.body.order.status, 'awaiting_kyc');
  state.order = order.body.order;
});

test('KYC: consent first, registry lookup, documents, verified once', async () => {
  assert.equal((await owner.post('/kyc/gstin', { gstin: GSTIN })).status, 403, 'no lookup without consent');
  assert.equal((await owner.post('/kyc/consent')).status, 201);
  assert.equal((await owner.post('/kyc/gstin', { gstin: '33MFTXS9954Q1Z8' })).status, 400, 'checksum');
  const lookup = await owner.post('/kyc/gstin', { gstin: GSTIN });
  assert.equal(lookup.body.active, true);
  assert.ok(!lookup.text.includes(GSTIN), 'full GSTIN never returned');
  assert.equal(lookup.body.business.kyc.status, 'documents_needed');
  await upload(owner, 'Address proof', { billed_to: 'Star Electronics', address: 'Shop/Unit 4, Lake View Colony, Chennai, Tamil Nadu - 304733', bill_date: '2026-07-01' });
  const done = await upload(owner, 'Signatory ID', { name: 'Joseph Joshi', designation: 'Owner', for_business: 'Star Electronics', id_number: 'SYN-ID-1', valid_till: '2029-01-01' });
  assert.equal(done.body.business.kyc.status, 'verified');
  assert.equal(done.body.business.kyc.tier, 'gst');
  state.docId = done.body.business.documents[0].id;
  const order = await owner.get(`/orders/${state.order.id}`);
  assert.equal(order.body.order.status, 'awaiting_signature', 'waiting order moves on after verification');
  const upgrade = order.body.order.gstUpgrade;
  assert.ok(upgrade && upgrade.added.some(item => item.name === 'Cloud POS & Billing'), 'verified GSTIN offers the GST bundle before signing');
  const switched = await owner.post(`/orders/${state.order.id}/gst-upgrade`);
  assert.deepEqual(switched.body.order.items.map(item => item.productId), ['P01', 'P07', 'P19']);
  assert.equal(switched.body.order.gstUpgrade, null);
  assert.equal((await owner.post(`/orders/${state.order.id}/gst-upgrade`)).status, 409);
  const db = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${DB}`).asPromise();
  const stored = await db.collection('businesses').findOne({ 'gst.masked': { $exists: true }, name: 'Star Electronics' });
  await db.close();
  assert.ok(stored.gst.gstinEnc && !JSON.stringify(stored).includes(GSTIN), 'GSTIN encrypted at rest');
});

test('GST and Udyam must be the same business, whichever is entered first', async () => {
  const gstFirst = server.actor();
  await loginCustomer(gstFirst, '9811100005');
  await gstFirst.post('/kyc/consent');
  assert.equal((await gstFirst.post('/kyc/gstin', { gstin: '27XUIXG0767D1ZP' })).status, 200, 'Ganesh Woodcraft, Nagpur');
  const wrong = await gstFirst.post('/kyc/udyam', { udyam: 'UDYAM-TN-00-3866196' });
  assert.equal(wrong.status, 409, 'Star Electronics Udyam refused');
  assert.equal(wrong.body.details.code, 'registry_mismatch');
  assert.equal(wrong.body.details.entered.name, 'Star Electronics');
  assert.equal(wrong.body.details.current.name, 'Ganesh Woodcraft');
  assert.equal((await gstFirst.get('/business/me')).body.business.udyam, null, 'nothing saved');
  assert.equal((await gstFirst.post('/kyc/udyam', { udyam: 'UDYAM-MH-00-9516696' })).status, 200, 'its own Udyam accepted');
  let identity = (await gstFirst.get('/business/me')).body.business;
  assert.deepEqual([identity.name, identity.city, identity.state], ['Ganesh Woodcraft', 'Nagpur', 'Maharashtra']);
  // Replacing both registrations with another business's moves the name and location with them.
  await gstFirst.del('/kyc/registry/udyam');
  await gstFirst.del('/kyc/registry/gst');
  assert.equal((await gstFirst.get('/business/me')).body.business.name, 'My business');
  await gstFirst.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' });
  identity = (await gstFirst.get('/business/me')).body.business;
  assert.deepEqual([identity.name, identity.city, identity.state], ['Balaji Dental Care LLP', 'Kochi', 'Kerala'], 'name and location follow the registry');
  await gstFirst.del('/kyc/registry/udyam');

  const udyamFirst = server.actor();
  await loginCustomer(udyamFirst, '9811100006');
  await udyamFirst.post('/kyc/consent');
  assert.equal((await udyamFirst.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' })).status, 200, 'Balaji Dental, Kochi');
  const other = await udyamFirst.post('/kyc/gstin', { gstin: '27XUIXG0767D1ZP' });
  assert.equal(other.status, 409, 'another business GSTIN refused');
  assert.equal(other.body.details.existing, 'udyam');
  assert.equal((await udyamFirst.post('/kyc/gstin', { gstin: '32TTNXB7384T1ZW' })).status, 200, 'its own GSTIN accepted');

  const removed = await udyamFirst.del('/kyc/registry/udyam');
  assert.equal(removed.body.business.udyam, null, 'a mistaken registration can be removed before verification');
  assert.ok(removed.body.business.gst);
});

test('a verified business cannot swap to another business’s GSTIN', async () => {
  const swap = await owner.post('/kyc/gstin', { gstin: '27XUIXG0767D1ZP' });
  assert.equal(swap.status, 409);
  assert.equal(swap.body.details.code, 'registry_locked');
  assert.equal((await owner.post('/kyc/gstin', { gstin: GSTIN })).status, 200, 're-checking its own GSTIN is fine');
  assert.equal((await owner.del('/kyc/registry/gst')).status, 409);
  assert.equal((await owner.get('/business/me')).body.business.kyc.status, 'verified');
});

test('seeded demo documents have a file the reviewer can open, served so it cannot run', async () => {
  const sneha = server.actor();
  const accounts = (await sneha.get('/auth/demo-accounts')).body.accounts;
  await sneha.post('/auth/demo-login', { userId: accounts.find(item => item.role === 'customer').id });
  const documents = (await sneha.get('/business/me')).body.business.documents;
  assert.ok(documents.length >= 2 && documents.every(doc => doc.hasFile), 'every seeded document has a file');
  const file = await sneha.raw(`/documents/${documents.find(doc => doc.type === 'Address proof').id}/file`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  assert.match(await file.text(), /Electricity Bill[\s\S]*Saffron Bakers/);
  // A seeded finished installation has every checklist step and a photo the owner can open.
  const live = (await sneha.get('/orders/mine')).body.orders.find(order => order.status === 'active');
  const install = (await sneha.get(`/orders/${live.id}`)).body.order.jobs.find(job => job.type === 'installation');
  assert.equal(install.status, 'done');
  assert.ok(install.checklist.arrivedAt && install.checklist.installedAt && install.checklist.speedMbps && install.checklist.signedOffAt);
  assert.equal(install.checklist.hasPhoto, true);
  assert.equal((await sneha.raw(`/field/jobs/${install.id}/photo`)).status, 200);
});

test('a state-changing request from another website is refused (CSRF)', async () => {
  const forged = await owner.post('/kyc/consent', {}, { origin: 'https://evil.example' });
  assert.equal(forged.status, 403);
  assert.equal((await owner.post('/kyc/consent', {}, { origin: 'http://localhost' })).status, 201, 'the allowed client still works');
  assert.equal((await owner.get('/business/me', { origin: 'https://evil.example' })).status, 200, 'reads are not affected');
});

test('documents are visible only to the owner and KYC/ops staff (audited)', async () => {
  assert.equal((await owner.raw(`/documents/${state.docId}/file`)).status, 200);
  const other = server.actor();
  await loginCustomer(other, '9811100002');
  assert.equal((await other.get(`/documents/${state.docId}/file`)).status, 403);
  await loginDemo(officer, 'priya.kyc@udyam.demo');
  assert.equal((await officer.raw(`/documents/${state.docId}/file`)).status, 200);
});

test('e-sign with a one-time code, then UPI payment with failures routed to a partner', async () => {
  const id = state.order.id;
  const code = (await owner.post(`/orders/${id}/sign/request`)).body.devCode;
  assert.equal((await owner.post(`/orders/${id}/sign`, { code: '000000', signerName: 'Joseph Joshi' })).status, 400);
  assert.equal((await owner.post(`/orders/${id}/sign`, { code, signerName: 'Joseph Joshi' })).body.order.status, 'awaiting_payment');
  assert.equal((await owner.post(`/orders/${id}/pay`, { simulate: 'failure' })).status, 402);
  assert.equal((await owner.post(`/orders/${id}/pay`, { simulate: 'failure' })).status, 402);
  await loginDemo(partner, 'lakshmi.partner@udyam.demo');
  const cases = (await partner.get('/partner/cases')).body.cases;
  const failed = cases.find(item => item.kind === 'payment_failed' && item.order?.id === id);
  assert.ok(failed, 'Chennai partner gets the failed payment');
  assert.equal(failed.contact.phone, '••••••0001', 'masked in the list');
  assert.equal((await partner.get(`/partner/cases/${failed.id}`)).body.case.contact.phone, '9811100001', 'assigned partner can call the owner');
  const paid = await owner.post(`/orders/${id}/pay`, { simulate: 'success', autopay: true });
  assert.equal(paid.body.order.status, 'awaiting_slot');
});

test('slot booking creates the kit and field jobs; warehouse packs; delivery confirmed by code', async () => {
  const id = state.order.id;
  const slot = (await owner.get(`/orders/${id}/slots`)).body.slots[0];
  const booked = await owner.post(`/orders/${id}/slot`, { date: slot.date, window: slot.windows[0] });
  assert.equal(booked.body.order.status, 'packing');
  assert.ok(booked.body.order.kit.some(line => line.item === 'Fibre router (ONT)'));
  await loginDemo(ops, 'vikram.ops@udyam.demo');
  assert.ok((await ops.get('/ops/packing')).body.orders.some(order => order.id === id));
  assert.equal((await ops.post(`/ops/orders/${id}/pack`, { serials: {} })).body.order.status, 'ready_for_dispatch');
  await loginDemo(courier, 'imran.delivery@udyam.demo');
  const job = (await courier.get('/field/jobs')).body.jobs.find(item => item.order.id === id && item.type === 'delivery');
  assert.ok(job, 'Chennai delivery agent assigned');
  assert.ok(!JSON.stringify(job).includes('9811100001'), 'agent sees a masked phone');
  await courier.post(`/field/jobs/${job.id}/start`);
  const code = (await owner.get(`/orders/${id}`)).body.order.deliveryCode;
  assert.match(code, /^\d{6}$/);
  assert.equal((await courier.post(`/field/jobs/${job.id}/deliver`, { code: '111111' })).status, 400);
  assert.equal((await courier.post(`/field/jobs/${job.id}/deliver`, { code })).body.job.status, 'done');
  assert.equal((await owner.get(`/orders/${id}`)).body.order.status, 'delivered');
});

test('technician installs, customer signs off, the line goes live with one bill', async () => {
  const id = state.order.id;
  await loginDemo(tech, 'karthik.tech@udyam.demo');
  const job = (await tech.get('/field/jobs')).body.jobs.find(item => item.order.id === id && item.type === 'installation');
  await tech.post(`/field/jobs/${job.id}/start`);
  assert.equal((await tech.post(`/field/jobs/${job.id}/signoff`)).status, 409, 'checklist first');
  await tech.patch(`/field/jobs/${job.id}/checklist`, { installed: true });
  await tech.patch(`/field/jobs/${job.id}/checklist`, { speedMbps: 97 });
  const form = new FormData(); form.append('file', file(), 'install.png');
  const uploaded = (await tech.post(`/field/jobs/${job.id}/photo`, form)).body.job;
  assert.equal(uploaded.checklist.hasPhoto, true);
  assert.equal(uploaded.checklist.photoKey, undefined, 'the storage key never leaves the server');
  // The photo is visible to the technician, the business owner and operations, and to no one else.
  for (const [who, client, status] of [['technician', tech, 200], ['owner', owner, 200], ['ops', ops, 200], ['another customer', anon, 401], ['courier', courier, 403]]) {
    assert.equal((await client.raw(`/field/jobs/${job.id}/photo`)).status, status, who);
  }
  assert.equal((await owner.get(`/orders/${id}`)).body.order.jobs.find(item => item.type === 'installation').checklist.hasPhoto, true);
  const retake = new FormData(); retake.append('file', file(), 'install-2.png');
  await tech.post(`/field/jobs/${job.id}/photo`, retake);
  assert.ok((await tech.get(`/field/jobs/${job.id}`)).body.job.history.some(entry => entry.note === 'Installation photo retaken'));
  assert.equal((await tech.post(`/field/jobs/${job.id}/signoff`)).body.sent, true);
  const code = (await owner.get(`/orders/${id}`)).body.order.installCode;
  assert.equal((await tech.post(`/field/jobs/${job.id}/complete`, { code })).body.job.status, 'done');
  const live = (await owner.get(`/orders/${id}`)).body.order;
  assert.equal(live.status, 'active');
  assert.ok(live.milestones.every(step => step.state === 'done' || step.state === 'current'));
  // Paid at order = first month + one-time setup, so going live raises no bill this month.
  const bills = (await owner.get('/me/bills')).body;
  assert.equal(bills.invoices.length, 0, 'the first month is never billed twice');
  const receipt = bills.receipts.find(row => row.ref === live.ref);
  assert.equal(receipt.amount, live.totals.dueNow);
  assert.equal(receipt.firstMonth + receipt.setup, receipt.amount, 'the payment is exactly first month + setup');
  assert.equal(bills.nextBill.amount, live.totals.monthly);
  const next = new Date(bills.nextBill.date);
  assert.equal(next.getDate(), 1, 'next bill on the 1st of next month');
  // Next month the scheduler raises one bill for the monthly amount, once.
  const billingDate = new Date(next.getTime() + 2 * 86_400_000).toISOString();
  assert.ok((await ops.post('/ops/scheduler/run', { billingDate })).body.bills >= 1, 'this owner plus the seeded live businesses');
  assert.equal((await ops.post('/ops/scheduler/run', { billingDate })).body.bills, 0, 'not raised twice');
  const later = (await owner.get('/me/bills')).body.invoices;
  assert.equal(later.length, 1);
  assert.equal(later[0].total, live.totals.monthly);
  assert.ok((await owner.get('/notifications')).body.notifications.some(item => item.kind === 'active'));
  assert.equal((await owner.post(`/orders/${id}/rate`, { score: 9 })).body.order.rating.score, 9);
});

test('support ticket → technician service visit → resolved', async () => {
  const ticket = await owner.post('/me/tickets', { category: 'slow_speed', subject: 'Slow in the evening', message: 'Billing tablet slow 7–9 pm' });
  assert.equal(ticket.status, 201);
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  assert.equal((await ops.post(`/ops/tickets/${ticket.body.ticket.id}/visit`, { date: tomorrow, window: '09:00–11:00' })).body.ok, true);
  const job = (await tech.get('/field/jobs')).body.jobs.find(item => item.type === 'service');
  await tech.post(`/field/jobs/${job.id}/start`);
  await tech.post(`/field/jobs/${job.id}/service-complete`, { notes: 'Moved router; 95 Mbps in the evening' });
  assert.equal((await owner.get('/me/tickets')).body.tickets[0].status, 'resolved');
});

test('add-on order reuses verification: straight to signature', async () => {
  const quote = await owner.post('/quotes', { mode: 'addon', baseOrderId: state.order.id, wants: ['P23'] });
  assert.ok(quote.body.quote.result.items.some(item => item.productId === 'P19'), 'GST-verified bundle now unlocked');
  const order = await owner.post('/orders', { quoteId: quote.body.quote.id });
  assert.equal(order.body.order.status, 'awaiting_signature');
  assert.equal((await owner.post(`/orders/${order.body.order.id}/callback`)).body.alreadyRequested, false);
  assert.equal((await owner.post(`/orders/${order.body.order.id}/callback`)).body.alreadyRequested, true);
  const item = (await partner.get('/partner/cases')).body.cases.find(row => row.kind === 'callback' && row.order?.id === order.body.order.id);
  assert.ok(item);
  assert.equal((await partner.post(`/partner/cases/${item.id}/log`, { outcome: 'helped', note: 'Explained CCTV', resolve: true })).body.case.status, 'resolved');
});

test('KYC officer works the review queue', async () => {
  const queue = (await officer.get('/review/queue')).body.businesses;
  const physio = queue.find(row => row.name === 'Neelgiri Physio Clinic');
  assert.ok(physio && physio.ownerRequested);
  const detail = (await officer.get(`/review/${physio.id}`)).body.business;
  assert.ok(detail.documents.some(doc => doc.checks.some(check => /Legal name differs/.test(check.label))));
  const decided = await officer.post(`/review/${physio.id}/decision`, { decision: 'request_reupload', docType: 'GST certificate', message: 'Upload the latest certificate' });
  assert.equal(decided.body.business.kyc.status, 'action_needed');
});

test('roles are enforced', async () => {
  assert.equal((await owner.get('/ops/dashboard')).status, 403);
  assert.equal((await partner.get('/review/queue')).status, 403);
  assert.equal((await courier.get('/partner/cases')).status, 403);
  assert.equal((await anon.get('/business/me')).status, 401);
  assert.equal((await owner.get('/field/jobs')).status, 403);
});

test('website callback: only the assigned partner sees the number', async () => {
  assert.equal((await anon.post('/callback-requests', { name: 'Ravi', phone: '9822200011', city: 'Pune', language: 'mr-IN' })).status, 201);
  const ravi = server.actor();
  await loginDemo(ravi, 'ravi.partner@udyam.demo');
  const item = (await ravi.get('/partner/cases')).body.cases.find(row => row.title.startsWith('Ravi (Pune)'));
  assert.ok(item, 'routed to the Pune partner');
  assert.equal((await ravi.get(`/partner/cases/${item.id}`)).body.case.contact.phone, '9822200011');
  assert.equal((await partner.get(`/partner/cases/${item.id}`)).status, 403);
});

test('tracking from any browser needs reference + last 4 digits', async () => {
  assert.equal((await anon.get(`/track?ref=${state.order.ref}&last4=0001`)).body.order.status, 'active');
  assert.equal((await anon.get(`/track?ref=${state.order.ref}&last4=9999`)).status, 404);
});

test('withdrawing consent before verification erases documents (DPDP)', async () => {
  const fresh = server.actor();
  await loginCustomer(fresh, '9811100003');
  await fresh.post('/kyc/consent');
  await fresh.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' });
  await upload(fresh, 'Address proof', { billed_to: 'Balaji Dental Care LLP', bill_date: '2026-07-01' });
  const withdrawn = await fresh.post('/kyc/consent/withdraw');
  assert.equal(withdrawn.body.erasedDocuments, 1);
  assert.equal(withdrawn.body.business.documents.length, 0);
  assert.equal(withdrawn.body.business.udyam, null);
  assert.equal((await fresh.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' })).status, 403);
});

test('privacy requests and audit log', async () => {
  const request = await owner.post('/me/data-requests', { type: 'access' });
  assert.equal(request.status, 201);
  assert.equal((await ops.post(`/ops/data-requests/${request.body.request.id}/complete`)).body.ok, true);
  const audit = (await ops.get('/ops/audit')).body.entries.map(entry => entry.action);
  for (const action of ['consent.given', 'kyc.gstin_lookup', 'kyc.document_viewed', 'kyc.request_reupload', 'privacy.access_requested']) assert.ok(audit.includes(action), action);
});

test('erasure: deletes KYC data, except for a business with a live service', async () => {
  const live = await owner.post('/me/data-requests', { type: 'erasure' });
  assert.equal((await ops.post(`/ops/data-requests/${live.body.request.id}/complete`)).body.outcome, 'retained_legal');
  assert.equal((await owner.get('/business/me')).body.business.kyc.status, 'verified');
  const leaver = server.actor();
  await loginCustomer(leaver, '9811100004');
  await leaver.post('/kyc/consent');
  await leaver.post('/kyc/udyam', { udyam: 'UDYAM-KL-00-3078801' });
  await upload(leaver, 'Address proof', { billed_to: 'Balaji Dental Care LLP', bill_date: '2026-07-01' });
  const request = await leaver.post('/me/data-requests', { type: 'erasure' });
  assert.equal((await ops.post(`/ops/data-requests/${request.body.request.id}/complete`)).body.outcome, 'erased');
  const business = (await leaver.get('/business/me')).body.business;
  assert.equal(business.documents.length, 0);
  assert.equal(business.udyam, null);
  assert.equal((await ops.post(`/ops/data-requests/${request.body.request.id}/complete`)).status, 409);
  assert.equal((await leaver.get('/me/data')).body.requests[0].outcome, 'erased');
});

test('ops dashboard reflects the live journey and the historical baseline', async () => {
  const dashboard = (await ops.get('/ops/dashboard')).body;
  assert.ok(dashboard.kpis.find(kpi => kpi.key === 'conversion').value > 0);
  // The historical quarter appears only as the baseline each live KPI is compared against.
  const baseline = key => dashboard.kpis.find(kpi => kpi.key === key).baseline;
  assert.equal(baseline('conversion'), 7.4);
  assert.equal(baseline('cac'), 15053);
  assert.equal(baseline('days'), 17.6);
  assert.equal((await ops.get('/ops/insights')).status, 404, 'the historical-only page is gone');
});
