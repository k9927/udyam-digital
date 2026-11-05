import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, backendRoot } from './libs/config.js';
import { attachUser } from './middlewares/auth.js';
import { errorHandler, notFound } from './middlewares/error.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: config.clientUrl.split(',').map(origin => origin.trim()), credentials: true }));
  // The WhatsApp webhook signature is computed over the exact bytes Meta sent.
  app.use(express.json({ limit: '200kb', verify: (req, res, buffer) => { if (req.originalUrl.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer; } }));
  app.use(cookieParser());
  // CSRF defence alongside SameSite=Lax cookies: a state-changing request that names an origin must come from
  // this site or an allowed client. Requests with no Origin (server-to-server, such as Meta's webhook) carry no
  // browser cookies to abuse, so they pass to their own checks.
  const allowedOrigins = new Set(config.clientUrl.split(',').map(origin => origin.trim()));
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!origin || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || allowedOrigins.has(origin)) return next();
    try { if (new URL(origin).host === req.get('host')) return next(); } catch { /* malformed origin */ }
    return res.status(403).json({ error: 'Request blocked: it did not come from this site.' });
  });
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', attachUser, routes);
  app.use('/api', notFound);

  // In production the built React app is served by the same Express process.
  const dist = path.resolve(backendRoot, '..', 'frontend', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    // Hashed build files never change, so browsers may keep them; a missing one is a real 404, not the app shell.
    app.use(express.static(dist, { index: false, setHeaders: (res, file) => res.set('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache') }));
    app.get(/^(?!\/api|\/assets\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
