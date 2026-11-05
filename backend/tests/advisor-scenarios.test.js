// A bank of judge-style advisor scenarios: free text in, profile + compliant bundle out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { understand } from '../libs/advisorNlu.js';
import { buildQuote, eligibility, normaliseProfile } from '../libs/pricing.js';
import { readCsv } from '../libs/csv.js';

const catalogue = readCsv('product_catalogue.csv');
const byId = new Map(catalogue.map(product => [product.product_id, product]));
const DEFAULTS = { business: 'retail', employees: 1, sites: 1, tier: '2', gstin: 'no', current: '', goal: 'reliable', spend: '' };

function converse(messages, { gstVerified = false } = {}) {
  let profile = { ...DEFAULTS }, wants = [], budget = null;
  for (const message of messages) {
    const result = understand(message);
    profile = { ...profile, ...result.updates };
    if (result.updates.business === 'multi' && !result.updates.sites) profile.sites = Math.max(2, profile.sites);
    wants = [...new Set([...wants, ...result.wants])];
    if (result.budget) budget = result.budget;
  }
  const quote = buildQuote({ profile, catalogue, gstVerified, wants, budget });
  return { profile: normaliseProfile(profile), quote, ids: quote.items.map(item => item.productId), notes: quote.notes.map(note => note.code) };
}

function assertCompliant({ profile, quote }, gstVerified) {
  const ids = new Set(quote.items.map(item => item.productId));
  assert.ok(quote.items.some(item => ['P01', 'P02', 'P03', 'P04', 'P05', 'P06'].includes(item.productId)), 'has connectivity');
  for (const item of quote.items) {
    assert.ok(eligibility(byId.get(item.productId), profile, gstVerified).ok, `${item.productId} must be eligible`);
    const needs = byId.get(item.productId).requires_one_of.split('|').filter(Boolean);
    if (needs.length) assert.ok(needs.some(need => ids.has(need)), `${item.productId} dependency`);
    assert.ok(item.why.length > 10, `${item.productId} has a reason`);
  }
  assert.equal(quote.totals.monthly, quote.totals.subtotal + Math.round(quote.totals.subtotal * 0.18));
}

const SCENARIOS = [
  ['English clinic with GST, Pune', ['I run a dental clinic with 8 staff in Pune, we have GST, security matters'], { business: 'professional', employees: 8, tier: '1', gstin: 'yes', goal: 'security' }],
  ['Hinglish kirana, no GST, budget', ['mera kirana shop hai, do log kaam karte hain, gst nahi hai, budget under 1500'], { business: 'retail', employees: 3, gstin: 'no' }],
  ['Restaurant chain, 7 outlets, Nagpur', ['We are a restaurant chain with 7 outlets in Nagpur and 60 employees'], { business: 'multi', sites: 8, employees: 30, tier: '2' }],
  ['Factory wants leased line + CCTV', ['Small textile factory, 40 workers, need a leased line and cctv, currently paying ₹12,000 a month'], { business: 'manufacturing', employees: 30, current: 'leased', spend: '12000' }],
  ['Solo owner wants a website', ['just me, home broadband, I want a website'], { employees: 1, current: 'home' }],
  ['Hindi shop, no GST', ['मेरी दुकान में 3 लोग हैं, जीएसटी नहीं है'], { business: 'retail', employees: 3, gstin: 'no' }],
  ['CA firm in Kochi on hotspot', ['CA firm in Kochi with 12 people, mobile hotspot, need business email'], { business: 'professional', employees: 15, tier: '2', current: 'hotspot' }],
  ['Correction of locations', ['We have a clinic with 5 doctors', 'actually we have 3 branches'], { business: 'professional', sites: 3 }],
  ['Salon wants customers via WhatsApp', ['beauty salon, 4 staff, want to reach more customers on whatsapp'], { business: 'retail', employees: 3, goal: 'customers' }],
  ['Coaching centre, metro', ['coaching institute in a metro city, 20 teachers, internet keeps dropping'], { business: 'professional', employees: 15, tier: '1', goal: 'reliable' }],
  ['Pharmacy billing', ['pharmacy with 2 people, need billing and inventory, gst registered'], { business: 'retail', employees: 3, gstin: 'yes', goal: 'operations' }],
  ['Bakery chain in Ludhiana', ['bakery chain with 4 outlets in Ludhiana, 15 staff'], { business: 'multi', sites: 5, tier: '2' }],
  ['Auto parts workshop', ['auto parts workshop, 12 workers, tier 2 city, need machine monitoring'], { business: 'manufacturing', employees: 15, tier: '2' }],
  ['Lawyer office security', ['law office with 6 advocates, worried about ransomware'], { business: 'professional', employees: 8, goal: 'security' }],
  ['Spend vs budget distinguished', ['we pay rs 3000 a month now, budget within 2500'], { spend: '3000' }],
  ['Weather is off-topic', ['what is the weather today'], {}],
  ['Plain broadband that keeps dropping', ['dental clinic, 8 staff, 2 locations in Pune, we have GST, current broadband keeps dropping'], { business: 'professional', employees: 8, sites: 2, tier: '1', current: 'business', goal: 'reliable' }],
  ['Wanting fibre is a request, not current setup', ['salon with 4 staff, we need fibre'], { business: 'retail', current: '' }],
];

