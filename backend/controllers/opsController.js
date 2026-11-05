import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Order, Business, Case, Ticket, Job, User, Product, AuditLog, DataRequest, Quote, WaSession, WaMessage, ROLES } from '../models/index.js';
import { deleteObject } from '../libs/storage.js';
import { syncIdentity } from '../services/kycService.js';
import { liveMetrics } from '../services/insights.js';
import { setStatus, pushEvent, SLOT_WINDOWS } from '../services/orderFlow.js';
import { pickFieldStaff } from '../services/routing.js';
import { notifyCustomer, notifyStaff } from '../services/notify.js';
import { invalidateCatalogue } from '../services/reference.js';
import { presentOrder } from './orderController.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

export async function dashboard(req, res) {
  res.json(await liveMetrics());
}


export async function orders(req, res) {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.ref = { $regex: String(req.query.q).replace(/[^A-Za-z0-9-]/g, ''), $options: 'i' };
  if (req.query.late === 'true') { filter.dueBy = { $lt: new Date() }; filter.status = { $nin: ['active', 'cancelled'] }; }
  const rows = await Order.find(filter).sort({ updatedAt: -1 }).limit(100).populate('business', 'name city').lean();
  res.json({ orders: rows.map(order => ({ id: String(order._id), ref: order.ref, business: order.business?.name, city: order.business?.city, status: order.status, monthly: order.totals?.monthly, createdAt: order.createdAt, updatedAt: order.updatedAt, dueBy: order.dueBy, late: order.dueBy && new Date(order.dueBy) < new Date() && !['active', 'cancelled'].includes(order.status), slot: order.slot, statusCalls: order.statusCalls })) });
}

export async function orderDetail(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new HttpError(404, 'Order not found.');
  const business = await Business.findById(order.business).lean();
  res.json({ order: await presentOrder(order, req.user), business: { id: String(business._id), name: business.name, city: business.city, kycStatus: business.kyc?.status, tier: business.kyc?.tier } });
}

// Warehouse step (run by operations in this prototype): pack the generated kit, record serial numbers, release to delivery.
export async function packingQueue(req, res) {
  const rows = await Order.find({ status: 'packing' }).sort({ 'slot.date': 1 }).populate('business', 'name city').lean();
  res.json({ orders: rows.map(order => ({ id: String(order._id), ref: order.ref, business: order.business?.name, city: order.business?.city, slot: order.slot, kit: order.kit })) });
}

export async function packOrder(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order || order.status !== 'packing') throw new HttpError(409, 'This order is not waiting to be packed.');
  const serials = z.record(z.array(z.string().trim().max(40))).default({}).parse(req.body?.serials || {});
  order.kit = order.kit.map(line => ({ ...line.toObject?.() ?? line, serials: (serials[line.item] || []).filter(Boolean).length ? serials[line.item].filter(Boolean) : Array.from({ length: line.quantity }, (_, index) => `${line.item.replace(/[^A-Z]/g, '').slice(0, 3) || 'KIT'}-${order.ref.slice(-5)}-${index + 1}`) }));
  await setStatus(order, 'ready_for_dispatch', { actor: req.user, note: 'Kit packed and serials recorded' });
  res.json({ order: await presentOrder(order, req.user) });
}

export async function cases(req, res) {
  const filter = {};
  if (req.query.kind) filter.kind = req.query.kind;
  filter.status = req.query.status === 'resolved' ? 'resolved' : { $ne: 'resolved' };
  const rows = await Case.find({ ...filter, kind: req.query.kind || { $ne: 'lead' } }).sort({ priority: -1, createdAt: 1 }).limit(150).populate('assignedTo', 'name').populate('business', 'name').lean();
  const partners = await User.find({ role: 'partner', active: true }).select('name region').lean();
  res.json({
    cases: rows.map(item => ({ id: String(item._id), kind: item.kind, title: item.title, reason: item.reason, city: item.city, status: item.status, priority: item.priority, assignedTo: item.assignedTo?.name || null, assignedId: item.assignedTo?._id ? String(item.assignedTo._id) : null, createdAt: item.createdAt, overdue: item.dueAt && item.dueAt < new Date() && item.status !== 'resolved' })),
    partners: partners.map(partner => ({ id: String(partner._id), name: partner.name, cities: partner.region?.cities || [] })),
  });
}

