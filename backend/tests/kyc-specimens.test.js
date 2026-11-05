// Real OCR over all 47 specimen images, then the KYC rules engine, per applicant (about 45 s).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { parseKycText, gstinChecksumValid, normalizeGstin } from '../libs/kycParse.js';
import { checkDocuments, decide, sameEnterprise } from '../libs/kycRules.js';
import { readCsv } from '../libs/csv.js';
import { similarity } from '../libs/kycRules.js';
import { backendRoot } from './helpers.js';

const gst = new Map(readCsv('mock_gstin_registry.csv').map(row => [row.gstin, row]));
const udyam = new Map(readCsv('mock_udyam_registry.csv').map(row => [row.udyam_number, row]));
const lookups = {
  gstRow: async value => gst.get(value) || null,
  udyamRow: async value => udyam.get(value) || null,
  gstByTradeName: async (trade, address) => [...gst.values()].find(row => row.trade_name === trade && similarity(row.principal_place_of_business, address) >= 0.9) || null,
};
const TYPES = { gst_certificate: 'GST certificate', udyam_certificate: 'Udyam certificate', address_proof: 'Address proof', signatory_id: 'Signatory ID' };
// Expected failing checks per applicant, from inspecting the specimen pack (the official answer key is judges-only).
const EXPECTED = {
  K01: [/cancelled/, /Udyam registration number is missing/], K02: [], K03: [], K04: [/could not be read/], K05: [],
  K06: [/GSTIN on the certificate is not valid/], K07: [/Legal name differs/], K08: [], K09: [],
  K10: [/GSTIN on the certificate is not valid/], K11: [/too old/], K12: [],
};

test('GSTIN checksum and OCR repair', () => {
  assert.ok([...gst.keys()].every(gstinChecksumValid));
  assert.equal(normalizeGstin('27XUIXGO767D1ZP'), '27XUIXG0767D1ZP');
  assert.equal(normalizeGstin('32TZAXB5481U171'), '32TZAXB5481U1Z1');
  assert.equal(gstinChecksumValid('08YKZXS8189L1Z0'), false);
});

test('Smart KYC verdicts for all 12 specimen applicants', { timeout: 300_000 }, async () => {
  const worker = await createWorker('eng', 1, { langPath: path.join(backendRoot, 'node_modules/@tesseract.js-data/eng/4.0.0'), gzip: true, cachePath: path.join(backendRoot, 'node_modules/.cache') });
  try {
    const dir = path.join(backendRoot, 'data', 'specimens');
    for (const [applicant, expected] of Object.entries(EXPECTED)) {
      const documents = [];
      for (const file of fs.readdirSync(dir).filter(name => name.startsWith(applicant))) {
        const type = TYPES[file.slice(4, -4)];
        const { data } = await worker.recognize(path.join(dir, file), { rotateAuto: true });
        documents.push({ type, confidence: data.confidence, fields: parseKycText(type, data.text) });
      }
      const { results } = await checkDocuments({ documents, gst: null, udyam: null, lookups });
      const failures = results.flatMap(doc => doc.checks.filter(check => check.status === 'fail').map(check => check.label));
      assert.equal(failures.length, expected.length, `${applicant}: ${failures.join('; ') || 'none'}`);
      for (const pattern of expected) assert.ok(failures.some(label => pattern.test(label)), `${applicant} should fail ${pattern}`);
    }
  } finally { await worker.terminate(); }
});

test('verification decision: registry first, then required documents, then checks', () => {
  const pass = { type: 'Address proof', checks: [{ status: 'pass' }] };
  const id = { type: 'Signatory ID', checks: [{ status: 'pass' }] };
  assert.equal(decide({ gst: null, udyam: null, results: [pass, id] }).status, 'registry_needed');
  assert.equal(decide({ gst: { status: 'Active' }, udyam: null, results: [pass] }).status, 'documents_needed');
  assert.equal(decide({ gst: { status: 'Active' }, udyam: null, results: [pass, { type: 'Signatory ID', checks: [{ status: 'fail', label: 'x' }] }] }).status, 'action_needed');
  assert.equal(decide({ gst: { status: 'Active' }, udyam: null, results: [pass, { type: 'Signatory ID', checks: [{ status: 'warn', label: 'x' }] }] }).status, 'in_review');
  const verifiedGst = decide({ gst: { status: 'Active' }, udyam: null, results: [pass, id] });
  assert.deepEqual([verifiedGst.status, verifiedGst.tier], ['verified', 'gst']);
  const verifiedUdyam = decide({ gst: { status: 'Cancelled' }, udyam: { udyam_number: 'x' }, results: [pass, id] });
  assert.deepEqual([verifiedUdyam.status, verifiedUdyam.tier], ['verified', 'udyam']);
});