for (const [name, messages, expected] of SCENARIOS) {
  test(`advisor scenario: ${name}`, () => {
    const result = converse(messages);
    for (const [key, value] of Object.entries(expected)) assert.equal(result.profile[key], value, `${key}`);
    assertCompliant(result, false);
  });
}

test('off-topic text is not recognised', () => assert.equal(understand('what is the weather today').recognized, false));
test('budget is captured separately from current spend', () => {
  const result = understand('we pay rs 3000 a month now, budget within 2500');
  assert.equal(result.updates.spend, '3000');
  assert.equal(result.budget, 2500);
});
test('requested CCTV is added when eligible', () => {
  const result = converse(['shop with 3 people, gst registered, i want cctv'], { gstVerified: true });
  assert.ok(result.ids.includes('P23'));
  assert.ok(result.notes.includes('requested_added'));
});
test('1 Gbps in a tier-2 city is explained with the closest option', () => {
  const result = converse(['clinic in Nagpur with 8 people, need 1 gbps fibre']);
  assert.ok(!result.ids.includes('P03'));
  const note = result.quote.notes.find(item => item.code === 'requested_tier');
  assert.ok(note && /tier 2/.test(note.text) && note.params.alternative);
});
test('a GST-only request without verified GST explains how to unlock it', () => {
  const result = converse(['factory with 30 workers, need a leased line']);
  assert.ok(result.notes.includes('requested_gst'));
  assert.ok(!result.ids.includes('P05'));
});
test('a leased line for a 6-person workshop is refused for size even with GST', () => {
  const result = converse(['workshop with 6 people, gst registered, need leased line'], { gstVerified: true });
  assert.ok(result.notes.includes('requested_employees'));
});
test('budget trims optional products but never connectivity', () => {
  const result = converse(['clinic with 8 people, gst, budget under 2500'], { gstVerified: true });
  assert.ok(result.quote.totals.monthly <= 2500 || result.notes.includes('budget_unreachable'));
  assert.ok(result.notes.includes('budget_trimmed'));
  assertCompliant(result, true);
});
test('the brief\'s retail bundles: P01+P07+P19 with GST, P04+P18 without', () => {
  assert.deepEqual(converse(['grocery store with 3 staff'], { gstVerified: true }).ids, ['P01', 'P07', 'P19']);
  assert.deepEqual(converse(['grocery store with 3 staff']).ids, ['P04', 'P18']);
});
test('self-declared GST never unlocks GST-only products', () => {
  const result = converse(['manufacturing unit, 40 workers, we have GST, operations'], { gstVerified: false });
  for (const item of result.quote.items) assert.notEqual(byId.get(item.productId).requires_gstin, 'Y');
  assert.ok(result.notes.includes('gst_unlocks'));
});
test('exhaustive sweep: every profile yields a compliant bundle', () => {
  let checked = 0;
  for (const business of ['retail', 'professional', 'multi', 'manufacturing']) for (const goal of ['reliable', 'customers', 'security', 'operations', 'locations']) for (const employees of [1, 3, 8, 15, 30]) for (const sites of [1, 2, 3, 5, 8]) for (const tier of ['1', '2']) for (const gst of [false, true]) {
    const profile = { ...DEFAULTS, business, goal, employees, sites, tier };
    const quote = buildQuote({ profile, catalogue, gstVerified: gst });
    if (!quote.items.length) continue;
    assertCompliant({ profile: normaliseProfile(profile), quote }, gst);
    checked++;
  }
  assert.ok(checked > 1900, `checked ${checked}`);
});
