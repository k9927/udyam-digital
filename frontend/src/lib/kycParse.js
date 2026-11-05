// Turns OCR text from the specimen KYC layouts into the few fields each check needs.
const GSTIN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toDigit = { O: '0', D: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };
const toLetter = { 0: 'O', 1: 'I', 5: 'S', 8: 'B', 2: 'Z', 6: 'G' };
const DIGIT_POSITIONS = [0, 1, 7, 8, 9, 10], LETTER_POSITIONS = [2, 3, 4, 5, 6, 11];

export function gstinChecksumValid(value) {
  if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(value || '')) return false;
  let sum = 0, factor = 2;
  for (const char of [...value.slice(0, 14)].reverse()) {
    const product = GSTIN_ALPHABET.indexOf(char) * factor;
    sum += Math.floor(product / 36) + product % 36;
    factor = factor === 2 ? 1 : 2;
  }
  return value[14] === GSTIN_ALPHABET[(36 - sum % 36) % 36];
}

// Repairs common OCR confusions using the fixed GSTIN layout (state digits, PAN letters/digits, 'Z' at position 14).
export function normalizeGstin(raw) {
  const chars = [...String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')];
  if (chars.length !== 15) return chars.join('');
  for (const index of DIGIT_POSITIONS) chars[index] = toDigit[chars[index]] || chars[index];
  for (const index of LETTER_POSITIONS) chars[index] = toLetter[chars[index]] || chars[index];
  if (['7', '2'].includes(chars[13])) chars[13] = 'Z';
  const value = chars.join('');
  if (gstinChecksumValid(value)) return value;
  const swap = { 0: 'O', O: '0', 1: 'I', I: '1' };
  if (swap[value[14]] && gstinChecksumValid(value.slice(0, 14) + swap[value[14]])) return value.slice(0, 14) + swap[value[14]];
  return value;
}

export function normalizeUdyam(raw) {
  const match = String(raw || '').toUpperCase().replace(/\s+/g, '').match(/UDYAM-?([A-Z]{2})-?([0-9O]{2})-?([0-9O]{7})/);
  return match ? `UDYAM-${match[1]}-${match[2].replace(/O/g, '0')}-${match[3].replace(/O/g, '0')}` : '';
}

const dateIn = value => String(value || '').match(/(\d{4})[-./](\d{2})[-./](\d{2})/)?.slice(1).join('-') || '';
const clean = value => String(value || '').replace(/[|_—–]+/g, ' ').replace(/\s+/g, ' ').trim();

const LABELS = /^(gstin|legal\s*name|trade\s*name|constitution|address of|place of|date of|type of|udyam|enterprise|major|city|state|consumer|billed|supply|bill date|units|amount|name|designation|for business|id no|valid|registration no|licence no|license no|establishment|employer|owner|nature of|address)/i;

export function parseKycText(type, text) {
  const lines = String(text || '').split('\n').map(clean).filter(Boolean);
  const sameLine = label => {
    const line = lines.find(item => label.test(item));
    return line ? clean(line.replace(label, '')) : '';
  };
  const nextLine = label => {
    const index = lines.findIndex(item => label.test(item));
    if (index < 0) return '';
    const rest = clean(lines[index].replace(label, ''));
    return rest || (lines[index + 1] && !LABELS.test(lines[index + 1]) ? lines[index + 1] : '');
  };
  const continued = label => {
    const index = lines.findIndex(item => label.test(item));
    if (index < 0) return '';
    const first = clean(lines[index].replace(label, ''));
    const second = lines[index + 1] && !LABELS.test(lines[index + 1]) ? lines[index + 1] : '';
    return clean(`${first} ${second}`);
  };
  if (type === 'GST certificate') {
    const gstinRaw = sameLine(/^gstin\b[:\s]*/i);
    return {
      gstin: normalizeGstin(gstinRaw.split(' ')[0]),
      legal_name: sameLine(/^legal\s*name[:\s]*/i),
      trade_name: sameLine(/^trade\s*name[:\s]*/i),
      constitution: sameLine(/^constitution[:\s]*/i),
      address: clean(`${sameLine(/^address of principal[:\s]*/i)} ${sameLine(/^place of business[:\s]*/i)}`),
      registration_date: dateIn(sameLine(/^date of liability/i)),
    };
  }
  if (type === 'Udyam certificate') {
    return {
      udyam_number: normalizeUdyam(sameLine(/^udyam\s*reg\.?\s*number[:\s]*/i) || text),
      enterprise_name: sameLine(/^enterprise\s*name[:\s]*/i),
      major_activity: sameLine(/^major\s*activity[:\s]*/i),
      city: sameLine(/^city[:\s]*/i),
      state: sameLine(/^state[:\s]*/i),
      registration_date: dateIn(sameLine(/^date of registration/i)),
    };
  }
  if (type === 'Address proof') {
    return {
      billed_to: sameLine(/^billed\s*to[:\s]*/i),
      address: continued(/^supply\s*address[:\s]*/i),
      bill_date: dateIn(sameLine(/^bill\s*date/i)),
    };
  }
  if (type === 'Signatory ID') {
    return {
      name: nextLine(/^name\b[:\s]*/i),
      designation: nextLine(/^designation[:\s]*/i),
      for_business: nextLine(/^for\s*business[:\s]*/i),
      id_number: nextLine(/^id\s*no\.?[:\s]*/i),
      valid_till: dateIn(nextLine(/^valid\s*till[:\s]*/i)),
    };
  }
  if (type === 'Shop licence') {
    // Shop & Establishment registration or municipal trade licence.
    return {
      licence_number: nextLine(/^(registration|licen[cs]e)\s*(no|number)\.?[:\s]*/i),
      business_name: nextLine(/^name of (the )?establishment[:\s]*/i) || nextLine(/^trade\s*name[:\s]*/i),
      owner_name: nextLine(/^name of (the )?(employer|owner|proprietor)[:\s]*/i),
      address: continued(/^address[:\s]*/i),
      // OCR often garbles the label ("Valid ill", "Valid upto"); the date after it is what matters.
      valid_till: dateIn(nextLine(/^valid\b\D*/i)),
    };
  }
  if (type === 'Shop photo') {
    // A storefront: whatever text is on the signboard, matched against the business name.
    return { signboard_text: lines.slice(0, 6).join(' ').slice(0, 200) };
  }
  return {};
}
