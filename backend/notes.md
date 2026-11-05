# Backend notes

Express 5 (ES modules) + Mongoose. `server.js` connects to MongoDB, loads the reference data, seeds demo staff and businesses (when `DEMO_MODE`), starts the scheduler and listens. `app.js` builds the Express app: helmet, CORS, cookies, rate limits, `/api` routes, and the built frontend if `frontend/dist` exists.

## Folders

| Folder | Contents |
|---|---|
| `controllers/` | One file per area (auth, catalogue, advisor, quote, kyc, order, field, partner, review, ops, customer, help, demo). Thin: validate with zod, call services, shape the response |
| `services/` | Business logic shared across controllers: `orderFlow` (state machine + side effects), `kycService` (registry, consent, verdicts, promote waiting orders), `routing` (partner and field-staff assignment), `notify`, `otp`, `audit`, `scheduler`, `insights`, `leadModel`, `reference` |
| `libs/` | Pure helpers with no DB access: `pricing` (quote builder), `recommend`, `advisorNlu` (rule-based understanding), `advisorAI` (Claude structured output), `kycParse` / `kycRules` (OCR parsing + checks), `propensity`, `popularBundles`, `messages` (17 notifications × 10 languages), `security`, `storage` (R2 or local disk), `config`, `csv` |
| `models/` | User, OtpCode, Business, Consent, Quote, Order, Job, Case, Reference (Product, GstRecord, UdyamRecord, Lead), Engagement (Notification, Ticket, Invoice, AuditLog, DataRequest) |
| `middlewares/` | `auth` (JWT cookie `ud_token`, `requireAuth`, `requireRole`), `upload` (multer, 10 MB, memory), `error` (HttpError, 404, JSON errors) |
| `routes/index.js` | Every route, grouped by role |
| `db/` | `connect.js`, `seed.js` (reference, staff, demo businesses, reset) |
| `data/` | The hackathon CSVs and the 47 KYC specimen images |
| `tests/` | `advisor-scenarios`, `kyc-specimens`, `journey` (end-to-end, all roles) |

## Key rules

- **Verify once, reuse.** KYC belongs to the business, not to an order. Status runs registry_needed → documents_needed → action_needed / in_review → verified, and verification is valid for 365 days. Orders placed before verification wait in `awaiting_kyc` and move on automatically.
- **GST-only products** are unlocked only by a *verified* GSTIN, never by what the owner says.
- **Consent** is purpose-bound and lasts 30 minutes. Registry lookups need active consent. Withdrawing consent before verification erases the documents and identifiers.
- **Privacy.** GSTIN/Udyam are AES-256-GCM encrypted, with an HMAC for lookups, and shown masked. Delivery and install codes are encrypted. Field staff see masked phones. A partner sees the full phone only on cases assigned to them. Every document view, decision and lookup is written to the audit log.
- **Partner routing.** City first, then state, then the customer's language, then the lightest load.
- **WhatsApp** is a second front end on the same engine: `services/whatsapp.js` runs the advisor (`advisorNlu` plus the shared question flow), prices with `pricing`, tracks by the sender's number and opens partner callbacks. `services/whatsappOutbox.js` stores every outbound message and sends it through Meta when configured. Customer notifications go to WhatsApp too, except one-time codes, which go by SMS.
- **Unregistered path.** `registration.path = 'unregistered'` plus the owner's e-KYC replaces the registry: required documents are a bill and a "shop proof" (Shop & Establishment / trade licence, matched to the declared name and the e-KYC name, or a shop-front photo that a KYC officer checks). The tier is `owner`; pricing treats it like any business without a verified GSTIN. Entering a GST or Udyam number later switches the business to the registered path.
- **Documents** are read in the browser: photos and scanned PDFs by OCR, digital PDFs from their text layer (pdf.js). Only the extracted fields and the file are uploaded.
- **Scheduler** (every `SCHEDULER_SECONDS`). Quotes saved more than `ABANDON_AFTER_MINUTES` ago become partner cases with a reminder. Orders past their SLA become `sla_risk` cases, and the owner gets a delay message.

## API map (all under `/api`)

