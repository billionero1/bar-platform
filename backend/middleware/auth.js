// backend/middleware/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query as dbQuery } from '../db.js';

const {
  JWT_SECRET = 'dev_secret_change_me',
  JWT_TTL = '30d',
} = process.env;

/* ---------- guard: проверка JWT (default export) ---------- */
function auth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'no_token' });

    const payload = jwt.verify(token, JWT_SECRET);
    // payload: { id, phone?, role?, is_admin, name?, surname?, establishment_id, establishment_name? }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

/* ---------- helpers ---------- */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}
function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

/* ---------- /auth роуты ---------- */
const authRouter = express.Router();

/**
 * POST /auth/register-manager
 * body: { phone | email, password, name?, surname?, establishmentName? }
 * Создаёт ПЕРВОГО администратора и заведение.
 */
authRouter.post('/register-manager', async (req, res) => {
  try {
    let { phone, email, password, name, surname, establishmentName } = req.body || {};
    if (!phone && email) phone = String(email);
    if (!phone || !password) return res.status(400).json({ error: 'phone_and_password_required' });

    // запрет второго менеджера
    const exAdmin = await dbQuery(`SELECT id FROM users WHERE is_admin = true LIMIT 1`);
    if (exAdmin.rows.length > 0) return res.status(409).json({ error: 'manager_already_exists' });

    // уникальность телефона
    const exPhone = await dbQuery(`SELECT 1 FROM users WHERE phone = $1 LIMIT 1`, [phone]);
    if (exPhone.rowCount > 0) return res.status(409).json({ error: 'phone_already_registered' });

    // создаём заведение
    const estName = (establishmentName || 'My Establishment').trim();
    const estIns = await dbQuery(
      `INSERT INTO establishments (name) VALUES ($1) RETURNING id, name`,
      [estName]
    );
    const establishment_id = estIns.rows[0].id;
    const establishment_name = estIns.rows[0].name;

    // создаём пользователя-админа
    const password_hash = await bcrypt.hash(password, 10);
    const userIns = await dbQuery(
      `INSERT INTO users (establishment_id, phone, password_hash, name, surname, is_admin, must_change_pw)
       VALUES ($1, $2, $3, $4, $5, true, false)
       RETURNING id, establishment_id, phone, name, surname, is_admin, must_change_pw`,
      [establishment_id, phone, password_hash, name || null, surname || null]
    );
    const user = userIns.rows[0];

    // токен: всё нужное фронту
    const token = signToken({
      id: user.id,
      phone: user.phone,
      role: user.is_admin ? 'manager' : 'user',
      is_admin: user.is_admin,
      name: user.name,
      surname: user.surname,
      establishment_id,
      establishment_name,
    });

    return res.status(201).json({ user: sanitizeUser(user), token });
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'duplicate_key', detail: err.detail });
    console.error('register-manager error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /auth/login
 * body: { phone | email, password }
 */
authRouter.post('/login', async (req, res) => {
  try {
    let { phone, email, password } = req.body || {};
    if (!phone && email) phone = String(email);
    if (!phone || !password) return res.status(400).json({ error: 'phone_and_password_required' });

    const q = await dbQuery(
      `SELECT id, establishment_id, phone, password_hash, name, surname, is_admin, must_change_pw
         FROM users
        WHERE phone = $1 LIMIT 1`,
      [phone]
    );
    if (q.rows.length === 0) return res.status(401).json({ error: 'invalid_credentials' });

    const u = q.rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const e = await dbQuery(`SELECT name FROM establishments WHERE id = $1`, [u.establishment_id]);
    const establishment_name = e.rows[0]?.name || null;

    const token = signToken({
      id: u.id,
      phone: u.phone,
      role: u.is_admin ? 'manager' : 'user',
      is_admin: u.is_admin,
      name: u.name,
      surname: u.surname,
      establishment_id: u.establishment_id,
      establishment_name,
    });

    return res.json({ user: sanitizeUser(u), token });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /auth/me  (Authorization: Bearer <token>)
 */
authRouter.get('/me', auth, async (req, res) => {
  try {
    const { id, establishment_id } = req.user;
    const uQ = await dbQuery(
      `SELECT id, establishment_id, phone, name, surname, is_admin, must_change_pw
         FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (uQ.rows.length === 0) return res.status(404).json({ error: 'user_not_found' });

    const eQ = await dbQuery(`SELECT name FROM establishments WHERE id = $1`, [establishment_id]);
    return res.json({
      user: uQ.rows[0],
      establishment: { id: establishment_id, name: eQ.rows[0]?.name || null },
    });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { authRouter };
export default auth;
