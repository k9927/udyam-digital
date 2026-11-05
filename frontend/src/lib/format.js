export const rupees = value => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
export const shortDate = value => (value ? new Date(String(value).length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
export const longDate = value => (value ? new Date(String(value).length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const dateTime = value => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
// Status codes as readable labels: sentence case, acronyms kept upper case ("awaiting_kyc" → "Awaiting KYC").
const ACRONYMS = new Set(['kyc', 'gst', 'gstin', 'upi', 'otp', 'sla', 'id', 'ont', 'sms', 'nps', 'dpdp', 'pan']);
export const titleCase = value => String(value || '').replace(/[_.]/g, ' ').trim().split(/\s+/).map((word, index) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : index === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase())).join(' ');
export const timeAgo = value => {
  const minutes = Math.round((Date.now() - new Date(value)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};
// "per device" × 5 → "5 devices"
export const quantityLabel = (quantity, unit) => { const noun = String(unit || '').replace(/^per /, ''); return `${quantity} ${quantity === 1 || !noun ? noun : `${noun}s`}`.trim(); };
