import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const key = crypto.createHash('sha256').update(config.dataKey).digest();

// AES-256-GCM for identifiers (GSTIN, Udyam) at rest; HMAC for exact-match lookups without decrypting.
export function encrypt(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}
export function decrypt(payload) {
  if (!payload) return '';
  const [iv, tag, data] = payload.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
export const hmac = value => crypto.createHmac('sha256', key).update(String(value)).digest('hex');
export const randomCode = (digits = 6) => String(crypto.randomInt(10 ** (digits - 1), 10 ** digits));
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export const signToken = user => jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: '7d' });
export const verifyToken = token => jwt.verify(token, config.jwtSecret);

export const maskGstin = value => (value ? `${value.slice(0, 2)}•••••••••••${value.slice(-2)}` : '');
export const maskUdyam = value => (value ? `${value.slice(0, 10)}•••••••` : '');
export const maskPhone = value => (value ? `••••••${String(value).slice(-4)}` : '');
