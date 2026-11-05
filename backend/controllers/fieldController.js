import { z } from 'zod';
import { Job, Order, Business, Ticket } from '../models/index.js';
import { maskPhone, encrypt } from '../libs/security.js';
import { putObject, getObject, deleteObject } from '../libs/storage.js';
import { setStatus, pushEvent, addBusinessDays, isoDate } from '../services/orderFlow.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { notifyCustomer } from '../services/notify.js';
import { openCase } from '../services/routing.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

// The storage key stays on the server; screens get a flag and fetch the photo through the access-checked endpoint.
export const presentChecklist = checklist => {
  const { photoKey, photoMime, ...rest } = checklist?.toObject ? checklist.toObject() : (checklist || {});
  return { ...rest, hasPhoto: Boolean(photoKey) };
};

async function presentJob(job) {
  const order = await Order.findById(job.order).lean();
  const business = await Business.findById(job.business).populate('owner', 'phone name').lean();
  return {
    id: String(job._id), type: job.type, status: job.status, slot: job.slot, attempts: job.attempts, failReason: job.failReason, checklist: presentChecklist(job.checklist), completedAt: job.completedAt,
    order: order && { id: String(order._id), ref: order.ref, status: order.status, bundleName: order.bundleName, items: order.items.map(item => ({ name: item.name, quantity: item.quantity })), kit: order.kit },
    customer: business && { name: business.name, contact: business.owner?.name || 'Owner', phone: maskPhone(business.owner?.phone), city: business.city, address: job.address || business.gst?.address || business.city, language: business.preferredLanguage },
    history: job.history,
  };
}

async function myJob(req) {
  const job = await Job.findById(req.params.id);
  if (!job) throw new HttpError(404, 'Job not found.');
  if (String(job.assignee) !== String(req.user._id) && !['ops_admin', 'super_admin'].includes(req.user.role)) throw new HttpError(403, 'This job is not assigned to you.');
  return job;
}
const log = (job, status, note, user) => job.history.push({ status, note, by: user._id, at: new Date() });

export async function myJobs(req, res) {
  const jobs = await Job.find({ assignee: req.user._id, $or: [{ status: { $in: ['scheduled', 'in_progress'] } }, { completedAt: { $gte: new Date(Date.now() - 3 * 86_400_000) } }, { status: 'failed', updatedAt: { $gte: new Date(Date.now() - 3 * 86_400_000) } }] }).sort({ 'slot.date': 1, 'slot.window': 1 }).lean();
  res.json({ jobs: await Promise.all(jobs.map(presentJob)) });
}

export async function getJob(req, res) {
  res.json({ job: await presentJob(await myJob(req)) });
}

export async function startJob(req, res) {
  const job = await myJob(req);
  if (job.status !== 'scheduled') throw new HttpError(409, 'This job cannot be started now.');
  const order = await Order.findById(job.order);
  if (job.type === 'delivery') {
    if (order.status !== 'ready_for_dispatch') throw new HttpError(409, 'The kit is not packed yet.');
    job.status = 'in_progress';
    job.checklist.startedAt = new Date();
    log(job, 'in_progress', 'Picked up kit, out for delivery', req.user);
    await job.save();
    await setStatus(order, 'out_for_delivery', { actor: req.user, note: `${req.user.name} is delivering the kit` });
  } else if (job.type === 'installation') {
    if (order.status !== 'delivered') throw new HttpError(409, 'The kit has not been delivered yet.');
    job.status = 'in_progress';
    job.checklist.startedAt = new Date();
    job.checklist.arrivedAt = new Date();
    log(job, 'in_progress', 'Technician arrived on site', req.user);
    await job.save();
    await setStatus(order, 'installing', { actor: req.user, note: `${req.user.name} arrived and started installation` });
  } else {
    job.status = 'in_progress';
    job.checklist.arrivedAt = new Date();
    log(job, 'in_progress', 'Service visit started', req.user);
    await job.save();
  }
  res.json({ job: await presentJob(job) });
}

export async function confirmDelivery(req, res) {
  const job = await myJob(req);
  if (job.type !== 'delivery' || job.status !== 'in_progress') throw new HttpError(409, 'This delivery is not in progress.');
  const { code } = z.object({ code: z.string().trim().min(4) }).parse(req.body);
  await verifyOtp('delivery', String(job.order), code);
  job.status = 'done';
  job.completedAt = new Date();
  log(job, 'done', 'Delivered; customer confirmed with code', req.user);
  await job.save();
  const order = await Order.findById(job.order);
  await setStatus(order, 'delivered', { actor: req.user, note: 'Kit delivered and confirmed by the owner' });
  res.json({ job: await presentJob(job) });
}

