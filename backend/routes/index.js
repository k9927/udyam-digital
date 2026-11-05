import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler as h } from '../middlewares/error.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { upload, verifyFileContent } from '../middlewares/upload.js';
import * as auth from '../controllers/authController.js';
import * as catalogue from '../controllers/catalogueController.js';
import * as advisor from '../controllers/advisorController.js';
import * as quotes from '../controllers/quoteController.js';
import * as kyc from '../controllers/kycController.js';
import * as orders from '../controllers/orderController.js';
import * as field from '../controllers/fieldController.js';
import * as partner from '../controllers/partnerController.js';
import * as review from '../controllers/reviewController.js';
import * as ops from '../controllers/opsController.js';
import * as customer from '../controllers/customerController.js';
import * as demo from '../controllers/demoController.js';
import * as help from '../controllers/helpController.js';
import * as whatsapp from '../controllers/whatsappController.js';
import * as unregistered from '../controllers/unregisteredController.js';

const router = Router();
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const customerOnly = requireRole('customer');
const fieldStaff = requireRole('delivery', 'technician', 'ops_admin');
const partnerDesk = requireRole('partner', 'ops_admin');
const reviewer = requireRole('kyc_officer', 'ops_admin');
const opsOnly = requireRole('ops_admin');

router.get('/health', demo.health);

// Authentication
router.post('/auth/otp/request', otpLimiter, h(auth.requestOtp));
router.post('/auth/otp/verify', otpLimiter, h(auth.verifyLogin));
router.post('/auth/staff/login', otpLimiter, h(auth.staffLogin));
router.get('/auth/me', h(auth.me));
router.patch('/auth/me', requireAuth, h(auth.updateMe));
router.post('/auth/logout', auth.logout);
router.get('/auth/demo-accounts', h(auth.demoAccounts));
router.post('/auth/demo-login', h(auth.demoLogin));

// Public: catalogue, popular bundles, advisor, quotes, tracking, specimens
router.get('/catalogue', h(catalogue.listProducts));
router.get('/catalogue/popular', h(catalogue.popular));
router.get('/advisor/status', advisor.status);
router.post('/advisor/message', h(advisor.message));
router.post('/quotes', h(quotes.create));
router.get('/quotes/mine', customerOnly, h(quotes.mine));
router.get('/quotes/:id', h(quotes.get));
router.patch('/quotes/:id', h(quotes.update));
router.post('/quotes/:id/save', customerOnly, h(quotes.save));
router.get('/track', h(orders.track));
router.post('/callback-requests', otpLimiter, h(help.websiteCallback));

// WhatsApp: Meta Cloud API webhook, and the demo-mode simulator that drives the same conversation engine.
const waLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages. Slow down a little.' } });
router.get('/whatsapp/webhook', whatsapp.verifyWebhook);
router.post('/whatsapp/webhook', h(whatsapp.receiveWebhook));
router.get('/whatsapp/sim/thread', h(whatsapp.simThread));
router.post('/whatsapp/sim/messages', waLimiter, h(whatsapp.simSend));
router.delete('/whatsapp/sim/thread', h(whatsapp.simReset));
router.get('/specimens', kyc.listSpecimens);
router.get('/specimens/:name', h(kyc.specimenFile));

// Business account and KYC (owner)
router.get('/business/me', customerOnly, h(kyc.getMine));
router.patch('/business/me', customerOnly, h(kyc.updateMine));
router.post('/kyc/consent', customerOnly, h(kyc.giveConsent));
router.post('/kyc/consent/withdraw', customerOnly, h(kyc.withdrawConsent));
router.post('/kyc/gstin', customerOnly, h(kyc.lookupGstin));
router.post('/kyc/udyam', customerOnly, h(kyc.lookupUdyam));
router.delete('/kyc/registry/:kind', customerOnly, h(kyc.removeRegistry));
// No GST or Udyam yet: verify the owner and the shop, or get Udyam with the assistant.
router.post('/kyc/unregistered', customerOnly, h(unregistered.declare));
const aadhaarLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
router.post('/kyc/owner/otp', customerOnly, aadhaarLimiter, h(unregistered.requestAadhaarOtp));
router.post('/kyc/owner/verify', customerOnly, aadhaarLimiter, h(unregistered.verifyAadhaar));
router.get('/kyc/udyam-assist', customerOnly, h(unregistered.udyamGuide));
router.post('/kyc/udyam-assist', customerOnly, h(unregistered.startUdyamAssist));
router.get('/kyc/demo-documents/:kind', customerOnly, h(unregistered.demoDocument));
router.post('/kyc/documents', customerOnly, upload.single('file'), verifyFileContent, h(kyc.uploadDocument));
router.delete('/kyc/documents/:type', customerOnly, h(kyc.deleteDocument));
router.post('/kyc/request-review', customerOnly, h(kyc.requestReview));
router.post('/kyc/registration-help', customerOnly, h(help.registrationHelp));
router.get('/documents/:docId/file', requireAuth, h(kyc.viewDocument));

