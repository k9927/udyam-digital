// Cross-checks OCR-extracted document fields against the GST/Udyam registries, date rules and each other.
import { gstinChecksumValid } from './kycParse.js';
import { maskGstin, maskUdyam } from './security.js';
import { config } from './config.js';

export const DOC_TYPES = ['GST certificate', 'Udyam certificate', 'Address proof', 'Signatory ID', 'Shop licence', 'Shop photo'];
export const REQUIRED_DOCS = ['Address proof', 'Signatory ID'];
// An unregistered business proves the owner with Aadhaar e-KYC (instead of a signatory ID) and the shop with a recent
// bill plus a Shop & Establishment / trade licence or a storefront photo ("Shop proof" = either of those two).
export const UNREGISTERED_DOCS = ['Address proof', 'Shop proof'];
export const DOC_FIELDS = {
  'GST certificate': ['gstin', 'legal_name', 'trade_name', 'constitution', 'address', 'registration_date'],
  'Udyam certificate': ['udyam_number', 'enterprise_name', 'major_activity', 'city', 'state', 'registration_date'],
  'Address proof': ['billed_to', 'address', 'bill_date'],
  'Signatory ID': ['name', 'designation', 'for_business', 'id_number', 'valid_till'],
  'Shop licence': ['licence_number', 'business_name', 'owner_name', 'address', 'valid_till'],
  'Shop photo': ['signboard_text'],
};

