import { Notification, User } from '../models/index.js';
import { renderMessage } from '../libs/messages.js';
import { mirrorNotification } from './whatsappOutbox.js';

// Simulated SMS / WhatsApp: every message is stored in the recipient's inbox in their language.
export async function notifyCustomer(userId, kind, params = {}, link = '') {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  const { title, body } = renderMessage(kind, user.preferredLanguage, params);
  // One-time codes go by SMS; everything else is also sent on WhatsApp.
  const channel = kind === 'out_for_delivery' || kind === 'install_otp' ? 'sms' : 'whatsapp';
  if (channel === 'whatsapp') await mirrorNotification(user, { title, body, link }).catch(error => console.warn('WhatsApp mirror failed:', error.message));
  return Notification.create({ user: user._id, kind, title, body, link, language: user.preferredLanguage, channel });
}

export async function notifyStaff(userId, title, body, link = '') {
  if (!userId) return null;
  return Notification.create({ user: userId, kind: 'staff', title, body, link, channel: 'in_app', language: 'en-IN' });
}
