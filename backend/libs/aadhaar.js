// Aadhaar numbers carry a Verhoeff check digit (the scheme UIDAI uses), so a mistyped number is caught before any OTP.
const D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
const P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export const normalizeAadhaar = value => String(value || '').replace(/\D/g, '');

export function aadhaarValid(value) {
  const digits = normalizeAadhaar(value);
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let check = 0;
  [...digits].reverse().forEach((digit, index) => { check = D[check][P[index % 8][Number(digit)]]; });
  return check === 0;
}

// Appends the check digit to an 11-digit stem (used to make valid demo numbers).
export function withCheckDigit(stem) {
  let check = 0;
  [...String(stem)].reverse().forEach((digit, index) => { check = D[check][P[(index + 1) % 8][Number(digit)]]; });
  return `${stem}${INV[check]}`;
}

export const maskAadhaar = last4 => `XXXX XXXX ${last4}`;