test('GST and Udyam pair only when they are the same enterprise', () => {
  const ganeshGst = gst.get('27XUIXG0767D1ZP');
  assert.equal(sameEnterprise(ganeshGst, udyam.get('UDYAM-MH-00-9516696')).same, true);
  assert.deepEqual(sameEnterprise(ganeshGst, udyam.get('UDYAM-TN-00-3866196')).reasons, ['Business name differs', 'State differs', 'City differs']);
  assert.equal(sameEnterprise(gst.get('29FGUXG3354T1ZQ'), udyam.get('UDYAM-MH-00-9516696')).same, false, 'same name, different state');
  assert.equal(sameEnterprise(ganeshGst, { ...udyam.get('UDYAM-TN-00-3866196'), pan: 'XUIXG0767D' }).same, true, 'a provider PAN settles it');
  let pairs = 0;
  for (const row of udyam.values()) {
    for (const match of [...gst.values()].filter(item => item.trade_name === row.enterprise_name && item.state === row.state && item.principal_place_of_business.toLowerCase().includes(row.city.toLowerCase()))) { assert.ok(sameEnterprise(match, row).same, row.udyam_number); pairs++; }
  }
  assert.ok(pairs > 2000, `every genuine pair accepted (${pairs})`);
  const mixed = decide({ gst: { ...ganeshGst, status: 'Active' }, udyam: udyam.get('UDYAM-TN-00-3866196'), results: [{ type: 'Address proof', checks: [{ status: 'pass' }] }, { type: 'Signatory ID', checks: [{ status: 'pass' }] }] });
  assert.equal(mixed.status, 'action_needed', 'mixed registrations never verify');
});

test('a bill may name the trade name, the legal name or the proprietor; a stranger fails', async () => {
  const ganesh = { ...gst.get('27XUIXG0767D1ZP'), gstin: '27XUIXG0767D1ZP' };
  const bill = billed_to => ({ type: 'Address proof', confidence: 95, fields: { billed_to, address: ganesh.principal_place_of_business, bill_date: '2026-07-01' } });
  const verdict = async billed_to => (await checkDocuments({ documents: [bill(billed_to)], gst: ganesh, udyam: null, lookups })).results[0].checks.find(check => /Billed-to name/.test(check.label)).status;
  assert.equal(await verdict('Ganesh Woodcraft'), 'pass', 'trade name');
  assert.equal(await verdict('Joseph Singh (Prop. Ganesh Woodcraft)'), 'pass', 'legal name');
  assert.equal(await verdict('Joseph Singh'), 'pass', 'proprietor, as on most electricity bills');
  assert.equal(await verdict('Star Electronics'), 'fail', 'another business');
  const id = { type: 'Signatory ID', confidence: 95, fields: { name: 'Joseph Singh', for_business: 'Joseph Singh', valid_till: '2029-01-01' } };
  const idChecks = (await checkDocuments({ documents: [id], gst: ganesh, udyam: null, lookups })).results[0].checks;
  assert.equal(idChecks.find(check => /Business on ID/.test(check.label)).status, 'fail', 'the ID must name the business, not just the person');
});

test('Udyam-only business: the bill address is held to the Udyam city and state', async () => {
  const balaji = udyam.get('UDYAM-KL-00-3078801');
  const check = async address => (await checkDocuments({ documents: [{ type: 'Address proof', confidence: 95, fields: { billed_to: 'Balaji Dental Care LLP', address, bill_date: '2026-07-01' } }], gst: null, udyam: balaji, lookups })).results[0].checks.find(item => /Udyam-registered city/.test(item.label));
  assert.equal((await check('Shop 4, MG Road, Kochi, Kerala - 682016')).status, 'pass');
  const elsewhere = await check('Shop 4, Anna Salai, Chennai, Tamil Nadu - 600002');
  assert.equal(elsewhere.status, 'warn');
  assert.match(elsewhere.detail, /Kochi, Kerala/);
});

test('a clear image of the wrong document is told apart from a blurry one', async () => {
  const [clear, blurry] = (await checkDocuments({ documents: [{ type: 'Signatory ID', confidence: 94, fields: {} }, { type: 'Address proof', confidence: 31, fields: {} }], gst: null, udyam: null, lookups })).results;
  assert.equal(clear.checks[0].label, 'Expected details not found on this document');
  assert.match(clear.checks[0].detail, /ID card itself/);
  assert.equal(blurry.checks[0].label, 'Document could not be read');
});

test('a bill put in the Signatory ID box is named as such', async () => {
  const [result] = (await checkDocuments({ documents: [{ type: 'Signatory ID', confidence: 94, fields: {}, looksLike: 'Address proof' }], gst: null, udyam: null, lookups })).results;
  assert.equal(result.checks[0].label, 'This looks like an address proof, not a signatory ID');
  assert.match(result.checks[0].detail, /^Upload each document in its own box\. Upload the signatory’s ID card itself/);
});
