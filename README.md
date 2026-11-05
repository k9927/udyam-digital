# Udyam Digital · Accel Business

A mobile-friendly website and WhatsApp journey that takes a small business from one sentence to a booked installation, in its own language.

**Team NATPAT · TIET, Patiala** · Airtel SYNC 2026, Digital Track
Karandeep Singh Bhasin (102353008) · Armaan Gogoi (102303623)

All data is synthetic, from the case pack.

**Stack:** MongoDB · Express 5 · React 19 (Vite + Tailwind) · Node 24, with documents in Cloudflare R2 (S3-compatible) and a Claude-powered advisor.

## For judges: 5 minutes

1. Run it locally (below), open http://localhost:5173 and type a sentence such as *"Dental clinic in Kolkata, 8 staff, we have GST, internet keeps dropping"*.
2. Follow the quote → sign in (the OTP is shown on screen) → **Verify** with *Demo: load specimen applicant* → e-sign → pay → pick a slot.
3. Use **Demo: view as…** (bottom right) to see the same order from the warehouse, delivery, technician, partner, KYC officer and ops roles.
4. Open `/whatsapp` for the same journey by chat.
5. Run `npm test` for the 78 automated tests.

```
udyam-digital/
├── backend/    Express API: controllers, db, libs, middlewares, models, routes, services, tests
├── frontend/   React app: every actor's screens, 10 languages
└── package.json  one-command scripts for both
```

## What is inside

| Actor | What they do | Where |
|---|---|---|
| Business owner | Advisor (type, tap or speak, 10 languages) → priced bundle → OTP sign-in → verify once with GSTIN/Udyam + 2 documents (photo or PDF) → e-sign → UPI pay → pick install slot → live tracker → one bill, help, add-ons, privacy rights | `/`, `/advisor`, `/quote/:id`, `/app/*`, `/track` |
| Business owner with no GST or Udyam | Either the **Udyam assistant** (`/app/udyam`): what to keep ready, details pre-filled to copy, a suggested activity code, then instant verification with the new number (reminder after a day, partner call after three). Or **verify without registration**: declare the business, Aadhaar e-KYC by OTP (only the last 4 digits kept), a recent bill plus a shop licence (checked automatically) or a shop-front photo (checked by a KYC officer). Result: **owner-verified**, able to buy everything that does not need GST | `/app/kyc`, `/app/udyam` |
| Business owner on WhatsApp | The same advisor by chat in 10 languages → priced quote with a link to order; track an order by number; ask for a partner to call. Every order and verification update also arrives on WhatsApp | `/whatsapp` (simulator), `/api/whatsapp/webhook` (Meta) |
| Partner (local, by city/state/language) | Cases the journey could not close: failed payments, abandoned quotes, KYC help, callbacks, late installs; stalled leads ranked by a propensity model | `/partner/*` |
| KYC officer | Only applications the rules could not pass, side by side with the registry | `/review/*` |
| Warehouse / ops | Pack kits, live funnel dashboard (against the 5,000-lead baseline), tickets, team, catalogue, audit log, data requests | `/ops/*` |
| Delivery agent | Deliveries confirmed with the owner's one-time code | `/field` |
| Technician | Install checklist, speed test, photo, owner's sign-off code; service visits | `/field` |

**Order flow:** awaiting KYC → signature → payment → slot → packing → dispatch → out for delivery → delivered → installing → installed → **live**. Every step notifies the owner in their language and updates the tracker, so they never need to call.

## Run it locally (5 minutes)

**Prerequisites:** Node 20+ (24 recommended) and MongoDB, either a local `mongod` or a free MongoDB Atlas cluster.

```bash
npm run install:all
```

```bash
cp backend/.env.example backend/.env
```

Then, in two terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open http://localhost:5173. On first start the API loads the catalogue, the registries and the 5,000 leads, creates the demo staff, and seeds nine demo businesses at different stages.

To run everything from one server (the built app on http://localhost:5000):

```bash
npm start
```

### Demo shortcuts

- **"Demo: view as…"** (bottom right) switches between the demo customer and every staff role without a password.
- Staff sign in at `/staff/login`, for example `vikram.ops@udyam.demo`, `priya.kyc@udyam.demo` or `lakshmi.partner@udyam.demo`. The password is `DEMO_STAFF_PASSWORD` (default `Demo@12345`).
- Customer OTP codes are shown on screen while `OTP_DEV_MODE=true`.
- The KYC page has **Demo: load specimen applicant**, which runs the 12 specimen applicants through real on-device OCR. On the "Verify without registration" path it offers **Demo: load sample shop documents** instead (a bill, a shop licence and a shop-front photo drawn with your details). For Aadhaar e-KYC use any valid test number such as `499112345677`; the OTP is shown on screen.
- **`/whatsapp`** is a WhatsApp simulator. Chat as a new owner, or as a seeded customer such as Sneha Rao (`9876500001`), whose order updates are already in the thread.
- To reset the demo data, use **Ops → Dashboard → Reset demo** or run `npm run reset`.

### Tests

```bash
npm test
```

The suite has 78 tests. They cover:
- the advisor scenario bank: judge-style free text in, compliant bundle out, plus a sweep of 2,000 profiles;
- real OCR over all 47 specimen images, against the expected KYC verdicts;
- one end-to-end journey through the real API across all seven roles, including access-control checks and DPDP erasure;
- unregistered businesses: Aadhaar checksum and OTP (with a clear message for a mistyped number), owner-verified with a licence, photo-only review, a licence in someone else's name, switching from the registered path (the other identity's certificates are removed), Udyam reminders and partner escalation, and that the Aadhaar number is never stored;
- the WhatsApp channel: advisor by chat, Hindi detection, tracking by number, partner hand-off, the Meta webhook and WhatsApp's message limits.

