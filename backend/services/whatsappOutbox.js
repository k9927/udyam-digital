// Every outbound WhatsApp message is stored (the simulator and audit read it) and, when Meta is configured, sent for real.
import { WaMessage } from '../models/index.js';
import { cloudConfigured, sendCloudMessage } from '../libs/whatsappCloud.js';
import { config } from '../libs/config.js';

export async function sendWhatsApp(phone, { text, choices = [], kind = 'chat' }) {
  const message = await WaMessage.create({ phone, direction: 'out', text, choices, kind, delivery: 'simulated' });
  if (cloudConfigured()) {
    try { await sendCloudMessage(phone, { text, choices }); message.delivery = 'sent'; } catch (error) { message.delivery = 'failed'; console.warn(error.message); }
    await message.save();
  }
  return message;
}

// Order and KYC updates reach the owner's WhatsApp too (the website inbox keeps its own copy).
export async function mirrorNotification(user, { title, body, link }) {
  if (!user?.phone) return null;
  const site = config.clientUrl.split(',')[0].trim().replace(/\/$/, '');
  return sendWhatsApp(user.phone, { text: `*${title}*\n${body}${link ? `\n${site}${link}` : ''}`, kind: 'notification' });
}
