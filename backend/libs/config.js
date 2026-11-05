import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flag = (value, fallback) => (value === undefined || value === '' ? fallback : !['false', '0', 'off', 'no'].includes(String(value).toLowerCase()));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/udyam_digital',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-me',
  dataKey: process.env.DATA_ENCRYPTION_KEY || 'dev-only-data-key-change-me',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  demoMode: flag(process.env.DEMO_MODE, true),
  otpDevMode: flag(process.env.OTP_DEV_MODE, true),
  // The synthetic pack's documents are dated mid-2026; age rules use the pack's reference date.
  kycReferenceDate: process.env.KYC_REFERENCE_DATE || '2026-07-15',
  abandonAfterMinutes: Number(process.env.ABANDON_AFTER_MINUTES || 1440),
  schedulerSeconds: Number(process.env.SCHEDULER_SECONDS || 60),
  dataDir: path.join(backendRoot, 'data'),
  uploadsDir: path.join(backendRoot, 'uploads'),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    endpoint: process.env.R2_ENDPOINT || '',
  },
  advisorAi: process.env.ADVISOR_AI || 'auto',
  // Meta WhatsApp Cloud API. Without a token and phone number ID, WhatsApp runs in the in-app simulator only.
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
  anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@udyam.demo',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  demoPassword: process.env.DEMO_STAFF_PASSWORD || 'Demo@12345',
};

export const r2Configured = () => Boolean(config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.bucket && (config.r2.accountId || config.r2.endpoint));

// The development defaults above are public; never run production on them.
if (config.env === 'production') {
  const weak = [['JWT_SECRET', process.env.JWT_SECRET], ['DATA_ENCRYPTION_KEY', process.env.DATA_ENCRYPTION_KEY], ['ADMIN_PASSWORD', process.env.ADMIN_PASSWORD]].filter(([, value]) => !value || value.length < 12).map(([name]) => name);
  if (weak.length) throw new Error(`Set strong values for ${weak.join(', ')} in backend/.env before running in production.`);
}
