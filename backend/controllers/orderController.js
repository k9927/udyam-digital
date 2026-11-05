import { z } from 'zod';
import { Order, Quote, Business, Job, User } from '../models/index.js';
import { validateLines, buildQuote } from '../libs/pricing.js';
import { decrypt, sha256, randomToken } from '../libs/security.js';
import { getCatalogue } from '../services/reference.js';
import { isVerified } from '../services/kycService.js';
import { ensureBusiness } from './quoteController.js';
import { newOrderRef, setStatus, pushEvent, availableSlots, addBusinessDays, SLOT_WINDOWS, STATUS_FLOW } from '../services/orderFlow.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { notifyCustomer } from '../services/notify.js';
import { openCase } from '../services/routing.js';
import { HttpError } from '../middlewares/error.js';

const STAFF = ['partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin', 'super_admin'];

export function milestones(order) {
  const base = order.paidAt || order.createdAt;
  const installDays = Number(order.totals?.installDays || 3);
  const slotDate = order.slot?.date;
  const stamp = status => order.events?.find(event => event.status === status)?.at;
  const plan = {
    awaiting_kyc: order.createdAt, awaiting_signature: stamp('awaiting_signature') || order.createdAt, awaiting_payment: stamp('awaiting_payment'),
    awaiting_slot: order.paidAt, packing: stamp('packing') || (order.paidAt && addBusinessDays(base, 1)),
    ready_for_dispatch: stamp('ready_for_dispatch') || slotDate || addBusinessDays(base, Math.max(1, Math.round(installDays * 0.4))),
    out_for_delivery: stamp('out_for_delivery') || slotDate, delivered: stamp('delivered') || slotDate, installing: stamp('installing') || slotDate,
    installed: stamp('installed') || slotDate, active: order.activatedAt || slotDate || addBusinessDays(base, installDays),
  };
  const currentIndex = STATUS_FLOW.indexOf(order.status);
  return STATUS_FLOW.map((status, index) => ({ status, at: plan[status] || null, state: order.status === 'cancelled' ? 'cancelled' : index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming' }));
}

// An order placed on a self-declared GSTIN is priced without GST-only products. Once the GSTIN is verified,
// and before the owner signs, offer the same answers re-priced with everything the verified GSTIN unlocks.
async function gstUpgrade(order) {
  if (order.kind !== 'new' || order.status !== 'awaiting_signature' || !order.quote) return null;
  const business = await Business.findById(order.business).lean();
  if (!isVerified(business) || business.kyc.tier !== 'gst') return null;
  const quote = await Quote.findById(order.quote).lean();
  if (!quote) return null;
  const result = buildQuote({ profile: quote.profile, catalogue: await getCatalogue(), gstVerified: true, wants: quote.wants, budget: quote.budget, enabledAddons: quote.enabledAddons, quantities: quote.quantities, removed: quote.removed });
  const key = items => items.map(item => `${item.productId}×${item.quantity}`).sort().join(',');
  if (key(result.items) === key(order.items)) return null;
  const before = new Set(order.items.map(item => item.productId));
  const after = new Set(result.items.map(item => item.productId));
  return {
    result,
    view: {
      bundleName: result.bundleName, monthly: result.totals.monthly, dueNow: result.totals.dueNow, monthlyDelta: result.totals.monthly - order.totals.monthly,
      added: result.items.filter(item => !before.has(item.productId)).map(item => ({ name: item.name, why: item.why })),
      removed: order.items.filter(item => !after.has(item.productId)).map(item => item.name),
    },
  };
}

export async function presentOrder(order, viewer) {
  const isOwner = viewer && String(order.owner) === String(viewer._id);
  const jobs = await Job.find({ order: order._id }).populate('assignee', 'name role').lean();
  const partner = order.partner ? await User.findById(order.partner).select('name').lean() : null;
  const view = {
    id: String(order._id), ref: order.ref, kind: order.kind, bundleName: order.bundleName, status: order.status, items: order.items, totals: order.totals,
    events: order.events.map(event => ({ status: event.status, type: event.type, note: event.note, role: event.role, at: event.at })),
    signature: order.signature?.signedAt ? { signerName: order.signature.signerName, signedAt: order.signature.signedAt } : null,
    payments: order.payments.map(payment => ({ amount: payment.amount, status: payment.status, reason: payment.reason, reference: payment.reference, at: payment.at })),
    paymentFailures: order.paymentFailures, autopay: order.autopay, slot: order.slot?.date ? order.slot : null, kit: order.kit,
    callbackRequestedAt: order.callbackRequestedAt, rating: order.rating?.score !== undefined ? order.rating : null, partner: partner?.name || null,
    createdAt: order.createdAt, paidAt: order.paidAt, activatedAt: order.activatedAt, dueBy: order.dueBy, slaBreached: order.slaBreached, cancelReason: order.cancelReason,
    milestones: milestones(order),
    jobs: jobs.map(job => ({ id: String(job._id), type: job.type, status: job.status, slot: job.slot, assignee: job.assignee?.name || null, attempts: job.attempts, failReason: job.failReason, checklist: { arrivedAt: job.checklist?.arrivedAt, installedAt: job.checklist?.installedAt, speedMbps: job.checklist?.speedMbps, signedOffAt: job.checklist?.signedOffAt, hasPhoto: Boolean(job.checklist?.photoKey), photoAt: job.checklist?.photoAt } })),
  };
  if (isOwner) {
    if (order.status === 'out_for_delivery' && order.handover?.delivery) view.deliveryCode = decrypt(order.handover.delivery);
    if (order.status === 'installing' && order.handover?.install) view.installCode = decrypt(order.handover.install);
    view.gstUpgrade = (await gstUpgrade(order))?.view || null;
  }
  return view;
}

async function ownedOrder(req) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new HttpError(404, 'Order not found.');
  const owner = String(order.owner) === String(req.user._id);
  if (!owner && !STAFF.includes(req.user.role)) throw new HttpError(404, 'Order not found.');
  return { order, owner };
}
const requireOwner = (owner) => { if (!owner) throw new HttpError(403, 'Only the business owner can do this.'); };
const expect = (order, ...statuses) => { if (!statuses.includes(order.status)) throw new HttpError(409, 'This step is not available for the order right now.'); };

export async function create(req, res) {
  const { quoteId } = z.object({ quoteId: z.string() }).parse(req.body);
  const quote = await Quote.findOne({ _id: quoteId, owner: req.user._id });
  if (!quote) throw new HttpError(404, 'Save your quote before placing the order.');
  if (quote.status === 'ordered') throw new HttpError(409, 'This quote is already ordered.');
  const business = await ensureBusiness(req.user, quote.profile);
  const verified = isVerified(business);
  const lines = quote.result.items.map(item => ({ productId: item.productId, quantity: item.quantity }));
  const catalogue = await getCatalogue();
  const strictError = validateLines(lines, quote.profile, catalogue, verified && business.kyc.tier === 'gst');
  if (strictError && verified) throw new HttpError(409, `${strictError} Your business is verified through Udyam; a GST-verified business can buy this.`);
  const looseError = validateLines(lines, quote.profile, catalogue, true);
  if (looseError) throw new HttpError(400, looseError);
  const order = new Order({
    ref: await newOrderRef(), business: business._id, owner: req.user._id, quote: quote._id, kind: quote.mode, bundleName: quote.result.bundleName,
    items: quote.result.items, totals: quote.result.totals, profile: quote.profile, status: verified ? 'awaiting_signature' : 'awaiting_kyc',
  });
  pushEvent(order, { status: order.status, note: verified ? 'Business already verified; KYC reused' : 'Waiting for business verification', actor: req.user });
  await order.save();
  quote.status = 'ordered';
  await quote.save();
  business.profile = quote.profile;
  await business.save();
  await notifyCustomer(req.user._id, 'order_created', { ref: order.ref }, `/app/orders/${order._id}`);
  res.status(201).json({ order: await presentOrder(order, req.user) });
}

export async function applyGstUpgrade(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  const upgrade = await gstUpgrade(order);
  if (!upgrade) throw new HttpError(409, 'There is no re-priced bundle for this order right now.');
  Object.assign(order, { bundleName: upgrade.result.bundleName, items: upgrade.result.items, totals: upgrade.result.totals });
  pushEvent(order, { type: 'repriced', status: order.status, note: `Re-priced with the verified GSTIN: ${upgrade.view.added.map(item => item.name).join(', ') || 'updated bundle'}`, actor: req.user });
  await order.save();
  await Quote.updateOne({ _id: order.quote }, { $set: { result: upgrade.result } });
  res.json({ order: await presentOrder(order, req.user) });
}

export async function mine(req, res) {
  const orders = await Order.find({ owner: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ orders: orders.map(order => ({ id: String(order._id), ref: order.ref, status: order.status, bundleName: order.bundleName, kind: order.kind, monthly: order.totals?.monthly, createdAt: order.createdAt, activatedAt: order.activatedAt, slot: order.slot })) });
}

export async function get(req, res) {
  const { order } = await ownedOrder(req);
  res.json({ order: await presentOrder(order, req.user) });
}

export async function requestSignature(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'awaiting_signature');
  const { devCode } = await issueOtp('esign', String(order._id));
  res.json({ sent: true, devCode });
}

export async function sign(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'awaiting_signature');
  const body = z.object({ code: z.string().trim().min(4), signerName: z.string().trim().min(2).max(80) }).parse(req.body);
  await verifyOtp('esign', String(order._id), body.code);
  order.signature = { signerName: body.signerName, signedAt: new Date(), documentHash: sha256(JSON.stringify({ ref: order.ref, items: order.items, totals: order.totals })) };
  await setStatus(order, 'awaiting_payment', { actor: req.user, note: `Contract e-signed by ${body.signerName}` });
  res.json({ order: await presentOrder(order, req.user) });
}

