// backend/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import v1Auth         from './routes/v1/auth.js';
import v1Ingredients  from './routes/v1/ingredients.js';
import v1Preparations from './routes/v1/preparations.js';
import { requireAuth } from './middleware/requireAuth.js';


const app = express();
app.set('etag', false);


/* доверяем nginx и (опц.) форсим https */
app.set('trust proxy', 1);
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || '0').toLowerCase() === '1'
                 || String(process.env.FORCE_HTTPS || '').toLowerCase() === 'true';
app.use((req, res, next) => {
  if (!FORCE_HTTPS) return next();
  const xf = req.headers['x-forwarded-proto'];
  if (req.secure || xf === 'https') return next();
  if (req.hostname === '127.0.0.1' || req.hostname === 'localhost') return next();
  return res.redirect('https://' + req.headers.host + req.originalUrl);
});

/* CORS */
const ORIGIN_ENV = process.env.FRONTEND_ORIGIN || ''; // напр., https://app.example.com

// Разрешённые origins по регуляркам:
// - localhost / 127.0.0.1:5173 (dev на этом компе)
// - 192.168.x.x:5173 и 10.x.x.x:5173 (локальная сеть — телефон и др. устройства)
// - явный FRONTEND_ORIGIN (для будущего VPS)
const corsAllowRegexps = [
  /^http:\/\/localhost:5173$/i,
  /^http:\/\/127\.0\.0\.1:5173$/i,
  /^http:\/\/192\.168\.\d+\.\d+:5173$/i,
  /^http:\/\/10\.\d+\.\d+\.\d+:5173$/i,
];

if (ORIGIN_ENV) {
  const esc = ORIGIN_ENV.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  corsAllowRegexps.push(new RegExp('^' + esc + '$', 'i'));
}

app.use(cors({
  origin(origin, cb) {
    // без Origin (Postman, curl) — разрешаем
    if (!origin) return cb(null, true);

    if (corsAllowRegexps.some((rx) => rx.test(origin))) {
      return cb(null, true);
    }

    return cb(new Error(`CORS blocked for origin ${origin}`));
  },
  credentials: true,
}));


// Парсим куки для всех последующих мидлварей и роутов (включая requireAuth)
app.use(cookieParser());

// Разбор JSON-тел
app.use(express.json());


/* v1 API */
app.use('/v1/auth', v1Auth);

// Всё, что ниже — приватные маршруты, защищённые requireAuth
app.use('/v1/ingredients',  requireAuth, v1Ingredients);
app.use('/v1/preparations', requireAuth, v1Preparations);


/* healthcheck */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

/* финальный обработчик ошибок */
app.use((err, _req, res, _next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ error: 'internal_error' });
});

/* bootstrap */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`backend http://${HOST}:${PORT}`);
});


export default app;
