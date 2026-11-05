import { z } from 'zod';
import { Case, Business } from '../models/index.js';
import { encrypt } from '../libs/security.js';
import { openCase } from '../services/routing.js';
import { ensureBusiness } from './quoteController.js';

const LANGUAGES = ['en-IN', 'hi-IN', 'mr-IN', 'ta-IN', 'te-IN', 'kn-IN', 'gu-IN', 'bn-IN', 'ml-IN', 'pa-IN'];

// "Talk to a person" from the website: a partner in the visitor's city calls back in their language.
export async function websiteCallback(req, res) {
  const body = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.'), city: z.string().trim().min(2).max(60), language: z.enum(LANGUAGES).default('en-IN'), topic: z.string().trim().max(200).default('') }).parse(req.body);
  const item = await openCase({ kind: 'callback', title: `${body.name} (${body.city}) asked for a call from the website`, reason: body.topic || 'Wants help choosing a bundle', city: body.city, language: body.language });
  await Case.updateOne({ _id: item._id }, { $set: { contactEnc: encrypt(body.phone), contactName: body.name } });
  res.status(201).json({ ok: true });
}

// Owner without GST or Udyam: a partner helps them register (Udyam is free and online) and finish verification.
export async function registrationHelp(req, res) {
  const business = await ensureBusiness(req.user);
  const fresh = await Business.findById(business._id).lean();
  await openCase({ kind: 'no_registration', business: business._id, title: `${fresh.name}: needs help with GST/Udyam registration`, reason: String(req.body?.note || 'No GST or Udyam registration yet').slice(0, 200), city: fresh.city, state: fresh.state, language: fresh.preferredLanguage, ownerId: req.user._id });
  res.status(201).json({ ok: true });
}
