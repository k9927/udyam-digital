// Background checks: saved quotes that stall become partner cases; late orders raise SLA cases and an honest update.
import { Quote, Order, Business } from '../models/index.js';
import { config } from '../libs/config.js';
import { openCase } from './routing.js';
import { notifyCustomer } from './notify.js';
import { addBusinessDays, raiseMonthlyBills } from './orderFlow.js';

// Owners who started the Udyam assistant but have not come back: a reminder after a day, a local partner after three.
export async function udyamAssistChecks(now = new Date()) {
  const pending = await Business.find({ 'registration.udyamAssist.startedAt': { $lt: new Date(now - 24 * 3600_000) }, 'udyam.masked': { $exists: false }, 'kyc.status': { $ne: 'verified' } });
  let reminded = 0, escalated = 0;
  for (const business of pending) {
    const started = business.registration.udyamAssist.startedAt;
    if (!business.registration.udyamAssist.remindedAt) {
      await notifyCustomer(business.owner, 'udyam_reminder', {}, '/app/udyam');
      business.set('registration.udyamAssist.remindedAt', now);
      reminded++;
    }
    if (!business.registration.udyamAssist.escalatedAt && started < new Date(now - 72 * 3600_000)) {
      await openCase({ kind: 'no_registration', business: business._id, title: `${business.name}: started Udyam registration 3 days ago`, reason: 'Started the Udyam assistant but has not entered a Udyam number. Call to help them finish it.', city: business.city, state: business.state, language: business.preferredLanguage, ownerId: business.owner });
      business.set('registration.udyamAssist.escalatedAt', now);
      escalated++;
    }
    await business.save();
  }
  return { reminded, escalated };
}

export async function runChecks(now = new Date()) {
  const stale = await Quote.find({ status: 'saved', savedAt: { $lt: new Date(now - config.abandonAfterMinutes * 60_000) }, followUpCaseAt: null }).limit(50);
  for (const quote of stale) {
    const business = quote.business ? await Business.findById(quote.business).lean() : null;
    if (!business) continue;
    await openCase({ kind: 'abandoned_quote', business: business._id, quote: quote._id, title: `${business.name} saved a quote but did not order`, reason: `${quote.result?.bundleName} at ₹${(quote.result?.totals?.monthly || 0).toLocaleString('en-IN')}/month`, city: business.city, state: business.state, language: business.preferredLanguage });
    await notifyCustomer(quote.owner, 'quote_reminder', { name: quote.result?.bundleName, amount: quote.result?.totals?.monthly }, `/quote/${quote._id}`);
    quote.followUpCaseAt = now;
    await quote.save();
  }
  const late = await Order.find({ status: { $nin: ['active', 'cancelled', 'awaiting_kyc', 'awaiting_signature', 'awaiting_payment'] }, dueBy: { $lt: now }, slaBreached: false }).limit(50);
  for (const order of late) {
    order.slaBreached = true;
    await order.save();
    const business = await Business.findById(order.business).lean();
    await openCase({ kind: 'sla_risk', business: business._id, order: order._id, title: `${order.ref} is past its promised date`, reason: `Stuck at "${order.status.replace(/_/g, ' ')}"`, city: business.city, state: business.state, language: business.preferredLanguage });
    await notifyCustomer(order.owner, 'delay', { ref: order.ref, date: addBusinessDays(now, 2).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }, `/app/orders/${order._id}`);
  }
  const bills = await raiseMonthlyBills(now);
  const udyam = await udyamAssistChecks(now);
  return { abandoned: stale.length, late: late.length, bills, udyam };
}

let timer = null;
export function startScheduler() {
  if (timer || config.schedulerSeconds <= 0) return;
  timer = setInterval(() => runChecks().catch(error => console.error('Scheduler:', error.message)), config.schedulerSeconds * 1000);
  timer.unref();
}
export function stopScheduler() { clearInterval(timer); timer = null; }
