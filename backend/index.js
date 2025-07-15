/**************************************************************************
 *  backend/index.js                               Node 18+  •  ES-modules
 *  ───────────────────────────────────────────────────────────────────────
 *  • Заведения  /  пользователи  /  бары-аутлеты
 *  • JWT-аутентификация    (30 дней)
 *  • Команда (инвайт, смена пароля)                     – как было
 *  • Ингредиенты  (CRUD, привязка к establishment_id)   – НОВОЕ
 **************************************************************************/

import express  from 'express';
import cors     from 'cors';
import pg       from 'pg';
import bcrypt   from 'bcrypt';
import jwt      from 'jsonwebtoken';
import preparationsRouter from './routes/preparations.js';
import ingredientsRouter from './routes/ingredientsRouter.js';
import teamRouter from './routes/teamRouter.js';





const app = express();
app.use(cors());
app.use(express.json());
app.use('/team', teamRouter);

/* ———————————————————————————  CONFIG  —————————————————————————— */
const JWT_SECRET = 'supersecretkey';         // вынести в .env на проде
const JWT_TTL    = '30d';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const db = {
  query: (text, params) => pool.query(text, params),
};

/* ——————————————————————  DB INIT  ——————————————————————— */
await db.query(`
CREATE TABLE IF NOT EXISTS establishments (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  phone            TEXT UNIQUE,
  password_hash    TEXT,
  name             TEXT,
  surname          TEXT,
  is_admin         BOOLEAN DEFAULT false,
  must_change_pw   BOOLEAN DEFAULT false
)`);
await db.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS surname TEXT
`);



await db.query(`
CREATE TABLE IF NOT EXISTS outlets (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  name             TEXT NOT NULL
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS ingredients (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  name             TEXT NOT NULL,
  package_volume   REAL,
  package_cost     REAL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS preparations (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  title            TEXT NOT NULL,
  yield_value      REAL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS team (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  phone            TEXT UNIQUE,
  password_hash    TEXT,
  name             TEXT,
  surname          TEXT,
  is_admin         BOOLEAN DEFAULT false,
  must_change_pw   BOOLEAN DEFAULT false,
  invite_token     TEXT
)
`);


try {
  await db.query(`
  CREATE TABLE IF NOT EXISTS preparation_ingredients (
    id              SERIAL PRIMARY KEY,
    preparation_id  INTEGER NOT NULL REFERENCES preparations(id),
    ingredient_id   INTEGER NOT NULL,
    is_preparation  BOOLEAN DEFAULT false,
    amount          REAL NOT NULL
  );

  
  `);
  
} catch (err) {
  
}


/* ———————————————————  HELPERS  ————————————————————— */
const normPhone = p => p.replace(/\D/g, '').replace(/^8/, '7');
const hashPw    = p => bcrypt.hash(p, 10);
const cmpPw     = (p, h) => bcrypt.compare(p, h);
const signJWT   = (u) => jwt.sign(u, JWT_SECRET, { expiresIn: JWT_TTL });

/* —————————————  auth-middleware  ————————————— */
function auth(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.sendStatus(401);
  const token = hdr.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.sendStatus(403);
    req.user = payload; // { id, establishment_id, is_admin }
    next();
  });
}

/* ╔══════════════════════ AUTH / TEAM ══════════════════════╗ */

/* 1. Регистрация заведения + первого админа-менеджера */
app.post('/auth/register-manager', async (req, res) => {
  try {
    const { establishmentName, name, surname, phone, password } = req.body;

    if (!establishmentName || !phone || password.length < 6)
      return res.status(400).json({ error: 'Неверные данные' });

    const p = normPhone(phone);

    // Проверка уникальности
    const userExists = await db.query('SELECT 1 FROM users WHERE phone = $1', [p]);
    if (userExists.rowCount > 0)
      return res.status(400).json({ error: 'Телефон уже зарегистрирован' });

    // 1. создаём заведение
    const estRes = await db.query(
      'INSERT INTO establishments (name) VALUES ($1) RETURNING id',
      [establishmentName]
    );
    const estId = estRes.rows[0].id;

    // 2. хешируем пароль
    const pwHash = await hashPw(password);

    // 3. создаём пользователя для входа (users)
    const userRes = await db.query(
      `INSERT INTO users
         (establishment_id, phone, password_hash, is_admin, name, surname)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [estId, p, pwHash, true, name, surname || '']
    );
    const uid = userRes.rows[0].id;

    // 4. вставляем этого пользователя в team
    await db.query(
      `INSERT INTO team
         (establishment_id, phone, password_hash, name, surname, is_admin)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [estId, p, pwHash, name, surname || '']
    );

    // 5. создаём дефолтный outlet
    await db.query(
      'INSERT INTO outlets (establishment_id, name) VALUES ($1, $2)',
      [estId, 'Main bar']
    );

    // 6. генерируем токен
    const token = signJWT({
      id: uid,
      establishment_id: estId,
      is_admin: true,
      name,
      surname: surname || '',
      establishment_name: establishmentName
    });

    res.json({ token, isAdmin: true });
  } catch (err) {
    console.error('Ошибка регистрации менеджера:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


/* 5. Логин */
app.post('/auth/login', async (req, res) => {
  const p = normPhone(req.body.phone);
  const result = await db.query('SELECT * FROM users WHERE phone = $1', [p]);
  const user = result.rows[0];

  if (!user) return res.status(400).json({ error: 'Не найдено' });
  if (user.must_change_pw) return res.status(403).json({ mustChange: true });

  const ok = await cmpPw(req.body.password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Пароль' });

  const estRes = await db.query('SELECT name FROM establishments WHERE id = $1', [user.establishment_id]);

  const token = signJWT({
    id: user.id,
    establishment_id: user.establishment_id,
    is_admin: user.is_admin,
    name: user.name,
    surname: user.surname || '',
    establishment_name: estRes.rows[0]?.name ?? ''
  });

  res.json({ token, isAdmin: !!user.is_admin });
});



/* 6. Профиль / Моя команда */
app.get('/auth/me', auth, async (req, res) => {
  const result = await db.query(
    `SELECT id, phone, name, surname, is_admin AS "isAdmin"
     FROM users
     WHERE id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

app.get('/team', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  // 1️⃣ Менеджеры из users
  const managersResult = await db.query(
    `SELECT id, name, phone
     FROM users
     WHERE establishment_id = $1 AND is_admin = true
     ORDER BY name`,
    [req.user.establishment_id]
  );

  const managers = managersResult.rows.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    isAdmin: true,
    mustChangePw: false,
    source: 'user'
  }));

  // 2️⃣ Сотрудники из team
  const teamResult = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin", must_change_pw AS "mustChangePw"
     FROM team
     WHERE establishment_id = $1
     ORDER BY name`,
    [req.user.establishment_id]
  );

  const team = teamResult.rows.map(t => ({
    ...t,
    source: 'team'
  }));

  // 3️⃣ Объединённый список
  const combined = [...managers, ...team];

  // 4️⃣ Вернуть менеджеров сверху
  combined.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));

  res.json(combined);
});






/* ╔═══════════════════════ INGREDIENTS ═════════════════════╗ */
app.use('/ingredients', ingredientsRouter);




/* ╔═══════════════════════ PREPARATIONS ════════════════════╗ */
app.use('/preparations', preparationsRouter);



/* ———————————————————  SERVER START  —————————————————— */
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✔  API  http://localhost:${PORT}`);
});

export { db, JWT_SECRET, JWT_TTL };

