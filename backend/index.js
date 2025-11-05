import 'dotenv/config';
import express  from 'express';
import cors     from 'cors';
import { query as dbQuery } from './db.js';

import preparationsRouter from './routes/preparations.js';
import ingredientsRouter  from './routes/ingredientsRouter.js';
import teamRouter         from './routes/teamRouter.js';

const app = express();

// доверяем nginx и (опц.) форсим https
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

app.use(cors());
app.use(express.json());

// единый адаптер
export const db = { query: (t, p) => dbQuery(t, p) };

async function initSchema() {
  await db.query(`CREATE TABLE IF NOT EXISTS establishments (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    phone TEXT UNIQUE,
    password_hash TEXT,
    name TEXT,
    surname TEXT,
    is_admin BOOLEAN DEFAULT false,
    must_change_pw BOOLEAN DEFAULT false
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS outlets (
    id SERIAL PRIMARY KEY,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    name TEXT NOT NULL
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS ingredients (
    id SERIAL PRIMARY KEY,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    name TEXT NOT NULL,
    package_volume REAL,
    package_cost REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS preparations (
    id SERIAL PRIMARY KEY,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    title TEXT NOT NULL,
    yield_value REAL,
    alt_volume TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS team (
    id SERIAL PRIMARY KEY,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    phone TEXT UNIQUE,
    password_hash TEXT,
    name TEXT,
    surname TEXT,
    is_admin BOOLEAN DEFAULT false,
    must_change_pw BOOLEAN DEFAULT false,
    invite_token TEXT
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS preparation_ingredients (
    id SERIAL PRIMARY KEY,
    preparation_id INTEGER NOT NULL REFERENCES preparations(id),
    ingredient_id INTEGER NOT NULL,
    is_preparation BOOLEAN DEFAULT false,
    amount REAL NOT NULL
  )`);
}

app.use('/team',         teamRouter);
app.use('/ingredients',  ingredientsRouter);
app.use('/preparations', preparationsRouter);

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

async function boot() {
  await initSchema();
  const PORT = Number(process.env.PORT || 3001);
  app.listen(PORT, '127.0.0.1', () =>
    console.log(`backend http://127.0.0.1:${PORT}`)
  );
}
boot().catch((e) => { console.error('BOOT ERROR', e); process.exit(1); });

export default app;