export async function assignCase(req, res) {
  const { userId } = z.object({ userId: z.string() }).parse(req.body);
  const partner = await User.findOne({ _id: userId, role: 'partner' });
  if (!partner) throw new HttpError(400, 'Choose a partner.');
  const item = await Case.findByIdAndUpdate(req.params.id, { $set: { assignedTo: partner._id }, $push: { notes: { by: req.user._id, text: `Assigned to ${partner.name} by operations`, outcome: 'assigned' } } }, { returnDocument: 'after' });
  if (!item) throw new HttpError(404, 'Case not found.');
  await notifyStaff(partner._id, `Case assigned: ${item.title}`, item.reason, `/partner/cases/${item._id}`);
  res.json({ ok: true });
}

export async function tickets(req, res) {
  const rows = await Ticket.find(req.query.status ? { status: req.query.status } : { status: { $ne: 'resolved' } }).sort({ updatedAt: -1 }).limit(100).populate('business', 'name city').populate('order', 'ref').lean();
  res.json({ tickets: rows.map(ticket => ({ id: String(ticket._id), subject: ticket.subject, category: ticket.category, status: ticket.status, business: ticket.business?.name, city: ticket.business?.city, order: ticket.order?.ref, messages: ticket.messages.map(message => ({ role: message.role, text: message.text, at: message.at })), visitJob: ticket.visitJob ? String(ticket.visitJob) : null, updatedAt: ticket.updatedAt })) });
}

export async function replyTicket(req, res) {
  const { text, resolve } = z.object({ text: z.string().trim().min(1).max(1000), resolve: z.boolean().default(false) }).parse(req.body);
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw new HttpError(404, 'Ticket not found.');
  ticket.messages.push({ by: req.user._id, role: req.user.role, text });
  ticket.status = resolve ? 'resolved' : 'in_progress';
  if (resolve) ticket.resolvedAt = new Date();
  await ticket.save();
  await notifyCustomer(ticket.owner, 'ticket_update', { name: ticket.subject }, '/app/help');
  res.json({ ok: true });
}

export async function scheduleVisit(req, res) {
  const body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), window: z.enum(SLOT_WINDOWS) }).parse(req.body);
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket?.order) throw new HttpError(409, 'Link the ticket to an order to schedule a visit.');
  const business = await Business.findById(ticket.business).lean();
  const technician = await pickFieldStaff('technician', business.city);
  const job = await Job.create({ order: ticket.order, business: ticket.business, ticket: ticket._id, type: 'service', assignee: technician?._id, slot: body, city: business.city, address: business.gst?.address || business.city });
  ticket.visitJob = job._id;
  ticket.status = 'in_progress';
  ticket.messages.push({ by: req.user._id, role: req.user.role, text: `Technician visit booked for ${body.date}, ${body.window}.` });
  await ticket.save();
  const order = await Order.findById(ticket.order);
  pushEvent(order, { type: 'service_visit', note: `Service visit booked for ${body.date}`, actor: req.user });
  await order.save();
  if (technician) await notifyStaff(technician._id, `Service visit: ${business.name}`, `${body.date}, ${body.window}`, '/field');
  await notifyCustomer(ticket.owner, 'ticket_update', { name: ticket.subject }, '/app/help');
  res.json({ ok: true, technician: technician?.name });
}

export async function users(req, res) {
  const rows = await User.find({ role: { $ne: 'customer' } }).sort({ role: 1, name: 1 }).lean();
  res.json({ users: rows.map(user => ({ id: String(user._id), role: user.role, name: user.name, email: user.email, region: user.region, active: user.active, demo: user.demo, lastLoginAt: user.lastLoginAt })), roles: ROLES.filter(role => role !== 'customer') });
}

export async function createUser(req, res) {
  const body = z.object({ role: z.enum(['partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin']), name: z.string().trim().min(2).max(80), email: z.string().trim().email(), password: z.string().min(8), cities: z.array(z.string()).default([]), states: z.array(z.string()).default([]), languages: z.array(z.string()).default([]) }).parse(req.body);
  if (await User.exists({ email: body.email.toLowerCase() })) throw new HttpError(409, 'A user with this email already exists.');
  const user = await User.create({ role: body.role, name: body.name, email: body.email, passwordHash: await bcrypt.hash(body.password, 10), region: { cities: body.cities, states: body.states, languages: body.languages } });
  await audit(req.user, 'user.created', 'User', user._id, { role: body.role });
  res.status(201).json({ user: { id: String(user._id), role: user.role, name: user.name, email: user.email } });
}

