import { z } from 'zod';
import { Order, Invoice, Ticket, Notification, Consent, DataRequest, Business, Quote } from '../models/index.js';
import { storageDriver } from '../libs/storage.js';
import { periodOf, nextPeriod, billedFrom, firstOfPeriod } from '../services/orderFlow.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

export async function services(req, res) {
  const orders = await Order.find({ owner: req.user._id, status: 'active' }).sort({ activatedAt: 1 }).lean();
  const items = orders.flatMap(order => order.items.map(item => ({ ...item, orderId: String(order._id), orderRef: order.ref, activatedAt: order.activatedAt })));
  const monthly = orders.reduce((sum, order) => sum + (order.totals?.monthly || 0), 0);
  res.json({ services: items, orders: orders.map(order => ({ id: String(order._id), ref: order.ref, bundleName: order.bundleName, activatedAt: order.activatedAt, rating: order.rating?.score ?? null })), monthly });
}

export async function bills(req, res) {
  const business = await Business.findOne({ owner: req.user._id }).lean();
  const invoices = business ? await Invoice.find({ business: business._id }).sort({ createdAt: -1 }).lean() : [];
  const receipts = await Order.find({ owner: req.user._id, paidAt: { $ne: null } }).sort({ paidAt: -1 }).lean();
  // Paid at order = first month + one-time setup; monthly bills start the month after go-live.
  const next = nextPeriod(periodOf(new Date()));
  const billedNext = receipts.filter(order => order.status === 'active' && billedFrom(order) <= next);
  res.json({
    nextBill: billedNext.length ? { date: firstOfPeriod(next), amount: billedNext.reduce((sum, order) => sum + (order.totals?.monthly || 0), 0) } : null,
    invoices: invoices.map(invoice => ({ id: String(invoice._id), number: invoice.number, period: invoice.period, lines: invoice.lines, subtotal: invoice.subtotal, tax: invoice.tax, total: invoice.total, status: invoice.status, dueDate: invoice.dueDate, paidAt: invoice.paidAt, autopay: invoice.autopay })),
    receipts: receipts.map(order => ({
      ref: order.ref, orderId: String(order._id), status: order.status, amount: order.payments.find(payment => payment.status === 'success')?.amount, paidAt: order.paidAt, reference: order.payments.find(payment => payment.status === 'success')?.reference,
      firstMonth: order.totals?.monthly || 0, setup: (order.totals?.setup || 0) + (order.totals?.setupTax || 0), monthlyFrom: order.status === 'active' ? firstOfPeriod(billedFrom(order)) : null,
    })),
  });
}

export async function payBill(req, res) {
  const business = await Business.findOne({ owner: req.user._id }).lean();
  const invoice = await Invoice.findOne({ _id: req.params.id, business: business?._id });
  if (!invoice) throw new HttpError(404, 'Bill not found.');
  if (invoice.status === 'paid') throw new HttpError(409, 'This bill is already paid.');
  const { autopay } = z.object({ autopay: z.boolean().optional() }).parse(req.body || {});
  invoice.status = 'paid';
  invoice.paidAt = new Date();
  if (autopay !== undefined) invoice.autopay = autopay;
  await invoice.save();
  if (autopay !== undefined) await Order.updateMany({ owner: req.user._id, status: 'active' }, { $set: { autopay } });
  res.json({ ok: true });
}

export async function createTicket(req, res) {
  const body = z.object({ category: z.enum(['no_internet', 'slow_speed', 'billing', 'device', 'other']), subject: z.string().trim().min(3).max(120), message: z.string().trim().min(3).max(1000), orderId: z.string().optional() }).parse(req.body);
  const business = await Business.findOne({ owner: req.user._id });
  if (!business) throw new HttpError(409, 'Create your business account first.');
  const order = body.orderId ? await Order.findOne({ _id: body.orderId, owner: req.user._id }).lean() : await Order.findOne({ owner: req.user._id, status: 'active' }).sort({ activatedAt: -1 }).lean();
  const ticket = await Ticket.create({ business: business._id, owner: req.user._id, order: order?._id, category: body.category, subject: body.subject, messages: [{ by: req.user._id, role: 'customer', text: body.message }] });
  res.status(201).json({ ticket: { id: String(ticket._id) } });
}

