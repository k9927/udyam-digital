// Evidence from the historical quarter (the "signals" in smb_leads.csv) and live metrics from the platform.
import { Lead, Order, Quote, Business, Case, Job } from '../models/index.js';
import { getLeadModel } from './leadModel.js';

const num = value => Number(value) || 0;
const pct = (part, whole) => (whole ? Math.round((1000 * part) / whole) / 10 : 0);
const avg = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const ADDRESSABLE = ['Quote took too long to arrive', 'Quote too complex to understand', 'Found paperwork too long', 'Missing GST or Udyam document', 'Document details did not match', 'Visit not scheduled by sales', 'Owner had no time for a visit', 'Authorised signatory not available', 'Installation delayed beyond 21 days'];

let cached = null;
export async function historicalInsights() {
  if (cached) return cached;
  const rows = await Lead.find().lean();
  const activated = rows.filter(row => row.outcome === 'Activated');
  const totalCost = rows.reduce((sum, row) => sum + num(row.acquisition_cost_inr), 0);
  const group = (list, key) => list.reduce((map, row) => map.set(key(row), [...(map.get(key(row)) || []), row]), new Map());
  const churn = list => pct(list.filter(row => row.churned_within_6_months === 'Y').length, list.length);

  const gst = ['Y', 'N'].map(flag => { const list = rows.filter(row => row.has_gstin === flag); return { label: flag === 'Y' ? 'Has GSTIN' : 'No GSTIN', leads: list.length, activation: pct(list.filter(row => row.outcome === 'Activated').length, list.length) }; });
  const sources = [...group(rows, row => row.lead_source)].map(([source, list]) => {
    const wins = list.filter(row => row.outcome === 'Activated').length;
    return { source, leads: list.length, activation: pct(wins, list.length), cacPerActivation: Math.round(list.reduce((sum, row) => sum + num(row.acquisition_cost_inr), 0) / Math.max(1, wins)) };
  }).sort((a, b) => b.cacPerActivation - a.cacPerActivation);
  const segments = [...group(rows, row => row.segment)].map(([segment, list]) => {
    const wins = list.filter(row => row.outcome === 'Activated');
    const bundle = avg(wins.map(row => num(row.monthly_bundle_value_inr)));
    const cac = list.reduce((sum, row) => sum + num(row.acquisition_cost_inr), 0) / Math.max(1, wins.length);
    return { segment, share: pct(list.length, rows.length), activation: pct(wins.length, list.length), avgBundle: Math.round(bundle), cacPerActivation: Math.round(cac), paybackMonths: Math.round((cac / Math.max(1, bundle)) * 10) / 10, churn: churn(wins) };
  }).sort((a, b) => a.paybackMonths - b.paybackMonths);
  const calls = [1, 2, 3, 4, 5].map(n => { const list = activated.filter(row => Math.min(5, num(row.customer_follow_up_calls)) === n); return { calls: n === 5 ? '5+' : String(n), customers: list.length, churn: churn(list), nps: Math.round(avg(list.map(row => num(row.nps_score))) * 10) / 10 }; }).filter(row => row.customers);
  const days = (a, b) => avg(activated.map(row => (Date.parse(row[b]) - Date.parse(row[a])) / 86_400_000));
  const stages = [['First contact', 'created_date', 'contacted_date'], ['Needs visit', 'contacted_date', 'needs_assessed_date'], ['Quote', 'needs_assessed_date', 'quote_accepted_date'], ['KYC', 'quote_accepted_date', 'kyc_complete_date'], ['Installation', 'kyc_complete_date', 'activated_date']].map(([label, a, b]) => ({ label, days: Math.round(days(a, b) * 10) / 10, removedByDigital: label !== 'Installation' }));
  const drops = rows.filter(row => row.outcome !== 'Activated');
  const reasons = [...group(drops, row => row.drop_reason)].map(([reason, list]) => ({ reason, count: list.length, addressable: ADDRESSABLE.includes(reason) })).sort((a, b) => b.count - a.count);
  const funnelOrder = ['Lead', 'Contacted', 'Needs assessed', 'Quote accepted', 'KYC complete', 'Activated'];
  const reached = stage => rows.filter(row => funnelOrder.indexOf(row.stage_reached) >= funnelOrder.indexOf(stage)).length;
  const model = await getLeadModel();
  cached = {
    baseline: {
      leads: rows.length, activations: activated.length, activationRate: pct(activated.length, rows.length), cacPerActivation: Math.round(totalCost / activated.length),
      daysToActivate: Math.round(avg(activated.map(row => num(row.days_lead_to_activation))) * 10) / 10, statusCalls: Math.round(avg(activated.map(row => num(row.customer_follow_up_calls))) * 10) / 10,
      churn: churn(activated), nps: Math.round(avg(activated.map(row => num(row.nps_score))) * 10) / 10, medianBundle: activated.map(row => num(row.monthly_bundle_value_inr)).sort((a, b) => a - b)[Math.floor(activated.length / 2)],
    },
    funnel: funnelOrder.map(stage => ({ stage, leads: reached(stage) })),
    gst, sources, segments, calls, stages, reasons,
    addressable: { count: reasons.filter(row => row.addressable).reduce((sum, row) => sum + row.count, 0), of: drops.length },
    model: { ...model.metrics, strongest: model.strongest },
  };
  return cached;
}

