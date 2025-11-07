// backend/routes/v1/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { query as db } from '../../db.js';

const router = express.Router();
router.use(cookieParser());

// === config ===
const ACCESS_TTL = process.env.ACCESS_TTL || '15m';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 30);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_NAME = 'refresh_token';
const isProd = process.env.NODE_ENV === 'production';

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TTL });
}
function cookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,                // только https в проде
    sameSite: isProd ? 'strict' : 'lax',
    path: '/v1/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function loadPrimaryMembershipByPhone(phone) {
  const q = await db(
    `SELECT u.id as user_id, u.phone, u.name, u.surname, u.is_admin, u.pin_hash,
            m.establishment_id, m.role,
            e.name as establishment_name
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN establishments e ON e.id = m.establishment_id
      WHERE u.phone = $1
      ORDER BY m.id ASC
      LIMIT 1`,
    [phone]
  );
  return q.rows[0] || null;
}

async function loadSessionWithProfileByHash(hash) {
  // сессия + профиль + membership (проверка, что membership реально существует)
  const q = await db(
    `SELECT s.id as session_id, s.user_id, s.establishment_id, s.revoked_at,
            u.phone, u.name, u.surname, u.pin_hash,
            m.role, e.name as establishment_name
       FROM sessions s
       JOIN users u  ON u.id = s.user_id
       JOIN memberships m ON m.user_id = s.user_id AND m.establishment_id = s.establishment_id
       JOIN establishments e ON e.id = s.establishment_id
      WHERE s.refresh_hash = $1
      LIMIT 1`,
    [hash]
  );
  return q.rows[0] || null;
}

async function membershipStillActive(userId, estId) {
  // Если позже добавишь revoked_at в memberships — можно сузить WHERE.
  const q = await db(
    `SELECT 1 FROM memberships WHERE user_id=$1 AND establishment_id=$2 LIMIT 1`,
    [userId, estId]
  );
  return q.rowCount > 0;
}

function rotateRefreshCookie(res, userId, estId, ua, ip) {
  const nextPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
  const nextHash  = sha256(nextPlain);
  // записываем новую сессию
  return db(
    `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING refresh_hash`,
    [userId, estId, nextHash, ua || null, ip || null]
  ).then(() => {
    res.cookie(COOKIE_NAME, nextPlain, cookieOpts());
    return nextPlain;
  });
}

async function payloadFrom(userId, phone, name, role, estId, estName) {
  return {
    sub: userId, phone, name, role,
    establishment_id: estId,
    establishment_name: estName,
  };
}

