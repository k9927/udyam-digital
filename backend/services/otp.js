import { OtpCode } from '../models/index.js';
import { randomCode, sha256 } from '../libs/security.js';
import { config } from '../libs/config.js';
import { HttpError } from '../middlewares/error.js';

const TTL_MINUTES = { login: 10, esign: 10, delivery: 24 * 60, install: 6 * 60, aadhaar: 10 };

// Issues a code; in OTP dev mode the code is also returned so the demo works without an SMS provider.
export async function issueOtp(purpose, target) {
  await OtpCode.deleteMany({ purpose, target, consumedAt: null });
  const code = randomCode(6);
  await OtpCode.create({ purpose, target, codeHash: sha256(`${purpose}:${target}:${code}`), expiresAt: new Date(Date.now() + TTL_MINUTES[purpose] * 60_000) });
  return { code, devCode: config.otpDevMode ? code : undefined };
}

export async function verifyOtp(purpose, target, code) {
  const record = await OtpCode.findOne({ purpose, target, consumedAt: null }).sort({ createdAt: -1 });
  if (!record || record.expiresAt < new Date()) throw new HttpError(400, 'The code has expired. Request a new one.');
  if (record.attempts >= 5) throw new HttpError(429, 'Too many attempts. Request a new code.');
  if (record.codeHash !== sha256(`${purpose}:${target}:${String(code).trim()}`)) {
    record.attempts += 1;
    await record.save();
    throw new HttpError(400, 'That code is not correct.');
  }
  record.consumedAt = new Date();
  await record.save();
  return true;
}