// Simulated UPI checkout with success and failure paths; two failures route the case to a partner.
export async function pay(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'awaiting_payment');
  const body = z.object({ simulate: z.enum(['success', 'failure']).default('success'), autopay: z.boolean().default(true) }).parse(req.body || {});
  const amount = order.totals.dueNow;
  if (body.simulate === 'failure') {
    order.payments.push({ amount, status: 'failed', method: 'upi', reason: 'Bank declined the UPI request', reference: `UPI${randomToken(6).toUpperCase()}` });
    order.paymentFailures += 1;
    pushEvent(order, { type: 'payment_failed', note: `Payment attempt ${order.paymentFailures} failed`, actor: req.user });
    await order.save();
    await notifyCustomer(order.owner, 'payment_failed', { ref: order.ref }, `/app/orders/${order._id}`);
    if (order.paymentFailures >= 2) {
      const business = await Business.findById(order.business).lean();
      await openCase({ kind: 'payment_failed', business: business._id, order: order._id, title: `${business.name}: payment failed twice`, reason: `₹${amount.toLocaleString('en-IN')} for ${order.ref}`, city: business.city, state: business.state, language: business.preferredLanguage, ownerId: order.owner });
    }
    return res.status(402).json({ error: 'The payment did not go through. You can try again.', order: await presentOrder(order, req.user) });
  }
  order.payments.push({ amount, status: 'success', method: 'upi', reference: `UPI${randomToken(6).toUpperCase()}` });
  order.paidAt = new Date();
  order.autopay = body.autopay;
  order.dueBy = addBusinessDays(new Date(), Math.max(2, Number(order.totals.installDays || 3)));
  await setStatus(order, 'awaiting_slot', { actor: req.user, note: `Paid ₹${amount.toLocaleString('en-IN')} by UPI${body.autopay ? '; autopay on' : ''}` });
  res.json({ order: await presentOrder(order, req.user) });
}