**Public**
- `GET /health`, `GET /catalogue`, `GET /catalogue/popular`, `GET /advisor/status`, `POST /advisor/message`
- `POST /quotes`, `GET|PATCH /quotes/:id` (owner or `x-quote-token`), `POST /quotes/:id/save`, `GET /quotes/mine`
- `GET /track?ref=&last4=`, `POST /callback-requests`, `GET /specimens[/:name]`
- `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/staff/login`, `GET|PATCH /auth/me`, `POST /auth/logout`, `GET /auth/demo-accounts`, `POST /auth/demo-login`

**Customer**
- Business and KYC:
  - `GET|PATCH /business/me`
  - `POST /kyc/consent`, `POST /kyc/consent/withdraw`
  - `POST /kyc/gstin`, `POST /kyc/udyam`
  - `POST /kyc/documents`, `DELETE /kyc/documents/:type`
  - `POST /kyc/request-review`, `POST /kyc/registration-help`
  - `GET /documents/:docId/file` (owner or KYC/ops staff, audited)
- Orders:
  - `POST /orders`, `GET /orders/mine`, `GET /orders/:id`
  - `POST /orders/:id/sign/request`, `POST /orders/:id/sign`
  - `POST /orders/:id/pay`
  - `GET /orders/:id/slots`, `POST /orders/:id/slot`
  - `POST /orders/:id/callback`, `POST /orders/:id/cancel`, `POST /orders/:id/rate`
- After go-live:
  - `GET /me/services`
  - `GET /me/bills`, `POST /me/bills/:id/pay`
  - `GET|POST /me/tickets`, `POST /me/tickets/:id/messages`
  - `GET /me/data`, `POST /me/data-requests`
  - `GET /notifications`, `POST /notifications/read`

**WhatsApp**
- `GET|POST /whatsapp/webhook`: Meta Cloud API verification and inbound messages, signature-checked when `WHATSAPP_APP_SECRET` is set
- `GET /whatsapp/sim/thread?phone=`, `POST /whatsapp/sim/messages`, `DELETE /whatsapp/sim/thread`: demo-mode simulator over the same engine (`services/whatsapp.js`)

**Unregistered businesses**
- `POST /kyc/unregistered` (declare the business), `POST /kyc/owner/otp` + `POST /kyc/owner/verify` (Aadhaar e-KYC, simulated: Verhoeff checksum, OTP, only last 4 digits and a keyed hash stored)
- `GET|POST /kyc/udyam-assist` (guide with pre-filled details; starting it arms the 24 h reminder and 72 h partner case), `GET /kyc/demo-documents/:kind` (bill, licence or photo drawn for the demo)

**Delivery / technician**
- `GET /field/jobs[/:id]`
- Under `/field/jobs/:id/`: `start`, `deliver` (owner's code), `fail`, `checklist`, `photo`, `signoff`, `complete` (owner's code), `service-complete`

**Partner**
- `GET /partner/cases[/:id]`
- Under `/partner/cases/:id/`: `claim`, `log`, `send-link`
- `GET /partner/leads`, `POST /partner/leads/:id/claim`, `GET /partner/activations`

**KYC officer**
- `GET /review/queue`, `GET /review/:id`, `POST /review/:id/decision` (approve, reject, request_reupload)

**Ops admin**
- Dashboard and orders: `GET /ops/dashboard`, `GET /ops/orders[/:id]`, `GET /ops/packing`, `POST /ops/orders/:id/pack`
- Cases and tickets: `GET /ops/cases`, `POST /ops/cases/:id/assign`, `GET /ops/tickets`, `POST /ops/tickets/:id/reply|visit`
- Team and catalogue: `GET|POST /ops/users`, `POST /ops/users/:id/toggle`, `GET /ops/catalogue`, `PATCH /ops/catalogue/:productId`
- Audit and privacy: `GET /ops/audit`, `GET /ops/data-requests`, `POST /ops/data-requests/:id/complete`
- Demo: `POST /ops/demo/reset`, `POST /ops/scheduler/run`

## Scripts

`npm run dev` (nodemon) · `npm start` · `npm run seed` (`-- --reset` wipes demo data, `-- --force` reloads reference data) · `npm run create-admin` · `npm test`