export async function myTickets(req, res) {
  const rows = await Ticket.find({ owner: req.user._id }).sort({ updatedAt: -1 }).populate('order', 'ref').lean();
  res.json({ tickets: rows.map(ticket => ({ id: String(ticket._id), subject: ticket.subject, category: ticket.category, status: ticket.status, order: ticket.order?.ref, messages: ticket.messages.map(message => ({ role: message.role, text: message.text, at: message.at })), updatedAt: ticket.updatedAt })) });
}

export async function replyTicket(req, res) {
  const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
  const ticket = await Ticket.findOne({ _id: req.params.id, owner: req.user._id });
  if (!ticket) throw new HttpError(404, 'Request not found.');
  ticket.messages.push({ by: req.user._id, role: 'customer', text });
  if (ticket.status === 'resolved') ticket.status = 'open';
  await ticket.save();
  res.json({ ok: true });
}

export async function notifications(req, res) {
  const rows = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ notifications: rows.map(row => ({ id: String(row._id), kind: row.kind, title: row.title, body: row.body, link: row.link, channel: row.channel, read: row.read, at: row.createdAt })), unread: rows.filter(row => !row.read).length });
}

export async function markRead(req, res) {
  await Notification.updateMany({ user: req.user._id, ...(req.body?.id ? { _id: req.body.id } : {}) }, { $set: { read: true } });
  res.json({ ok: true });
}

// DPDP rights: what we hold, consents given, and requests for access, correction or erasure.
export async function myData(req, res) {
  const business = await Business.findOne({ owner: req.user._id }).lean();
  const [consents, requests, orders, quotes] = await Promise.all([
    Consent.find({ user: req.user._id }).sort({ grantedAt: -1 }).lean(), DataRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).lean(),
    Order.countDocuments({ owner: req.user._id }), Quote.countDocuments({ owner: req.user._id }),
  ]);
  res.json({
    account: { name: req.user.name, phone: `••••••${String(req.user.phone || '').slice(-4)}`, language: req.user.preferredLanguage, since: req.user.createdAt },
    business: business && { name: business.name, gst: business.gst?.masked || null, udyam: business.udyam?.masked || null, kycStatus: business.kyc?.status, verifiedAt: business.kyc?.verifiedAt, expiresAt: business.kyc?.expiresAt },
    documents: (business?.documents || []).map(doc => ({ type: doc.type, uploadedAt: doc.uploadedAt, storage: doc.storageDriver || storageDriver(), retention: business.kyc?.status === 'verified' ? 'Kept while you are a customer, then deleted per telecom KYC rules' : 'Deleted if you withdraw consent before verification' })),
    consents: consents.map(consent => ({ purpose: consent.purpose, scope: consent.scope, grantedAt: consent.grantedAt, expiresAt: consent.expiresAt, withdrawnAt: consent.withdrawnAt })),
    counts: { orders, quotes },
    requests: requests.map(request => ({ id: String(request._id), type: request.type, status: request.status, outcome: request.outcome || null, note: request.note, createdAt: request.createdAt, dueBy: request.dueBy })),
  });
}

export async function createDataRequest(req, res) {
  const body = z.object({ type: z.enum(['access', 'correction', 'erasure']), note: z.string().trim().max(500).default('') }).parse(req.body);
  const business = await Business.findOne({ owner: req.user._id }).lean();
  const request = await DataRequest.create({ user: req.user._id, business: business?._id, type: body.type, note: body.note, dueBy: new Date(Date.now() + 30 * 86_400_000) });
  await audit(req.user, `privacy.${body.type}_requested`, 'DataRequest', request._id);
  res.status(201).json({ request: { id: String(request._id), type: request.type, status: request.status, dueBy: request.dueBy } });
}
