import { createApp } from './app.js';
import { config, r2Configured } from './libs/config.js';
import { connectDB } from './db/connect.js';
import { seedReference, seedStaff, seedDemoData, ensureDemoDocumentFiles, ensureDemoJobChecklists } from './db/seed.js';
import { startScheduler } from './services/scheduler.js';
import { repairBusinessIdentities, repairUnregisteredDocuments } from './services/kycService.js';
import { Business } from './models/index.js';

await connectDB();
await seedReference();
await seedStaff();
if (config.demoMode) { await seedDemoData(); await ensureDemoDocumentFiles(); await ensureDemoJobChecklists(); }
const repaired = await repairBusinessIdentities();
if (repaired) console.log(`Corrected the name or location of ${repaired} business(es) to match their registrations`);
const cleaned = await repairUnregisteredDocuments();
if (cleaned) console.log(`Removed registered-path documents from ${cleaned} business(es) verifying without registration`);
// An Aadhaar-derived hash was once kept with the e-KYC result; nothing used it, so it is no longer stored.
const unhashed = await Business.updateMany({ 'ownerKyc.refHash': { $exists: true } }, { $unset: { 'ownerKyc.refHash': '' } }, { strict: false });
if (unhashed.modifiedCount) console.log(`Removed the stored Aadhaar hash from ${unhashed.modifiedCount} business(es)`);
startScheduler();

if (config.jwtSecret.startsWith('dev-only') || config.dataKey.startsWith('dev-only')) console.warn('Warning: using development JWT_SECRET / DATA_ENCRYPTION_KEY. Set real values in backend/.env before deploying.');
console.log(`Documents stored in ${r2Configured() ? `Cloudflare R2 bucket "${config.r2.bucket}"` : 'backend/uploads (set R2_* in backend/.env to use Cloudflare R2)'}`);

createApp().listen(config.port, () => console.log(`Udyam Digital API on http://localhost:${config.port}`));