// === 0) Регистрация менеджера ===
router.post('/register-manager', async (req, res) => {
  try {
    const { phone, name, surname, establishmentName, password, pin } = req.body || {};
    if (!phone || !establishmentName || !password) {
      return res.status(400).json({ error: 'phone_establishment_password_required' });
    }
    const exists = await db(`SELECT 1 FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exists.rowCount) return res.status(409).json({ error: 'phone_already_registered' });

    const passHash = await bcrypt.hash(password, 10);
    const pinHash  = pin ? await bcrypt.hash(String(pin).padStart(4, '0'), 10) : null;

    await db('BEGIN');
    const est = await db(
      `INSERT INTO establishments(name) VALUES ($1) RETURNING id,name`,
      [establishmentName]
    );
    const estId = est.rows[0].id;

    const u = await db(
      `INSERT INTO users(phone,name,surname,is_admin,password_hash,pin_hash)
       VALUES ($1,$2,$3,true,$4,$5)
       RETURNING id, phone, name, surname, is_admin`,
      [phone, name || null, surname || null, passHash, pinHash]
    );
    const userId = u.rows[0].id;

    await db(
      `INSERT INTO memberships(user_id,establishment_id,role) VALUES ($1,$2,'manager')`,
      [userId, estId]
    );
    await db('COMMIT');

    return res.status(201).json({ ok: true, next: 'login-password' });
  } catch (e) {
    await db('ROLLBACK').catch(() => {});
    console.error('register-manager error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 1) Логин телефоном+паролем (выдаёт access + ставит refresh-куку). Опционально принимает pin для первичной установки. ===
router.post('/login-password', async (req, res) => {
  try {
    const { phone, password, pin } = req.body || {};
    if (!phone || !password) return res.status(400).json({ error: 'phone_and_password_required' });

    const uq = await db(`SELECT * FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (!uq.rowCount) return res.status(401).json({ error: 'invalid_credentials' });
    const user = uq.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    // главное членство
    const m = await db(
      `SELECT m.*, e.name AS establishment_name
         FROM memberships m
         JOIN establishments e ON e.id = m.establishment_id
        WHERE m.user_id=$1
        ORDER BY m.id ASC
        LIMIT 1`,
      [user.id]
    );
    if (!m.rowCount) return res.status(403).json({ error: 'no_membership' });
    const mem = m.rows[0];

    // при желании задать/обновить PIN
    if (pin) {
      const pinHash = await bcrypt.hash(String(pin).padStart(4, '0'), 10);
      await db(`UPDATE users SET pin_hash=$1 WHERE id=$2`, [pinHash, user.id]);
    }

    const payload = await payloadFrom(
      user.id, user.phone, user.name, mem.role, mem.establishment_id, mem.establishment_name
    );
    const access = signAccess(payload);

    const refreshPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const refreshHash  = sha256(refreshPlain);
    await db(
      `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip)
       VALUES ($1,$2,$3,$4,$5)`,
      [user.id, mem.establishment_id, refreshHash, req.headers['user-agent'] || null, req.ip || null]
    );

    res.cookie(COOKIE_NAME, refreshPlain, cookieOpts());
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('login-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 2) Установка/смена PIN под валидным access ===
router.post('/set-pin', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'no_token' });

    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'bad_token' }); }

    const { pin } = req.body || {};
    if (!pin || String(pin).length < 4) return res.status(400).json({ error: 'pin_required' });

    const pinHash = await bcrypt.hash(String(pin).padStart(4, '0'), 10);
    await db(`UPDATE users SET pin_hash=$1 WHERE id=$2`, [pinHash, decoded.sub]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('set-pin error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 3) UNLOCK: вход по PIN + refresh-кука (без пароля) ===
router.post('/unlock', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'pin_required' });

    const refreshRaw = req.cookies?.[COOKIE_NAME];
    if (!refreshRaw) return res.status(401).json({ error: 'no_refresh' });

    const rhash = sha256(refreshRaw);
    const s = await loadSessionWithProfileByHash(rhash);
    if (!s) return res.status(401).json({ error: 'invalid_refresh' });
    if (s.revoked_at) return res.status(401).json({ error: 'refresh_revoked' });

    // membership всё ещё существует?
    const active = await membershipStillActive(s.user_id, s.establishment_id);
    if (!active) {
      // на всякий случай сразу отзываем и чистим куку
      await db(`UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, [s.session_id]);
      res.clearCookie(COOKIE_NAME, cookieOpts());
      return res.status(401).json({ error: 'membership_revoked' });
    }

    if (!s.pin_hash) return res.status(409).json({ error: 'pin_not_set' });

    const ok = await bcrypt.compare(String(pin).padStart(4, '0'), s.pin_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_pin' });

    // rotate refresh: старую сессию сразу отзовём
    await db(`UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, [s.session_id]);
    await rotateRefreshCookie(res, s.user_id, s.establishment_id, req.headers['user-agent'], req.ip);

    const payload = await payloadFrom(
      s.user_id, s.phone, s.name, s.role, s.establishment_id, s.establishment_name
    );
    const access = signAccess(payload);

    return res.json({ access, user: payload });
  } catch (e) {
    console.error('unlock error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === 4) refresh: новый access + ротация refresh (и проверка membership) ===
router.post('/refresh', async (req, res) => {
  try {
    const refreshRaw = req.cookies?.[COOKIE_NAME];
    if (!refreshRaw) return res.status(401).json({ error: 'no_refresh' });

    const rhash = sha256(refreshRaw);
    const s = await loadSessionWithProfileByHash(rhash);
    if (!s) return res.status(401).json({ error: 'invalid_refresh' });
    if (s.revoked_at) return res.status(401).json({ error: 'refresh_revoked' });

    const active = await membershipStillActive(s.user_id, s.establishment_id);
    if (!active) {
      await db(`UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, [s.session_id]);
      res.clearCookie(COOKIE_NAME, cookieOpts());
      return res.status(401).json({ error: 'membership_revoked' });
    }

    // rotate refresh
    await db(`UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, [s.session_id]);
    await rotateRefreshCookie(res, s.user_id, s.establishment_id, req.headers['user-agent'], req.ip);

    const payload = await payloadFrom(
      s.user_id, s.phone, s.name, s.role, s.establishment_id, s.establishment_name
    );
    const access = signAccess(payload);
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
