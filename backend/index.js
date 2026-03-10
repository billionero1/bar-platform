import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';

import { closeDatabasePool, initializeDatabase } from './db.js';
import { requireAuth } from './middleware/requireAuth.js';

import v1Analytics from './routes/v1/analytics.js';
import v1Auth from './routes/v1/auth.js';
import v1Cocktails from './routes/v1/cocktails.js';
import v1Docs from './routes/v1/docs.js';
import v1Forms from './routes/v1/forms.js';
import v1Ingredients from './routes/v1/ingredients.js';
import v1Preparations from './routes/v1/preparations.js';
import v1Team from './routes/v1/team.js';
import v1Training from './routes/v1/training.js';
import { assertRuntimeEnvSafe } from './utils/envPolicy.js';

const app = express();
app.set('etag', false);
app.set('trust proxy', 1);

const FORCE_HTTPS = ['1', 'true'].includes(String(process.env.FORCE_HTTPS || '').toLowerCase());

app.use((req, res, next) => {
  if (!FORCE_HTTPS) return next();
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (req.secure || forwardedProto === 'https') return next();
  if (req.hostname === '127.0.0.1' || req.hostname === 'localhost') return next();
  return res.redirect(`https://${req.headers.host}${req.originalUrl}`);
});

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\/+$/, ''));
}

function buildCorsAllowSet() {
  const configured = parseOrigins(process.env.FRONTEND_ORIGIN);
  const prod = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

  if (prod) {
    if (!configured.length) {
      throw new Error('FRONTEND_ORIGIN is required in production');
    }
    return new Set(configured);
  }

  const devDefaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  return new Set([...devDefaults, ...configured]);
}

const corsAllowSet = buildCorsAllowSet();
const devLanRegex = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):5173$/i;
const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const normalized = String(origin).replace(/\/+$/, '');
      if (corsAllowSet.has(normalized)) return cb(null, true);
      if (!isProd && devLanRegex.test(normalized)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use('/v1/auth', v1Auth);

app.use('/v1/ingredients', requireAuth, v1Ingredients);
app.use('/v1/preparations', requireAuth, v1Preparations);
app.use('/v1/cocktails', requireAuth, v1Cocktails);
app.use('/v1/forms', requireAuth, v1Forms);
app.use('/v1/team', requireAuth, v1Team);
app.use('/v1/docs', requireAuth, v1Docs);
app.use('/v1/analytics', requireAuth, v1Analytics);
app.use('/v1/training', requireAuth, v1Training);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.use((err, _req, res, _next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ error: 'internal_error' });
});

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

let server = null;

async function start() {
  const envReport = assertRuntimeEnvSafe(process.env);
  if (envReport.warnings.length) {
    for (const warning of envReport.warnings) {
      console.warn(`[ENV] ${warning}`);
    }
  }

  await initializeDatabase();
  server = app.listen(PORT, HOST, () => {
    console.log(`backend http://${HOST}:${PORT}`);
  });
}

async function gracefulShutdown(signal) {
  console.log(`[APP] received ${signal}, shutting down...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDatabasePool();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

start().catch((error) => {
  console.error('[APP] failed to start', error);
  process.exit(1);
});

export default app;