// Orders (owner; staff can read)
router.post('/orders', customerOnly, h(orders.create));
router.get('/orders/mine', customerOnly, h(orders.mine));
router.get('/orders/:id', requireAuth, h(orders.get));
router.post('/orders/:id/sign/request', customerOnly, h(orders.requestSignature));
router.post('/orders/:id/sign', customerOnly, h(orders.sign));
router.post('/orders/:id/pay', customerOnly, h(orders.pay));
router.get('/orders/:id/slots', requireAuth, h(orders.slots));
router.post('/orders/:id/slot', customerOnly, h(orders.bookSlot));
router.post('/orders/:id/callback', customerOnly, h(orders.requestCallback));
router.post('/orders/:id/gst-upgrade', customerOnly, h(orders.applyGstUpgrade));
router.post('/orders/:id/cancel', customerOnly, h(orders.cancel));
router.post('/orders/:id/rate', customerOnly, h(orders.rate));

// After go-live, help, notifications, privacy
router.get('/me/services', customerOnly, h(customer.services));
router.get('/me/bills', customerOnly, h(customer.bills));
router.post('/me/bills/:id/pay', customerOnly, h(customer.payBill));
router.get('/me/tickets', customerOnly, h(customer.myTickets));
router.post('/me/tickets', customerOnly, h(customer.createTicket));
router.post('/me/tickets/:id/messages', customerOnly, h(customer.replyTicket));
router.get('/me/data', customerOnly, h(customer.myData));
router.post('/me/data-requests', customerOnly, h(customer.createDataRequest));
router.get('/notifications', requireAuth, h(customer.notifications));
router.post('/notifications/read', requireAuth, h(customer.markRead));

// Field app: delivery agents and technicians
router.get('/field/jobs', fieldStaff, h(field.myJobs));
router.get('/field/jobs/:id', fieldStaff, h(field.getJob));
router.post('/field/jobs/:id/start', fieldStaff, h(field.startJob));
router.post('/field/jobs/:id/deliver', fieldStaff, h(field.confirmDelivery));
router.post('/field/jobs/:id/fail', fieldStaff, h(field.failJob));
router.patch('/field/jobs/:id/checklist', fieldStaff, h(field.updateChecklist));
router.post('/field/jobs/:id/photo', fieldStaff, upload.single('file'), verifyFileContent, h(field.uploadPhoto));
router.get('/field/jobs/:id/photo', requireAuth, h(field.jobPhoto));
router.post('/field/jobs/:id/signoff', fieldStaff, h(field.requestSignoff));
router.post('/field/jobs/:id/complete', fieldStaff, h(field.completeInstall));
router.post('/field/jobs/:id/service-complete', fieldStaff, h(field.completeService));

// Partner app
router.get('/partner/cases', partnerDesk, h(partner.queue));
router.get('/partner/cases/:id', partnerDesk, h(partner.detail));
router.post('/partner/cases/:id/claim', partnerDesk, h(partner.claim));
router.post('/partner/cases/:id/log', partnerDesk, h(partner.logOutcome));
router.post('/partner/cases/:id/send-link', partnerDesk, h(partner.sendLink));
router.get('/partner/leads', partnerDesk, h(partner.leads));
router.post('/partner/leads/:id/claim', partnerDesk, h(partner.claimLead));
router.get('/partner/activations', partnerDesk, h(partner.activations));

// KYC officer
router.get('/review/queue', reviewer, h(review.queue));
router.get('/review/:id', reviewer, h(review.detail));
router.post('/review/:id/decision', reviewer, h(review.decide));

// Operations
router.get('/ops/dashboard', opsOnly, h(ops.dashboard));
router.get('/ops/orders', opsOnly, h(ops.orders));
router.get('/ops/orders/:id', opsOnly, h(ops.orderDetail));
router.get('/ops/packing', opsOnly, h(ops.packingQueue));
router.post('/ops/orders/:id/pack', opsOnly, h(ops.packOrder));
router.get('/ops/cases', opsOnly, h(ops.cases));
router.post('/ops/cases/:id/assign', opsOnly, h(ops.assignCase));
router.get('/ops/tickets', opsOnly, h(ops.tickets));
router.post('/ops/tickets/:id/reply', opsOnly, h(ops.replyTicket));
router.post('/ops/tickets/:id/visit', opsOnly, h(ops.scheduleVisit));
router.get('/ops/users', opsOnly, h(ops.users));
router.post('/ops/users', opsOnly, h(ops.createUser));
router.post('/ops/users/:id/toggle', opsOnly, h(ops.toggleUser));
router.get('/ops/catalogue', opsOnly, h(ops.catalogue));
router.patch('/ops/catalogue/:productId', opsOnly, h(ops.updateProduct));
router.get('/ops/audit', opsOnly, h(ops.auditLog));
router.get('/ops/data-requests', opsOnly, h(ops.dataRequests));
router.post('/ops/data-requests/:id/complete', opsOnly, h(ops.completeDataRequest));
router.post('/ops/demo/reset', opsOnly, h(demo.reset));
router.post('/ops/scheduler/run', opsOnly, h(demo.runScheduler));

export default router;
