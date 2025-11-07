// backend/routes/v1/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { query as db } from '../../db.js';

const router = express.Router();
router.use(cookieParser());

// === конфиг ===
const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 30);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const isProd = (process.env.NODE_ENV === 'production');
const COOKIE_NAME = 'refresh_token';

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,                       // в проде — только https
    sameSite: isProd ? 'strict' : 'lax',  // локалка — lax, прод — strict
    path: '/v1/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function genPin() {
  const n = crypto.randomInt(0, 10000);   // 0000..9999
  return n.toString().padStart(4, '0');
}

// профиль пользователя + главное членство
async function loadProfileByPhone(phone) {
  const q = await db(`
    SELECT u.id as user_id, u.phone, u.name, u.surname, u.is_admin,
           m.establishment_id, m.role,
           e.name as establishment_name
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN establishments e ON e.id = m.establishment_id
    WHERE u.phone = $1
    ORDER BY m.id ASC
    LIMIT 1
  `, [phone]);
  return q.rows[0] || null;
}

// === 1) Регистрация менеджера: создаёт заведение + пользователя + membership ===
router.post('/register-manager', async (req, res) => {
  try {
    const { phone, name, surname, establishmentName } = req.body || {};
    if (!phone || !establishmentName) {
      return res.status(400).json({ error: 'phone_and_establishment_required' });
    }

    // если номер уже есть — не даём регаться повторно
    const taken = await db(`SELECT 1 FROM users WHERE phone = $1 LIMIT 1`, [phone]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'phone_already_registered' });
    }

    await db('BEGIN');

    const est = await db(
      `INSERT INTO establishments(name) VALUES ($1) RETURNING id, name`,
      [establishmentName.trim()]
    );
    const estId = est.rows[0].id;

    const usr = await db(
      `INSERT INTO users(phone, name, surname, is_admin)
       VALUES ($1,$2,$3,true)
       RETURNING id, phone, name, surname, is_admin`,
      [phone, name || null, surname || null]
    );
    const userId = usr.rows[0].id;

    await db(
      `INSERT INTO memberships(user_id, establishment_id, role)
       VALUES ($1,$2,'manager')`,
      [userId, estId]
    );

    await db('COMMIT');

    // дальше фронт шлёт /request-pin и /login-pin
    return res.status(201).json({ ok: true, next: 'request-pin', phone });
  } catch (e) {
    await db('ROLLBACK').catch(() => {});
    console.error('register-manager error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 2) Запрос PIN (4 цифры) ===
router.post('/request-pin', async (req, res) => {
  try {
    const { phone, purpose } = req.body || {};
    const purp = (purpose === 'invite') ? 'invite' : 'login';
    if (!phone) return res.status(400).json({ error: 'phone_required' });

    // анти-спам: не чаще 1 раза в 60 сек
    const recent = await db(
      `SELECT 1 FROM passcodes WHERE phone=$1 AND purpose=$2
       AND created_at > now() - interval '60 seconds' LIMIT 1`,
      [phone, purp]
    );
    if (recent.rows.length > 0) {
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const code = genPin();
    const ttlMin = (purp === 'login') ? 10 : 30;

    await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,$3,3, now() + ($4 || ' minutes')::interval)`,
      [phone, code, purp, String(ttlMin)]
    );

    if (!isProd) {
      console.log(`[PIN] ${phone} -> ${code} (${purp})`);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('request-pin error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 3) Вход по PIN ===
router.post('/login-pin', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: 'phone_and_code_required' });

    const pc = await db(
      `SELECT id, code, attempts_left
       FROM passcodes
       WHERE phone=$1 AND purpose='login' AND expires_at > now()
       ORDER BY id DESC
       LIMIT 1`,
      [phone]
    );
    if (pc.rows.length === 0) {
      return res.status(401).json({ error: 'code_expired_or_not_found' });
    }

    const row = pc.rows[0];
    if (row.code !== code) {
      await db(
        `UPDATE passcodes SET attempts_left = attempts_left - 1 WHERE id=$1 AND attempts_left > 0`,
        [row.id]
      );
      return res.status(401).json({ error: 'invalid_code' });
    }

    // успешный логин — удаляем использованный код
    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);

    const profile = await loadProfileByPhone(phone);
    if (!profile) return res.status(404).json({ error: 'user_not_found' });

    const payload = {
      sub: profile.user_id,
      phone: profile.phone,
      name: profile.name,
      role: profile.role,
      establishment_id: profile.establishment_id,
      establishment_name: profile.establishment_name,
    };
    const access = signAccess(payload);

    // создаём refresh-сессию и кладём httpOnly-куку
    const refreshPlain = crypto.randomBytes(32).toString('base64url');
    const refreshHash = sha256(refreshPlain);
    await db(
      `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip)
       VALUES ($1,$2,$3,$4,$5)`,
      [profile.user_id, profile.establishment_id, refreshHash, req.headers['user-agent'] || null, req.ip || null]
    );

    res.cookie(COOKIE_NAME, refreshPlain, cookieOpts());
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('login-pin error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 4) refresh по httpOnly-куке ===
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no_refresh' });

    const h = sha256(token);
    const q = await db(
      `SELECT s.id, s.user_id, s.establishment_id, s.revoked_at,
              u.phone, u.name, u.surname, u.is_admin,
              m.role, e.name as establishment_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.user_id = u.id AND m.establishment_id = s.establishment_id
       JOIN establishments e ON e.id = s.establishment_id
       WHERE s.refresh_hash = $1 AND s.revoked_at IS NULL
       LIMIT 1`,
      [h]
    );
    if (q.rows.length === 0) return res.status(401).json({ error: 'invalid_refresh' });

    const row = q.rows[0];

    // ротация refresh
    await db(`UPDATE sessions SET revoked_at = now() WHERE id=$1`, [row.id]);

    const payload = {
      sub: row.user_id,
      phone: row.phone,
      name: row.name,
      role: row.role,
      establishment_id: row.establishment_id,
      establishment_name: row.establishment_name,
    };
    const access = signAccess(payload);

    const nextPlain = crypto.randomBytes(32).toString('base64url');
    const nextHash = sha256(nextPlain);
    await db(
      `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip)
       VALUES ($1,$2,$3,$4,$5)`,
      [row.user_id, row.establishment_id, nextHash, req.headers['user-agent'] || null, req.ip || null]
    );
    res.cookie(COOKIE_NAME, nextPlain, cookieOpts());
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('refresh error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 5) logout: отозвать текущий refresh ===
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const h = sha256(token);
      await db(`UPDATE sessions SET revoked_at = now() WHERE refresh_hash=$1 AND revoked_at IS NULL`, [h]);
    }
    res.clearCookie(COOKIE_NAME, cookieOpts());
    return res.json({ ok: true });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
