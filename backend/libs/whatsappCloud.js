// Meta WhatsApp Cloud API: outbound messages and webhook parsing. Used only when a token and phone number ID are set.
import crypto from 'node:crypto';
import { config } from './config.js';

export const cloudConfigured = () => Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);

// Indian 10-digit mobile ⇄ WhatsApp's international format without "+".
export const toWaId = phone => (String(phone).length === 10 ? `91${phone}` : String(phone));
export const fromWaId = waId => String(waId).replace(/^\+?91(?=[6-9]\d{9}$)/, '');

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// A message with choices becomes reply buttons (up to 3) or a list (up to 10 rows), within WhatsApp's length limits.
export function toCloudPayload(phone, { text, choices = [] }) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: toWaId(phone) };
  if (!choices.length) return { ...base, type: 'text', text: { body: clip(text, 4096), preview_url: true } };
  if (choices.length <= 3) {
    return { ...base, type: 'interactive', interactive: { type: 'button', body: { text: clip(text, 1024) }, action: { buttons: choices.map(choice => ({ type: 'reply', reply: { id: choice.id, title: clip(choice.label, 20) } })) } } };
  }
  return {
    ...base, type: 'interactive',
    interactive: { type: 'list', body: { text: clip(text, 1024) }, action: { button: 'Choose', sections: [{ title: 'Options', rows: choices.slice(0, 10).map(choice => ({ id: choice.id, title: clip(choice.label, 24), ...(choice.label.length > 24 ? { description: clip(choice.label, 72) } : {}) })) }] } },
  };
}

export async function sendCloudMessage(phone, message) {
  const { token, phoneNumberId, apiVersion } = config.whatsapp;
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(toCloudPayload(phone, message)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
}

export function validSignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return true;
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex')}`);
  const given = Buffer.from(header);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// Webhook body → [{ phone, name, text, choice }] for text, button and list replies.
export function parseWebhook(body) {
  const inbound = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map(contact => [contact.wa_id, contact.profile?.name || '']));
      for (const message of value.messages || []) {
        const reply = message.interactive?.button_reply || message.interactive?.list_reply || null;
        inbound.push({ phone: fromWaId(message.from), name: names[message.from] || '', text: message.text?.body || reply?.title || message.button?.text || '', choice: reply?.id || null });
      }
    }
  }
  return inbound;
}
