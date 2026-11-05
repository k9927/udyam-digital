import { config } from '../libs/config.js';
import { storageDriver } from '../libs/storage.js';
import { resetDemo } from '../db/seed.js';
import { runChecks, udyamAssistChecks } from '../services/scheduler.js';
import { raiseMonthlyBills } from '../services/orderFlow.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

export async function reset(req, res) {
  if (!config.demoMode) throw new HttpError(404, 'Not found.');
  await resetDemo();
  await audit(req.user, 'demo.reset', 'System');
  res.json({ ok: true });
}

// In demo mode, { billingDate } raises the monthly bills as of that date (to show next month's bill without waiting).
export async function runScheduler(req, res) {
  const billingDate = req.body?.billingDate;
  const udyamAt = req.body?.udyamAssistAt;
  if (udyamAt && config.demoMode && !Number.isNaN(Date.parse(udyamAt))) return res.json({ udyam: await udyamAssistChecks(new Date(udyamAt)) });
  if (billingDate && config.demoMode && !Number.isNaN(Date.parse(billingDate))) return res.json({ bills: await raiseMonthlyBills(new Date(billingDate)) });
  res.json(await runChecks());
}

export function health(req, res) {
  res.json({ ok: true, demoMode: config.demoMode, otpDevMode: config.otpDevMode, storage: storageDriver(), kycReferenceDate: config.kycReferenceDate });
}
