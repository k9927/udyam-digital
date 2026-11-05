// The order state machine. Every status change is an event with an actor; side effects (jobs, codes,
// notifications, cases, bills) live here so the tracker, queues and dashboards always agree.
import { Order, Job, Invoice, Business } from '../models/index.js';
import { notifyCustomer, notifyStaff } from './notify.js';
import { pickFieldStaff, openCase, resolveCases } from './routing.js';
import { issueOtp } from './otp.js';
import { encrypt, randomToken } from '../libs/security.js';

export const SLOT_WINDOWS = ['09:00–11:00', '11:00–13:00', '14:00–16:00', '16:00–18:00'];
export const STATUS_FLOW = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot', 'packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed', 'active'];

// Local calendar date (YYYY-MM-DD); slots and "today" follow the business's clock, not UTC.
export const isoDate = date => new Date(date).toLocaleDateString('en-CA');
export function addBusinessDays(start, days) {
  const date = new Date(start);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) added++;
  }
  return date;
}

export async function newOrderRef() {
  const stamp = new Date().toISOString().slice(2, 7).replace('-', '');
  for (;;) {
    const ref = `UD-${stamp}-${randomToken(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase().padEnd(5, '7')}`;
    if (!(await Order.exists({ ref }))) return ref;
  }
}

export function pushEvent(order, { type = 'status', status = order.status, note = '', actor, role }) {
  order.events.push({ type, status, note, actor: actor?._id, role: role || actor?.role || 'system', at: new Date() });
}

const KIT = {
  P01: 'Fibre router (ONT)', P02: 'Fibre router (ONT)', P03: 'Fibre router (ONT)', P04: '5G AirFiber unit', P05: 'Leased-line CPE router', P06: 'Leased-line CPE router',
  P07: 'Business SIM', P08: 'Business SIM', P09: 'Failover router with data SIM', P10: 'SD-WAN edge device', P19: 'POS tablet with card reader',
  P21: 'Firewall appliance', P22: 'Wi-Fi access point', P23: 'HD camera', P24: 'IoT sensor kit', P25: 'GPS tracker',
};
export function buildKit(items) {
  const kit = new Map();
  for (const item of items) if (KIT[item.productId]) kit.set(KIT[item.productId], (kit.get(KIT[item.productId]) || 0) + item.quantity);
  return [...kit].map(([item, quantity]) => ({ item, quantity, serials: [] }));
}

export function availableSlots(order, from = new Date()) {
  const installDays = Number(order.totals?.installDays || 3);
  const first = addBusinessDays(from, Math.max(1, Math.round(installDays * 0.4)));
  const dates = [];
  for (let i = 0; dates.length < 6; i++) dates.push(isoDate(addBusinessDays(first, i)));
  return dates.map(date => ({ date, windows: SLOT_WINDOWS }));
}

const fmtDate = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export async function setStatus(order, status, ctx = {}) {
  const previous = order.status;
  order.status = status;
  pushEvent(order, { status, note: ctx.note, actor: ctx.actor, role: ctx.role });
  if (status === 'active') order.activatedAt = new Date();
  if (status === 'cancelled') order.cancelledAt = new Date();
  await order.save();
  await afterStatus(order, previous, ctx);
  return order;
}