export async function toggleUser(req, res) {
  const user = await User.findOne({ _id: req.params.id, role: { $ne: 'customer' } });
  if (!user) throw new HttpError(404, 'User not found.');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot deactivate yourself.');
  user.active = !user.active;
  await user.save();
  await audit(req.user, user.active ? 'user.activated' : 'user.deactivated', 'User', user._id);
  res.json({ active: user.active });
}

export async function catalogue(req, res) {
  res.json({ products: (await Product.find().sort({ product_id: 1 }).lean()).map(({ _id, __v, ...rest }) => rest) });
}

export async function updateProduct(req, res) {
  const body = z.object({ price_min_inr_per_month: z.number().int().min(1), price_max_inr_per_month: z.number().int().min(1), one_time_setup_inr: z.number().int().min(0) }).partial().parse(req.body);
  const product = await Product.findOne({ product_id: req.params.productId });
  if (!product) throw new HttpError(404, 'Product not found.');
  const before = { min: product.get('price_min_inr_per_month'), max: product.get('price_max_inr_per_month'), setup: product.get('one_time_setup_inr') };
  for (const [key, value] of Object.entries(body)) product.set(key, String(value));
  if (Number(product.get('price_min_inr_per_month')) > Number(product.get('price_max_inr_per_month'))) throw new HttpError(400, 'Starting price cannot exceed the maximum price.');
  await product.save();
  invalidateCatalogue();
  await audit(req.user, 'catalogue.price_changed', 'Product', req.params.productId, { before, after: body });
  res.json({ ok: true });
}

export async function auditLog(req, res) {
  const rows = await AuditLog.find(req.query.action ? { action: { $regex: String(req.query.action).replace(/[^a-z._]/g, '') } } : {}).sort({ createdAt: -1 }).limit(200).populate('actor', 'name role').lean();
  res.json({ entries: rows.map(row => ({ id: String(row._id), at: row.createdAt, actor: row.actor?.name || 'system', role: row.role, action: row.action, target: row.target, targetId: row.targetId, meta: row.meta })) });
}

export async function dataRequests(req, res) {
  const rows = await DataRequest.find().sort({ createdAt: -1 }).limit(100).populate('user', 'name').lean();
  res.json({ requests: rows.map(row => ({ id: String(row._id), type: row.type, note: row.note, status: row.status, outcome: row.outcome || null, user: row.user?.name || 'Customer', createdAt: row.createdAt, dueBy: row.dueBy })) });
}

// Erasure deletes KYC files, documents, identifiers, unordered quotes and the WhatsApp thread. A business with
// any order that is not cancelled keeps its KYC record, because telecom KYC rules require it for a live service.
async function erase(request) {
  const business = request.business ? await Business.findById(request.business) : await Business.findOne({ owner: request.user });
  const user = await User.findById(request.user).lean();
  if (user?.phone) await Promise.all([WaMessage.deleteMany({ phone: user.phone }), WaSession.deleteOne({ phone: user.phone })]);
  await Quote.deleteMany({ owner: request.user, status: { $ne: 'ordered' } });
  if (!business) return 'nothing_held';
  if (await Order.exists({ business: business._id, status: { $ne: 'cancelled' } })) return 'retained_legal';
  for (const doc of business.documents) await deleteObject(doc.storageKey).catch(() => {});
  business.documents = [];
  business.gst = undefined;
  business.udyam = undefined;
  business.ownerKyc = undefined;
  business.set('registration.declared', undefined);
  business.set('registration.path', null);
  syncIdentity(business);
  business.kyc = { status: 'not_started', tier: null, missing: [], failed: [], warnings: [], reviewRequests: [], decisions: [] };
  await business.save();
  return 'erased';
}

export async function completeDataRequest(req, res) {
  const request = await DataRequest.findById(req.params.id);
  if (!request) throw new HttpError(404, 'Request not found.');
  if (request.status === 'completed') throw new HttpError(409, 'This request is already completed.');
  if (request.type === 'erasure') request.outcome = await erase(request);
  request.status = 'completed';
  await request.save();
  await audit(req.user, 'privacy.request_completed', 'DataRequest', request._id, { type: request.type, outcome: request.outcome });
  await notifyCustomer(request.user, 'ticket_update', { name: `${request.type} request completed` }, '/app/data');
  res.json({ ok: true, outcome: request.outcome || null });
}
