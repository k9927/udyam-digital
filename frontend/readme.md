# Frontend

React 19 + Vite + Tailwind, with react-router 7, axios, recharts and lucide icons. In development, `vite.config.js` proxies `/api` to `http://localhost:5000`. In production, Express serves `dist/`, so the app and the API share one origin and the auth cookie just works.

```
src/
├── api/client.js        axios instance (cookies on), quote-token header, error messages
├── context/AuthContext  current user, sign-in/out, home page per role
├── i18n/                en.js (source strings) + locales/{hi,mr,ta,te,kn,gu,bn,ml,pa}.js; missing keys fall back to English
├── lib/                 formatting, on-device OCR (tesseract.js, assets in public/ocr), KYC text parsing, advisor questions in 10 languages
├── components/          ui kit, layouts (public, customer, staff), role switcher, timeline, charts, popular bundles
└── pages/
    ├── public/          Landing, Advisor, Quote, Login, StaffLogin, Track, Privacy, NotFound
    ├── customer/        Dashboard, Kyc, OrderDetail, Services, Bills, Help, Messages, MyData
    ├── partner/         PartnerQueue, PartnerCase, PartnerLeads, PartnerActivations
    ├── field/           FieldJobs, FieldJob (delivery and technician)
    ├── review/          ReviewQueue, ReviewDetail (KYC officer)
    └── ops/             Dashboard, Insights, Orders, OrderDetail, Packing, Cases, Tickets, Users, Catalogue, Audit
```

**Scripts:** `npm run dev` · `npm run build` · `npm run preview` · `npm run lint`. The `predev` and `prebuild` scripts copy the OCR worker and language data into `public/ocr`, so document reading works offline.

**Adding a string:** add the key to `i18n/en.js`, use `t('key')` in a page, then add the translation to each file in `i18n/locales/`.
