import { User } from '../models/index.js';
import { verifyToken } from '../libs/security.js';
import { HttpError } from './error.js';

export const COOKIE = 'ud_token';

// Reads the JWT from the httpOnly cookie (or a Bearer header) and attaches req.user when valid.
export async function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.[COOKIE] || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).lean();
    if (user?.active) req.user = user;
  } catch { /* expired or tampered token: treat as signed out */ }
  next();
}

export const requireAuth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Please sign in to continue.')));

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  if (!roles.includes(req.user.role) && req.user.role !== 'super_admin') return next(new HttpError(403, 'You do not have access to this.'));
  next();
};

export const STAFF_ROLES = ['partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin', 'super_admin'];