The tests need MongoDB on `127.0.0.1:27017`. They use their own throwaway database.

## Secrets and configuration

Everything goes in **`backend/.env`**; the frontend needs no secrets. Only `MONGO_URI` is needed to run locally. Every other setting has a safe development default, and with `NODE_ENV=production` the server refuses to start until the three security values are set.

| Variable | Needed for | How to get it |
|---|---|---|
| `MONGO_URI` | Always | Local: `mongodb://127.0.0.1:27017/udyam_digital`. Atlas: see 1 below |
| `JWT_SECRET` | Production | Random string, see 2 below |
| `DATA_ENCRYPTION_KEY` | Production | Random string, see 2 below. Encrypts GSTIN/Udyam numbers, delivery and install codes at rest |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Document storage in the cloud | See 3 below. Leave empty to store files in `backend/uploads` |
| `R2_ENDPOINT` | Optional | Only for EU-jurisdiction buckets: `https://<account_id>.eu.r2.cloudflarestorage.com` |
| `ANTHROPIC_API_KEY` | Claude advisor | See 4 below |
| `ADVISOR_AI` | Optional | `auto` (use Claude when a key is set), `on`, or `off` (always the local rules) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Super admin login | Your choice; then run `npm run create-admin` |
| `CLIENT_URL` | Production | The site's public URL, e.g. `https://udyam.example.com` (comma-separate several) |
| `DEMO_MODE`, `OTP_DEV_MODE` | Demo | `true` for the hackathon. Set both to `false` for real users (hides the role switcher and on-screen OTP codes) |
| `KYC_REFERENCE_DATE` | Demo | `2026-07-15`, the "today" the specimen documents were dated against |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Real WhatsApp | See 5 below. Without them WhatsApp runs in the `/whatsapp` simulator only |

**1. MongoDB Atlas (instead of a local mongod).**
1. Create a free M0 cluster at cloud.mongodb.com.
2. Under **Database Access**, add a user with a password.
3. Under **Network Access**, allow your IP (or `0.0.0.0/0` for a hosted demo).
4. Click **Connect → Drivers**, copy the connection string, and add the database name before the `?`:
   `MONGO_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/udyam_digital?retryWrites=true&w=majority`

**2. JWT_SECRET and DATA_ENCRYPTION_KEY.** Run this twice and paste one result into each:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Keep `DATA_ENCRYPTION_KEY` safe and never change it on a live database: encrypted GSTINs and codes can only be read with the key they were written with.

**3. Cloudflare R2 (document storage).**
1. In the Cloudflare dashboard, open **R2 Object Storage**. Enable it if asked; the free tier includes 10 GB.
2. **Create bucket**, e.g. `udyam-kyc-docs`. Keep it **private**: do not enable public access or an r2.dev URL. Documents are only ever streamed through the API, to the owner and to KYC/ops staff, and every view is audited. → `R2_BUCKET=udyam-kyc-docs`
3. Your **Account ID** is shown on the R2 overview page (right-hand side). → `R2_ACCOUNT_ID`
4. **Manage R2 API Tokens → Create API token**. Choose permission **Object Read & Write**, limited to that bucket. Copy the **Access Key ID** and the **Secret Access Key**, which is shown once. → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
5. Restart the API. `GET /api/health` should then report `"storage": "r2"`. No CORS setup is needed, because the browser never talks to R2 directly.

**4. Claude advisor.**
1. Create a key at console.anthropic.com → **API Keys**. → `ANTHROPIC_API_KEY=sk-ant-...`
2. Leave `ADVISOR_AI=auto`. The advisor now understands free text in any of the 10 languages with Claude. If the API is unreachable it falls back to the built-in rules automatically, so the demo never breaks.

**5. WhatsApp Cloud API.**
1. At developers.facebook.com, create an app of type **Business** and add the **WhatsApp** product. Meta gives you a test number, and you can add up to 5 recipient numbers for testing.
2. Under **WhatsApp → API Setup**, copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`. Create a permanent token: a System User in Business Settings, with `whatsapp_business_messaging` permission → `WHATSAPP_TOKEN`.
3. Under **App settings → Basic**, copy the **App secret** → `WHATSAPP_APP_SECRET`. Incoming webhooks are then signature-checked.
4. Choose any random string → `WHATSAPP_VERIFY_TOKEN`. Under **WhatsApp → Configuration**, set the callback URL to `https://<your-domain>/api/whatsapp/webhook` with that verify token, and subscribe to **messages**. Meta needs a public HTTPS URL; locally, use a tunnel such as `cloudflared` or `ngrok`.
5. Restart the API. Replies and order updates now go to real WhatsApp, and the simulator shows "Connected to WhatsApp Cloud API". Messages to a customer outside a 24-hour chat window need Meta-approved templates; the in-chat flow works as built.

**Check the keys.** After filling them in, run this from `backend/` to test Claude, R2 and WhatsApp in one go (add a 10-digit number to also send a WhatsApp test message):

```bash
npm run check:live
```

## Deploying (one server)

1. Set `NODE_ENV=production`, the three security values, `MONGO_URI` (Atlas), the R2 values and `CLIENT_URL` in the host's environment. Set `DEMO_MODE=false` too: that also switches off the WhatsApp simulator, which lets anyone chat as any number.
2. Run `npm run install:all`, then `npm start`. This builds the React app, and Express serves it together with the API on `PORT`.
3. Put it behind HTTPS. Render, Railway or a VM with Caddy or Nginx all work, and cookies are `Secure` in production.

See `backend/notes.md` for the architecture and the API map, and `frontend/readme.md` for the frontend structure.