const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function similarity(left, right) {
  const a = compact(left), b = compact(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
export const daysBefore = date => Math.floor((Date.parse(`${config.kycReferenceDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
const proprietorOf = legalName => String(legalName || '').match(/^(.*?)\s*\(\s*prop/i)?.[1]?.trim() || '';

const AS_NOUN = { 'Address proof': 'an address proof', 'Signatory ID': 'a signatory ID', 'GST certificate': 'a GST certificate', 'Udyam certificate': 'a Udyam certificate', 'Shop licence': 'a shop licence', 'Shop photo': 'a shop photo' };
const article = name => AS_NOUN[name] || name;
const MISSING_HINT = {
  'GST certificate': 'The text was read, but no GSTIN was found. Upload the GST registration certificate (Form GST REG-06).',
  'Udyam certificate': 'The text was read, but no enterprise name was found. Upload the Udyam registration certificate.',
  'Address proof': 'The text was read, but no bill date or billed-to name was found. Upload a recent electricity, water or phone bill.',
  'Signatory ID': 'The text was read, but no name was found. Upload the signatory’s ID card itself, front side.',
  'Shop licence': 'The text was read, but no licence number or establishment name was found. Upload the Shop & Establishment certificate or trade licence.',
};

// documents: [{ type, confidence, fields }]; gst/udyam: verified registry rows for this business (or null).
// lookups: { gstRow(gstin), udyamRow(number), gstByTradeName(name, address) } return registry rows or null.
// owner: the Aadhaar e-KYC result ({ name }); declared: what an unregistered owner said about the business.
export async function checkDocuments({ documents, gst, udyam, lookups, owner = null, declared = null }) {
  const byType = Object.fromEntries(documents.map(doc => [doc.type, doc]));
  const gstFields = byType['GST certificate']?.fields || {}, udyamFields = byType['Udyam certificate']?.fields || {};
  // An owner verifying without registration is checked against what they declared, not against a certificate's GSTIN.
  const gstRow = gst || (!declared && gstinChecksumValid(gstFields.gstin || '') ? await lookups.gstRow(gstFields.gstin) : null);
  const udyamRow = udyam || (!declared && udyamFields.udyam_number ? await lookups.udyamRow(udyamFields.udyam_number) : null);
  const referenceName = gstRow?.trade_name || udyamRow?.enterprise_name || declared?.name || gstFields.trade_name || udyamFields.enterprise_name || byType['Signatory ID']?.fields?.for_business || byType['Address proof']?.fields?.billed_to || '';
  const referenceLegal = gstRow?.legal_name || gstFields.legal_name || '';
  // A bill or ID may carry the trade name, the full legal name, or (for a proprietorship) the owner's own name.
  const acceptedNames = [...new Set([referenceName, gstRow?.trade_name, gstRow?.legal_name, proprietorOf(gstRow?.legal_name), udyamRow?.enterprise_name, owner?.name].filter(Boolean))];
  const businessNames = acceptedNames.filter(name => name !== owner?.name && name !== proprietorOf(gstRow?.legal_name));
  const results = [];
  for (const { type, confidence = 0, fields = {}, looksLike } of documents) {
    const checks = [];
    const add = (status, label, detail = '') => checks.push({ status, label, detail });
    const required = { 'GST certificate': fields.gstin, 'Udyam certificate': fields.enterprise_name, 'Address proof': fields.bill_date || fields.billed_to, 'Signatory ID': fields.name, 'Shop licence': fields.licence_number || fields.business_name, 'Shop photo': true }[type];
    // Two different problems: a blurry image (low confidence), or a clear image that is not the expected document.
    // A storefront photo is judged by a person, so its text-recognition score does not matter.
    if (confidence < 60 && type !== 'Shop photo') {
      add('fail', 'Document could not be read', `Text recognition confidence was ${Math.round(confidence)}%. Upload a sharper, well-lit, uncropped photo.`);
      results.push({ type, status: 'fail', confidence, checks });
      continue;
    }
    if (!required) {
      add('fail', looksLike ? `This looks like ${article(looksLike)}, not ${article(type)}` : 'Expected details not found on this document', looksLike ? `Upload each document in its own box. ${MISSING_HINT[type].replace(/^The text was read, but [^.]+\. /, '')}` : MISSING_HINT[type]);
      results.push({ type, status: 'fail', confidence, checks });
      continue;
    }
    if (type !== 'Shop photo') add('pass', 'Document read', `Text recognition confidence ${Math.round(confidence)}%.`);
    const nameCheck = (value, label, names = acceptedNames) => {
      if (!names.length || !value) return;
      if (names.some(name => similarity(value, name) >= 0.9)) add('pass', `${label} matches the business`, value);
      else add('fail', `${label} does not match the business`, `Document: ${value} · Expected: ${names.join(' or ')}`);
    };
    if (type === 'GST certificate') {
      const gstin = fields.gstin;
      if (!gstinChecksumValid(gstin)) {
        const sameBusiness = await lookups.gstByTradeName(fields.trade_name, fields.address);
        add('fail', 'GSTIN on the certificate is not valid', `The 15-character number fails the GST checksum, so it may be altered or mistyped.${sameBusiness ? ` The registry lists ${maskGstin(sameBusiness.gstin)} for this business.` : ''}`);
      } else {
        const row = await lookups.gstRow(gstin);
        if (!row) add('fail', 'GSTIN not found in the registry', maskGstin(gstin));
        else {
          add('pass', 'GSTIN found in the registry', maskGstin(gstin));
          if (row.status === 'Active') add('pass', 'GST registration is active');
          else add('fail', `GST registration is ${row.status.toLowerCase()}`, 'Only an active registration can be accepted.');
          if (similarity(fields.legal_name, row.legal_name) >= 0.92) add('pass', 'Legal name matches the registry');
          else add('fail', 'Legal name differs from the registry', `Certificate: ${fields.legal_name || 'not readable'} · Registry: ${row.legal_name}`);
          if (similarity(fields.trade_name, row.trade_name) < 0.92) add('fail', 'Trade name differs from the registry', `Certificate: ${fields.trade_name || 'not readable'} · Registry: ${row.trade_name}`);
          if (similarity(fields.address, row.principal_place_of_business) < 0.88) add('warn', 'Address differs from the registry', 'A reviewer will confirm the installation address.');
        }
        if (gst?.gstin && gst.gstin !== gstin) add('fail', 'Certificate GSTIN differs from the GSTIN you verified', `${maskGstin(gstin)} vs ${maskGstin(gst.gstin)}`);
      }
    }
    if (type === 'Udyam certificate') {
      const number = fields.udyam_number;
      if (!number) add('fail', 'Udyam registration number is missing', 'The certificate does not show a registration number.');
      else {
        const row = await lookups.udyamRow(number);
        if (!row) add('fail', 'Udyam number not found in the registry', maskUdyam(number));
        else {
          add('pass', 'Udyam number found in the registry', maskUdyam(number));
          if (similarity(fields.enterprise_name, row.enterprise_name) < 0.92) add('fail', 'Enterprise name differs from the registry', `Certificate: ${fields.enterprise_name} · Registry: ${row.enterprise_name}`);
          if (similarity(fields.city, row.city) < 0.85 || similarity(fields.state, row.state) < 0.85) add('warn', 'Location differs from the registry', `${row.city}, ${row.state} in registry`);
        }
        if (udyam?.udyam_number && udyam.udyam_number !== number) add('fail', 'Certificate Udyam number differs from the one you verified');
      }
      nameCheck(fields.enterprise_name, 'Enterprise name');
    }
    if (type === 'Address proof') {
      const age = fields.bill_date ? daysBefore(fields.bill_date) : NaN;
      if (!Number.isFinite(age)) add('fail', 'Bill date could not be read');
      else if (age < 0 || age > 90) add('fail', 'Address proof is too old', `Dated ${fields.bill_date}: ${age} days before ${config.kycReferenceDate}. It must be within 90 days.`);
      else add('pass', 'Address proof is recent', `Dated ${fields.bill_date} (${age} days old).`);
      nameCheck(fields.billed_to, 'Billed-to name');
      if (gstRow) {
        if (similarity(fields.address, gstRow.principal_place_of_business) >= 0.88) add('pass', 'Address matches the GST principal place of business');
        else add('warn', 'Address differs from the GST principal place of business', 'Fine for a branch; a reviewer confirms it.');
      } else if (!udyamRow && declared?.city) {
        const address = String(fields.address || '').toLowerCase();
        if (!address) add('warn', 'Address could not be read', 'A reviewer will confirm the installation address.');
        else if (address.includes(declared.city.toLowerCase())) add('pass', 'Address is in the city you declared', declared.city);
        else add('warn', 'Address is outside the city you declared', `You declared ${declared.city}. A reviewer will confirm the shop address.`);
      } else if (udyamRow) {
        // Udyam lists only the city and state, so that is what the bill's address can be held to.
        const address = String(fields.address || '').toLowerCase();
        const inCity = udyamRow.city && address.includes(udyamRow.city.toLowerCase());
        const inState = udyamRow.state && address.includes(udyamRow.state.toLowerCase());
        if (!address) add('warn', 'Address could not be read', 'A reviewer will confirm the installation address.');
        else if (inCity && inState) add('pass', 'Address is in the Udyam-registered city', `${udyamRow.city}, ${udyamRow.state}`);
        else add('warn', 'Address is outside the Udyam-registered city', `Udyam lists ${udyamRow.city}, ${udyamRow.state}. Fine for a branch; a reviewer confirms it.`);
      }
    }
    if (type === 'Signatory ID') {
      if (!fields.valid_till) add('warn', 'Validity date could not be read');
      else if (daysBefore(fields.valid_till) > 0) add('fail', 'Signatory ID has expired', `Valid till ${fields.valid_till}.`);
      else add('pass', 'Signatory ID is valid', `Valid till ${fields.valid_till}.`);
      nameCheck(fields.for_business, 'Business on ID', acceptedNames.filter(name => name !== proprietorOf(gstRow?.legal_name)));
      const proprietor = proprietorOf(referenceLegal);
      if (proprietor) {
        if (similarity(fields.name, proprietor) >= 0.85) add('pass', 'Signatory is the registered proprietor');
        else add('warn', 'Signatory is not the registered proprietor', `Registry proprietor: ${proprietor}. An authorisation letter may be needed.`);
      }
    }
    if (type === 'Shop licence') {
      nameCheck(fields.business_name, 'Establishment name', businessNames.length ? businessNames : acceptedNames);
      if (owner?.name && fields.owner_name) {
        if (similarity(fields.owner_name, owner.name) >= 0.85) add('pass', 'Licence holder matches the owner’s Aadhaar e-KYC', fields.owner_name);
        else add('fail', 'Licence holder differs from the owner’s Aadhaar e-KYC', `Licence: ${fields.owner_name} · e-KYC: ${owner.name}`);
      } else if (!fields.owner_name) add('warn', 'Licence holder could not be read', 'A reviewer will confirm who holds the licence.');
      if (!fields.valid_till) add('warn', 'Validity date could not be read');
      else if (daysBefore(fields.valid_till) > 0) add('fail', 'Shop licence has expired', `Valid till ${fields.valid_till}.`);
      else add('pass', 'Shop licence is valid', `Valid till ${fields.valid_till}.`);
      if (declared?.city && fields.address && !String(fields.address).toLowerCase().includes(declared.city.toLowerCase())) add('warn', 'Licence address is outside the city you declared', `You declared ${declared.city}.`);
    }
    if (type === 'Shop photo') {
      const signboard = compact(fields.signboard_text);
      const shown = businessNames.find(name => compact(name).length >= 4 && signboard.includes(compact(name)));
      if (shown) add('pass', 'Signboard shows the business name', shown);
      // With a licence on file the photo is supporting evidence; on its own a person must look at it.
      if (!byType['Shop licence']) add('warn', 'A KYC officer will check the storefront photo', 'Usually within 4 working hours.');
    }
    const status = checks.some(check => check.status === 'fail') ? 'fail' : checks.some(check => check.status === 'warn') ? 'warn' : 'pass';
    results.push({ type, status, confidence, checks });
  }
  return { results, referenceName };
}

// Decides the business's verification state from registry results and document checks.
// GST and Udyam are two registrations of one enterprise, so both must describe the same business.
// A registry provider that returns the Udyam-linked PAN settles it: characters 3–12 of a GSTIN are that PAN.
// Otherwise the name must match (trade name, legal name, or the proprietor's business name) in the same state and city.
const businessPart = legalName => String(legalName || '').replace(/^.*\(prop\.\s*/i, '').replace(/\)\s*$/, '');
const norm = value => String(value || '').trim().toLowerCase();
export function sameEnterprise(gst, udyam) {
  if (!gst || !udyam) return { same: true, reasons: [] };
  if (udyam.pan && gst.gstin) {
    const same = gst.gstin.slice(2, 12).toUpperCase() === String(udyam.pan).toUpperCase();
    return { same, reasons: same ? [] : ['PAN on the Udyam registration differs from the PAN in the GSTIN'] };
  }
  const reasons = [];
  const nameScore = Math.max(similarity(gst.trade_name, udyam.enterprise_name), similarity(gst.legal_name, udyam.enterprise_name), similarity(businessPart(gst.legal_name), udyam.enterprise_name));
  if (nameScore < 0.9) reasons.push('Business name differs');
  if (gst.state && udyam.state && norm(gst.state) !== norm(udyam.state)) reasons.push('State differs');
  if (udyam.city && gst.principal_place_of_business && !norm(gst.principal_place_of_business).includes(norm(udyam.city))) reasons.push('City differs');
  return { same: reasons.length === 0, reasons };
}

export function decide({ gst, udyam, results, unregistered = false, owner = null }) {
  // A registration always wins; without one, an unregistered business stands on its owner's e-KYC.
  const ownerPath = unregistered && !gst && !udyam;
  const registryOk = ownerPath ? Boolean(owner?.name) : gst?.status === 'Active' || Boolean(udyam);
  const present = new Set(results.map(result => result.type));
  if (present.has('Shop licence') || present.has('Shop photo')) present.add('Shop proof');
  const missing = (ownerPath ? UNREGISTERED_DOCS : REQUIRED_DOCS).filter(type => !present.has(type));
  const failed = results.flatMap(result => result.checks.filter(check => check.status === 'fail').map(check => ({ type: result.type, ...check })));
  const warnings = results.flatMap(result => result.checks.filter(check => check.status === 'warn').map(check => ({ type: result.type, ...check })));
  const match = sameEnterprise(gst?.legal_name ? gst : null, udyam?.enterprise_name ? udyam : null);
  if (!match.same) failed.unshift({ type: 'Registry', status: 'fail', label: 'GST and Udyam registrations are for different businesses', detail: match.reasons.join(' · ') });
  let status;
  if (!registryOk) status = 'registry_needed';
  else if (missing.length) status = 'documents_needed';
  else if (failed.length) status = 'action_needed';
  else if (warnings.length) status = 'in_review';
  else status = 'verified';
  return { status, tier: ownerPath ? (registryOk ? 'owner' : null) : gst?.status === 'Active' ? 'gst' : udyam ? 'udyam' : null, missing, failed, warnings };
}