// A failed visit is recorded with a reason; the job is re-planned for the next working day and the owner told.
export async function failJob(req, res) {
  const job = await myJob(req);
  if (!['scheduled', 'in_progress'].includes(job.status)) throw new HttpError(409, 'This job is already closed.');
  const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
  const order = await Order.findById(job.order);
  const next = isoDate(addBusinessDays(new Date(), 1));
  job.attempts += 1;
  job.failReason = reason;
  job.status = 'scheduled';
  job.slot = { date: next, window: job.slot?.window || '09:00–11:00' };
  log(job, 'failed_attempt', reason, req.user);
  await job.save();
  if (job.type === 'delivery' && order.status === 'out_for_delivery') await setStatus(order, 'ready_for_dispatch', { actor: req.user, note: `Delivery attempt failed: ${reason}` });
  else { pushEvent(order, { type: 'visit_failed', note: `${job.type} visit failed: ${reason}`, actor: req.user }); await order.save(); }
  if (job.type === 'installation') { order.slot = job.slot; await Job.updateOne({ order: order._id, type: 'installation' }, { $set: { slot: job.slot } }); await order.save(); }
  await notifyCustomer(order.owner, 'delay', { ref: order.ref, date: new Date(`${next}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }, `/app/orders/${order._id}`);
  if (job.attempts >= 2) {
    const business = await Business.findById(order.business).lean();
    await openCase({ kind: 'sla_risk', business: business._id, order: order._id, title: `${business.name}: ${job.type} failed twice`, reason, city: business.city, state: business.state, language: business.preferredLanguage });
  }
  res.json({ job: await presentJob(job) });
}

export async function updateChecklist(req, res) {
  const job = await myJob(req);
  if (job.status !== 'in_progress') throw new HttpError(409, 'Start the job first.');
  const body = z.object({ installed: z.boolean().optional(), speedMbps: z.number().min(0).max(10000).optional(), notes: z.string().max(300).optional() }).parse(req.body);
  if (body.installed) { job.checklist.installedAt = new Date(); log(job, 'in_progress', 'Equipment installed', req.user); }
  if (body.speedMbps !== undefined) { job.checklist.speedMbps = body.speedMbps; log(job, 'in_progress', `Speed test: ${body.speedMbps} Mbps`, req.user); }
  if (body.notes !== undefined) job.checklist.notes = body.notes;
  await job.save();
  res.json({ job: await presentJob(job) });
}

// The installation photo: for the field staff on the job, operations, and the business owner whose order it is.
export async function jobPhoto(req, res) {
  const job = await Job.findById(req.params.id).lean();
  if (!job?.checklist?.photoKey) throw new HttpError(404, 'No photo for this job.');
  const order = await Order.findById(job.order).select('owner').lean();
  const allowed = String(job.assignee) === String(req.user._id) || ['ops_admin', 'super_admin'].includes(req.user.role) || String(order?.owner) === String(req.user._id);
  if (!allowed) throw new HttpError(403, 'You do not have access to this photo.');
  const { stream, contentType } = await getObject(job.checklist.photoKey);
  res.set('Content-Type', contentType || job.checklist.photoMime || 'image/jpeg');
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox");
  res.set('X-Content-Type-Options', 'nosniff');
  if (stream.pipe) stream.pipe(res); else res.send(Buffer.from(await stream.transformToByteArray()));
}

export async function uploadPhoto(req, res) {
  const job = await myJob(req);
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw new HttpError(400, 'Upload a photo of the installation.');
  const key = `jobs/${job._id}/installation-${Date.now()}.${req.file.mimetype.split('/')[1]}`;
  await putObject(key, req.file.buffer, req.file.mimetype);
  const replaced = job.checklist.photoKey;
  if (replaced) await deleteObject(replaced).catch(() => {});
  Object.assign(job.checklist, { photoKey: key, photoMime: req.file.mimetype, photoAt: new Date() });
  log(job, 'in_progress', replaced ? 'Installation photo retaken' : 'Installation photo added', req.user);
  await job.save();
  res.json({ job: await presentJob(job) });
}

export async function requestSignoff(req, res) {
  const job = await myJob(req);
  if (job.type !== 'installation' || job.status !== 'in_progress') throw new HttpError(409, 'Installation is not in progress.');
  if (!job.checklist.installedAt || job.checklist.speedMbps === undefined || !job.checklist.photoKey) throw new HttpError(409, 'Complete the checklist first: installed, speed test and photo.');
  const order = await Order.findById(job.order);
  const { code } = await issueOtp('install', String(order._id));
  order.handover = { ...(order.handover || {}), install: encrypt(code) };
  order.markModified('handover');
  await order.save();
  await notifyCustomer(order.owner, 'install_otp', { ref: order.ref, otp: code }, `/app/orders/${order._id}`);
  res.json({ sent: true });
}

export async function completeInstall(req, res) {
  const job = await myJob(req);
  if (job.type !== 'installation' || job.status !== 'in_progress') throw new HttpError(409, 'Installation is not in progress.');
  const { code } = z.object({ code: z.string().trim().min(4) }).parse(req.body);
  await verifyOtp('install', String(job.order), code);
  job.status = 'done';
  job.completedAt = new Date();
  job.checklist.signedOffAt = new Date();
  log(job, 'done', 'Customer signed off the installation', req.user);
  await job.save();
  const order = await Order.findById(job.order);
  await setStatus(order, 'installed', { actor: req.user, note: `Installed and signed off; speed test ${job.checklist.speedMbps} Mbps` });
  await audit(req.user, 'job.installation_completed', 'Order', order._id);
  res.json({ job: await presentJob(job) });
}

export async function completeService(req, res) {
  const job = await myJob(req);
  if (job.type !== 'service' || job.status !== 'in_progress') throw new HttpError(409, 'This service visit is not in progress.');
  const { notes } = z.object({ notes: z.string().trim().min(3).max(300) }).parse(req.body);
  job.status = 'done';
  job.completedAt = new Date();
  job.checklist.notes = notes;
  log(job, 'done', notes, req.user);
  await job.save();
  if (job.ticket) {
    const ticket = await Ticket.findById(job.ticket);
    ticket.messages.push({ by: req.user._id, role: req.user.role, text: `Technician visit done: ${notes}` });
    ticket.status = 'resolved';
    ticket.resolvedAt = new Date();
    await ticket.save();
    await notifyCustomer(ticket.owner, 'ticket_update', { name: ticket.subject }, '/app/help');
  }
  res.json({ job: await presentJob(job) });
}

