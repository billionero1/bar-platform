// backend/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// v1 роуты (ты их уже положил в backend/routes/v1/*)
import v1Auth         from './routes/v1/auth.js';
import v1Ingredients  from './routes/v1/ingredients.js';
import v1Preparations from './routes/v1/preparations.js';

const app = express();

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

  /* базовые мидлвары */
  const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  app.use(cors({
    origin: ORIGIN,
    credentials: true, // чтобы refresh-куки работали корректно
  }));
  app.use(express.json());


/* v1 API */
app.use('/v1/auth',         v1Auth);
app.use('/v1/ingredients',  v1Ingredients);
app.use('/v1/preparations', v1Preparations);

/* healthcheck */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

/* финальный обработчик ошибок */
app.use((err, _req, res, _next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ error: 'internal_error' });
});

/* bootstrap */
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`backend http://127.0.0.1:${PORT}`);
});

export default app;
