// Live check for the three keyed services: Claude advisor, Cloudflare R2 and Meta WhatsApp.
// Run from backend/:  npm run check:live            (add a 10-digit number to also send a WhatsApp test message)
//                     npm run check:live -- 98xxxxxxxx
import { config } from '../libs/config.js';
import { advisorAvailable, advisorTurn } from '../libs/advisorAI.js';
import { storageDriver, putObject, getObject, deleteObject } from '../libs/storage.js';
import { cloudConfigured, sendCloudMessage } from '../libs/whatsappCloud.js';
import { connectDB, disconnectDB } from '../db/connect.js';
import { getCatalogue } from '../services/reference.js';

const results = [];
const report = (service, status, detail) => { results.push({ service, status, detail }); console.log(`${status.padEnd(7)} ${service}: ${detail}`); };

async function checkClaude() {
  if (!config.anthropicConfigured) return report('Claude', 'SKIP', 'ANTHROPIC_API_KEY is not set');
  if (!advisorAvailable()) return report('Claude', 'SKIP', 'ADVISOR_AI is off');
  const started = Date.now();
  try {
    await connectDB();
    const catalogue = await getCatalogue();
    await disconnectDB();
    const turn = await advisorTurn({
      catalogue, language: 'en-IN', profile: {},
      messages: [{ from: 'user', text: 'Dental clinic in Kolkata, 8 staff, we have GST, internet keeps dropping. My PAN is ABCDE1234F.' }],
    });
    report('Claude', 'PASS', `answered in ${((Date.now() - started) / 1000).toFixed(1)} s: ${JSON.stringify(turn).slice(0, 160)}…`);
  } catch (error) {
    report('Claude', 'FAIL', error.message);
  }
}

async function checkR2() {
  if (storageDriver() !== 'r2') return report('R2', 'SKIP', 'R2 keys are not set (documents go to backend/uploads)');
  const key = `live-check/${Date.now()}.txt`;
  const body = Buffer.from(`Udyam Digital live check ${new Date().toISOString()}`);
  try {
    await putObject(key, body, 'text/plain');
    const back = await getObject(key);
    const chunks = [];
    for await (const chunk of back.stream) chunks.push(Buffer.from(chunk));
    const same = Buffer.concat(chunks).equals(body);
    await deleteObject(key);
    report('R2', same ? 'PASS' : 'FAIL', same ? `uploaded, read back and deleted ${key} in bucket ${config.r2.bucket}` : 'read-back content differs');
  } catch (error) {
    report('R2', 'FAIL', error.message);
  }
}

async function checkWhatsApp(phone) {
  if (!cloudConfigured()) return report('WhatsApp', 'SKIP', 'WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set');
  const { token, phoneNumberId, apiVersion } = config.whatsapp;
  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!response.ok) return report('WhatsApp', 'FAIL', `token check: ${data.error?.message || response.status}`);
    report('WhatsApp', 'PASS', `token works for ${data.display_phone_number} (${data.verified_name})`);
    if (!config.whatsapp.verifyToken || !config.whatsapp.appSecret) report('WhatsApp', 'WARN', 'set WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET before connecting the webhook');
    if (phone) {
      await sendCloudMessage(phone, { text: 'Udyam Digital: live check. Reply "hi" to start the advisor.' });
      report('WhatsApp', 'PASS', `test message sent to ${phone}`);
    }
  } catch (error) {
    report('WhatsApp', 'FAIL', error.message);
  }
}

const phone = process.argv[2] && /^[6-9]\d{9}$/.test(process.argv[2]) ? process.argv[2] : null;
await checkClaude();
await checkR2();
await checkWhatsApp(phone);
process.exit(results.some(result => result.status === 'FAIL') ? 1 : 0);