async function afterStatus(order, previous, ctx) {
  const business = await Business.findById(order.business).lean();
  const p = { ref: order.ref };
  switch (order.status) {
    case 'awaiting_signature':
      if (previous === 'awaiting_kyc') await notifyCustomer(order.owner, 'order_created', p, `/app/orders/${order._id}`);
      break;
    case 'awaiting_slot':
      await notifyCustomer(order.owner, 'payment_success', { ...p, amount: order.totals.dueNow }, `/app/orders/${order._id}`);
      await resolveCases({ order: order._id, kind: 'payment_failed' }, 'Payment completed');
      break;
    case 'packing': {
      const city = business?.city;
      const technician = await pickFieldStaff('technician', city);
      order.kit = buildKit(order.items);
      await Job.create({ order: order._id, business: order.business, type: 'delivery', status: 'waiting', slot: order.slot, city, address: business?.gst?.address || business?.udyam?.city || city });
      await Job.create({ order: order._id, business: order.business, type: 'installation', status: 'scheduled', assignee: technician?._id, slot: order.slot, city, address: business?.gst?.address || city });
      await order.save();
      if (technician) await notifyStaff(technician._id, `Installation booked: ${order.ref}`, `${fmtDate(order.slot.date)}, ${order.slot.window}`, '/field');
      await notifyCustomer(order.owner, 'slot_booked', { ...p, date: fmtDate(order.slot.date), window: order.slot.window }, `/app/orders/${order._id}`);
      break;
    }
    case 'ready_for_dispatch': {
      const agent = await pickFieldStaff('delivery', business?.city);
      await Job.updateOne({ order: order._id, type: 'delivery' }, { $set: { status: 'scheduled', assignee: agent?._id } });
      if (agent) await notifyStaff(agent._id, `Delivery ready: ${order.ref}`, `Kit packed for ${business?.name || 'customer'}.`, '/field');
      break;
    }
    case 'out_for_delivery': {
      const { code } = await issueOtp('delivery', String(order._id));
      order.handover = { ...(order.handover || {}), delivery: encrypt(code) };
      order.markModified('handover');
      await order.save();
      await notifyCustomer(order.owner, 'out_for_delivery', { ...p, otp: code }, `/app/orders/${order._id}`);
      break;
    }
    case 'delivered':
      await notifyCustomer(order.owner, 'delivered', { ...p, date: fmtDate(order.slot.date), window: order.slot.window }, `/app/orders/${order._id}`);
      break;
    case 'installed':
      await setStatus(order, 'active', { note: 'Lines, SIMs and services provisioned', role: 'system' });
      break;
    case 'active': {
      // The first month was paid with the order, so the first monthly bill comes next month (see raiseMonthlyBills).
      await notifyCustomer(order.owner, 'active', p, `/app/services`);
      await resolveCases({ order: order._id, kind: { $in: ['sla_risk', 'callback'] } }, 'Order activated');
      break;
    }
    case 'cancelled':
      await Job.updateMany({ order: order._id, status: { $in: ['waiting', 'scheduled'] } }, { $set: { status: 'failed', failReason: 'Order cancelled' } });
      await openCase({ kind: 'cancelled', business: order.business, order: order._id, title: `${business?.name || 'Customer'} cancelled ${order.ref}`, reason: order.cancelReason || 'No reason given', city: business?.city, state: business?.state, language: business?.preferredLanguage });
      break;
    default:
  }
}

// Billing is in advance. The payment at order covers the setup and the calendar month the service goes live in,
// so an order is billed monthly from the following month. One consolidated bill per business per month.
export const periodOf = date => new Date(date).toLocaleDateString('en-CA').slice(0, 7);
export const nextPeriod = period => { const [year, month] = period.split('-').map(Number); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`; };
export const billedFrom = order => nextPeriod(periodOf(order.activatedAt || order.paidAt || order.createdAt));
export const firstOfPeriod = period => new Date(`${period}-01T00:00:00`);

export async function refreshMonthlyBill(businessId, now = new Date()) {
  const period = periodOf(now);
  if (await Invoice.exists({ business: businessId, period, status: 'paid' })) return null;
  const active = (await Order.find({ business: businessId, status: 'active' }).lean()).filter(order => billedFrom(order) <= period);
  if (!active.length) {
    // A due bill for a month that was already paid at order (e.g. raised by older billing rules) is withdrawn.
    await Invoice.deleteMany({ business: businessId, period, status: 'due' });
    return null;
  }
  const lines = active.flatMap(order => order.items.map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity, amount: item.monthly, orderRef: order.ref })));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = Math.round(subtotal * 0.18);
  const existing = await Invoice.findOne({ business: businessId, period, status: 'due' });
  const values = { lines, subtotal, tax, oneTime: 0, total: subtotal + tax, dueDate: new Date(firstOfPeriod(period).getTime() + 15 * 86_400_000), autopay: active.some(order => order.autopay) };
  if (existing) return { invoice: await Object.assign(existing, values).save(), created: false };
  const invoice = await Invoice.create({ business: businessId, period, number: `INV-${period.replace('-', '')}-${randomToken(4).replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase()}`, ...values });
  return { invoice, created: true };
}

// Run by the scheduler: raises this month's bill for every business with a live service, and tells the owner once.
export async function raiseMonthlyBills(now = new Date()) {
  const businesses = [...new Set([...(await Order.distinct('business', { status: 'active' })), ...(await Invoice.distinct('business', { status: 'due' }))].map(String))];
  let raised = 0;
  for (const businessId of businesses) {
    const result = await refreshMonthlyBill(businessId, now);
    if (result?.created) {
      raised++;
      const order = await Order.findOne({ business: businessId, status: 'active' }).lean();
      await notifyCustomer(order.owner, 'invoice', { amount: result.invoice.total }, '/app/bills');
    }
  }
  return raised;
}