export async function liveMetrics() {
  const baseline = (await historicalInsights()).baseline;
  const [quotes, savedQuotes, orders, active, verified, inReview, openCases, cases, jobsToday, packing] = await Promise.all([
    Quote.countDocuments(), Quote.countDocuments({ status: { $in: ['saved', 'ordered'] } }), Order.find().lean(), Order.find({ status: 'active' }).lean(),
    Business.countDocuments({ 'kyc.status': 'verified' }), Business.countDocuments({ 'kyc.status': 'in_review' }), Case.countDocuments({ status: { $ne: 'resolved' }, kind: { $ne: 'lead' } }),
    Case.aggregate([{ $match: { status: { $ne: 'resolved' } } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]),
    Job.aggregate([{ $match: { 'slot.date': new Date().toLocaleDateString('en-CA') } }, { $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }]),
    Order.countDocuments({ status: 'packing' }),
  ]);
  const paid = orders.filter(order => order.paidAt).length;
  const daysToActivate = avg(active.map(order => (new Date(order.activatedAt) - new Date(order.createdAt)) / 86_400_000));
  const ratings = active.filter(order => order.rating?.score !== undefined).map(order => order.rating.score);
  const promoters = ratings.filter(score => score >= 9).length, detractors = ratings.filter(score => score <= 6).length;
  const byStatus = orders.reduce((map, order) => ({ ...map, [order.status]: (map[order.status] || 0) + 1 }), {});
  const late = orders.filter(order => !['active', 'cancelled'].includes(order.status) && order.dueBy && new Date(order.dueBy) < new Date());
  return {
    kpis: [
      { key: 'conversion', label: 'Quote-to-activation', value: pct(active.length, quotes), unit: '%', baseline: baseline.activationRate, target: 12, better: 'higher', note: 'Live: activated orders ÷ quotes. Baseline: lead-to-activation in the historical quarter.' },
      { key: 'days', label: 'Days to activate', value: Math.round(daysToActivate * 10) / 10, unit: 'days', baseline: baseline.daysToActivate, target: 7, better: 'lower', note: 'Order created → line active.' },
      { key: 'calls', label: 'Status calls per order', value: Math.round(avg(orders.map(order => order.statusCalls || 0)) * 100) / 100, unit: '', baseline: baseline.statusCalls, target: 0.5, better: 'lower', note: 'Callback requests per order; the tracker replaces chasing.' },
      { key: 'cac', label: 'Acquisition cost per activation', value: null, unit: '₹', baseline: baseline.cacPerActivation, target: 9200, better: 'lower', note: 'Modelled in the business case; needs live spend data.' },
      { key: 'churn', label: '6-month churn', value: null, unit: '%', baseline: baseline.churn, target: 10, better: 'lower', note: 'Measured six months after activation.' },
      { key: 'rating', label: 'Average rating (0–10)', value: ratings.length ? Math.round(avg(ratings) * 10) / 10 : null, unit: '', baseline: baseline.nps, target: 7.5, better: 'higher', note: ratings.length ? `NPS ${pct(promoters - detractors, ratings.length)} from ${ratings.length} ratings.` : 'Collected after activation.' },
    ],
    funnel: [
      { stage: 'Quotes built', count: quotes }, { stage: 'Quotes saved', count: savedQuotes }, { stage: 'Orders placed', count: orders.length },
      { stage: 'Businesses verified', count: verified }, { stage: 'Paid', count: paid }, { stage: 'Active', count: active.length },
    ],
    byStatus, work: { kycInReview: inReview, openCases, packing, late: late.length, cases: Object.fromEntries(cases.map(row => [row._id, row.n])), jobsToday: jobsToday.map(row => ({ ...row._id, n: row.n })) },
    late: late.slice(0, 10).map(order => ({ id: String(order._id), ref: order.ref, status: order.status, dueBy: order.dueBy })),
  };
}

export const resetInsights = () => { cached = null; };
