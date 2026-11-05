// Removes identifiers an owner might type into the chat before any text leaves for the external AI provider.
// Order matters: the longer, more specific patterns (GSTIN contains a PAN) run first.
const RULES = [
  ['GSTIN', /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/gi],
  ['Udyam number', /\bUDYAM[-\s]?[A-Z]{2}[-\s]?\d{2}[-\s]?\d{7}\b/gi],
  ['PAN', /\b[A-Z]{5}\d{4}[A-Z]\b/gi],
  ['Aadhaar number', /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  ['phone number', /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b/g],
  ['email', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g],
];

export function redactIdentifiers(text) {
  let clean = String(text ?? '');
  const removed = [];
  for (const [label, pattern] of RULES) {
    clean = clean.replace(pattern, () => { removed.push(label); return `[${label} removed]`; });
  }
  return { text: clean, removed };
}