export async function slots(req, res) {
  const { order } = await ownedOrder(req);
  res.json({ slots: availableSlots(order) });
}

export async function bookSlot(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'awaiting_slot');
  const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), window: z.enum(SLOT_WINDOWS) }).parse(req.body);
  if (!availableSlots(order).some(slot => slot.date === body.date)) throw new HttpError(400, 'Choose one of the available dates.');
  order.slot = body;
  order.dueBy = new Date(`${body.date}T18:00:00`);
  await setStatus(order, 'packing', { actor: req.user, note: `Installation booked for ${body.date}, ${body.window}` });
  res.json({ order: await presentOrder(order, req.user) });
}

export async function requestCallback(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  const already = Boolean(order.callbackRequestedAt) && order.status !== 'active';
  if (!already) {
    order.callbackRequestedAt = new Date();
    order.statusCalls += 1;
    pushEvent(order, { type: 'callback', note: 'Owner asked for a call', actor: req.user });
    await order.save();
    const business = await Business.findById(order.business).lean();
    await openCase({ kind: 'callback', business: business._id, order: order._id, title: `${business.name} asked for a call`, reason: `Order ${order.ref} is at "${order.status.replace(/_/g, ' ')}"`, city: business.city, state: business.state, language: business.preferredLanguage, ownerId: order.owner });
    await notifyCustomer(order.owner, 'callback', { ref: order.ref }, `/app/orders/${order._id}`);
  }
  res.json({ alreadyRequested: already, order: await presentOrder(order, req.user) });
}

export async function cancel(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing');
  order.cancelReason = String(req.body?.reason || 'Changed my mind').slice(0, 200);
  await setStatus(order, 'cancelled', { actor: req.user, note: order.paidAt ? `Cancelled: ${order.cancelReason}. Refund initiated.` : `Cancelled: ${order.cancelReason}` });
  res.json({ order: await presentOrder(order, req.user) });
}

export async function rate(req, res) {
  const { order, owner } = await ownedOrder(req);
  requireOwner(owner);
  expect(order, 'active');
  const body = z.object({ score: z.number().int().min(0).max(10), comment: z.string().max(300).optional() }).parse(req.body);
  order.rating = { ...body, at: new Date() };
  await order.save();
  res.json({ order: await presentOrder(order, req.user) });
}

// Public tracking from any browser: order reference plus the last 4 digits of the registered mobile.
export async function track(req, res) {
  const { ref, last4 } = z.object({ ref: z.string().trim().toUpperCase(), last4: z.string().regex(/^\d{4}$/) }).parse(req.query);
  const order = await Order.findOne({ ref });
  const owner = order && await User.findById(order.owner).lean();
  if (!order || !owner?.phone?.endsWith(last4)) throw new HttpError(404, 'No order matches that reference and number.');
  const view = await presentOrder(order, null);
  res.json({ order: { ref: view.ref, bundleName: view.bundleName, status: view.status, milestones: view.milestones, slot: view.slot, events: view.events.filter(event => event.type === 'status'), partner: view.partner, items: view.items.map(item => ({ name: item.name, quantity: item.quantity })) } });
}
