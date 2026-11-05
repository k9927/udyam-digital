import { z } from 'zod';
import { WaSession, WaMessage } from '../models/index.js';
import { handleInbound } from '../services/whatsapp.js';
import { parseWebhook, validSignature, cloudConfigured } from '../libs/whatsappCloud.js';
import { config } from '../libs/config.js';
import { HttpError } from '../middlewares/error.js';

// Meta calls this once when the webhook is registered.
export function verifyWebhook(req, res) {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) return res.type('text/plain').send(String(challenge));
  res.sendStatus(403);
}

// Meta expects a fast 200; each message is then handled in turn.
export async function receiveWebhook(req, res) {
  if (!validSignature(req.rawBody, req.headers['x-hub-signature-256'])) return res.sendStatus(401);
  const inbound = parseWebhook(req.body);
  res.sendStatus(200);
  for (const message of inbound) {
    try { await handleInbound(message, { delivery: 'received' }); } catch (error) { console.error('WhatsApp message failed:', error.message); }
  }
}

// The simulator lets anyone act as any number, so it exists only in demo mode.
const requireDemo = () => { if (!config.demoMode) throw new HttpError(404, 'Not found.'); };
const PHONE = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number.');
const present = message => ({ id: String(message._id), direction: message.direction, text: message.text, choices: message.choices, kind: message.kind, delivery: message.delivery, at: message.createdAt });

export async function simThread(req, res) {
  requireDemo();
  const phone = PHONE.parse(req.query.phone);
  const messages = await WaMessage.find({ phone }).sort({ createdAt: 1, _id: 1 }).limit(300).lean();
  const session = await WaSession.findOne({ phone }).lean();
  res.json({ messages: messages.map(present), language: session?.language || '', live: cloudConfigured() });
}

export async function simSend(req, res) {
  requireDemo();
  const body = z.object({ phone: PHONE, text: z.string().max(600).default(''), choice: z.string().max(80).nullable().default(null), name: z.string().max(60).default('') }).parse(req.body);
  if (!body.text.trim() && !body.choice) throw new HttpError(400, 'Type a message.');
  await handleInbound(body);
  const messages = await WaMessage.find({ phone: body.phone }).sort({ createdAt: 1, _id: 1 }).limit(300).lean();
  res.json({ messages: messages.map(present) });
}

export async function simReset(req, res) {
  requireDemo();
  const phone = PHONE.parse(req.query.phone);
  await Promise.all([WaMessage.deleteMany({ phone }), WaSession.deleteOne({ phone })]);
  res.json({ ok: true });
}
