import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Business } from '../models/index.js';
import { config } from '../libs/config.js';
import { signToken, maskPhone } from '../libs/security.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { HttpError } from '../middlewares/error.js';
import { COOKIE } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';

const LANGUAGES = ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN', 'kn-IN', 'gu-IN', 'bn-IN', 'ml-IN', 'pa-IN'];
const phoneSchema = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.');

export const publicUser = user => user && ({
  id: String(user._id), role: user.role, name: user.name, email: user.email, phone: user.phone ? maskPhone(user.phone) : undefined,
  preferredLanguage: user.preferredLanguage, region: user.region, demo: user.demo,
});

function setSession(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', maxAge: 7 * 86_400_000 });
  return token;
}

export async function requestOtp(req, res) {
  const phone = phoneSchema.parse(req.body?.phone);
  const existing = await User.findOne({ phone }).lean();
  if (existing && existing.role !== 'customer') throw new HttpError(400, 'This number belongs to a staff account. Use staff sign-in.');
  const { devCode } = await issueOtp('login', phone);
  res.json({ sent: true, phone: maskPhone(phone), devCode });
}

export async function verifyLogin(req, res) {
  const body = z.object({ phone: phoneSchema, code: z.string().trim().min(4).max(8), name: z.string().trim().max(80).optional(), language: z.enum(LANGUAGES).optional() }).parse(req.body);
  await verifyOtp('login', body.phone, body.code);
  let user = await User.findOne({ phone: body.phone });
  if (!user) user = await User.create({ role: 'customer', phone: body.phone, name: body.name || '', preferredLanguage: body.language || 'en-IN' });
  else {
    if (body.name && !user.name) user.name = body.name;
    if (body.language) user.preferredLanguage = body.language;
  }
  user.lastLoginAt = new Date();
  await user.save();
  const token = setSession(res, user);
  await audit(user, 'login.otp', 'User', user._id);
  res.json({ user: publicUser(user), token });
}

export async function staffLogin(req, res) {
  const body = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
  if (!user || user.role === 'customer' || !user.active || !(await bcrypt.compare(body.password, user.passwordHash || ''))) throw new HttpError(401, 'Email or password is not correct.');
  user.lastLoginAt = new Date();
  await user.save();
  const token = setSession(res, user);
  await audit(user, 'login.staff', 'User', user._id);
  res.json({ user: publicUser(user), token });
}

export async function me(req, res) {
  if (!req.user) return res.json({ user: null });
  const business = req.user.role === 'customer' ? await Business.findOne({ owner: req.user._id }).select('name kyc.status kyc.tier').lean() : null;
  res.json({ user: publicUser(req.user), business: business && { id: String(business._id), name: business.name, kycStatus: business.kyc?.status, tier: business.kyc?.tier } });
}

export async function updateMe(req, res) {
  const body = z.object({ name: z.string().trim().max(80).optional(), preferredLanguage: z.enum(LANGUAGES).optional() }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.user._id, { $set: body }, { returnDocument: 'after' }).lean();
  if (body.preferredLanguage && user.role === 'customer') await Business.updateMany({ owner: user._id }, { $set: { preferredLanguage: body.preferredLanguage } });
  res.json({ user: publicUser(user) });
}

export function logout(req, res) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

// Demo mode only: list seeded accounts and switch between them in one click.
export async function demoAccounts(req, res) {
  if (!config.demoMode) return res.json({ enabled: false, accounts: [] });
  const users = await User.find({ demo: true }).sort({ role: 1, name: 1 }).lean();
  res.json({ enabled: true, password: config.demoPassword, accounts: users.map(user => ({ id: String(user._id), role: user.role, name: user.name, email: user.email, cities: user.region?.cities || [] })) });
}

export async function demoLogin(req, res) {
  if (!config.demoMode) throw new HttpError(404, 'Not found.');
  const user = await User.findOne({ _id: req.body?.userId, demo: true });
  if (!user) throw new HttpError(404, 'Demo account not found.');
  const token = setSession(res, user);
  await audit(user, 'login.demo', 'User', user._id);
  res.json({ user: publicUser(user), token });
}
