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
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/v1/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
function nowPlusDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function genPin4() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

async function ensureActiveMembership(userId, estId) {
  // если есть колонка revoked_at — учитываем, иначе просто наличие membership
  const q = await db(
    `SELECT 1 FROM memberships
      WHERE user_id=$1 AND establishment_id=$2
        AND (revoked_at IS NULL OR NOT EXISTS(
              SELECT 1 FROM information_schema.columns
              WHERE table_name='memberships' AND column_name='revoked_at'
            ))
      LIMIT 1`,
    [userId, estId]
  );
  return q.rowCount > 0;
}

async function loadPrimaryMembership(userId) {
  const q = await db(
    `SELECT m.establishment_id, m.role, e.name AS establishment_name
       FROM memberships m
       LEFT JOIN establishments e ON e.id = m.establishment_id
      WHERE m.user_id=$1
      ORDER BY m.id ASC
      LIMIT 1`,
    [userId]
  );

  // если у пользователя нет привязки к заведению — он solo
  if (!q.rows.length) {
    return {
      establishment_id: null,
      establishment_name: null,
      role: 'solo',
    };
  }

  return q.rows[0];
}


// === 0.5) Быстрая проверка refresh (+ телефон, если есть) ===
router.get('/has-refresh', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.json({ has: false, phone: null });
    const h = sha256(token);
    const q = await db(
      `SELECT s.id, s.user_id, u.phone
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.refresh_hash=$1 AND s.revoked_at IS NULL
        LIMIT 1`,
      [h]
    );
    if (!q.rows.length) return res.json({ has: false, phone: null });
    return res.json({ has: true, phone: q.rows[0].phone });
  } catch {
    return res.json({ has: false, phone: null });
  }
});

// === phone verification (регистрация — эмуляция) ===
router.post('/request-verify', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone_required' });

    const recent = await db(
      `SELECT 1 FROM passcodes
        WHERE phone=$1 AND purpose='verify'
          AND created_at > now() - interval '60 seconds'
        LIMIT 1`,
      [phone]
    );
    if (recent.rows.length) return res.status(429).json({ error: 'too_many_requests' });

    const code = genPin4();
    await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,'verify',3, now() + interval '15 minutes')`,
      [phone, code]
    );

    if (!isProd) console.log(`[VERIFY] ${phone} -> ${code}`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('request-verify error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body || {};
    if (!phone || !code) return res.status(400).json({ error: 'phone_and_code_required' });

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1 AND purpose='verify' AND expires_at > now()
        ORDER BY id DESC
        LIMIT 1`,
      [phone]
    );
    if (!q.rows.length) return res.status(401).json({ error: 'code_expired_or_not_found' });

    const row = q.rows[0];
    if (row.code !== code) {
      await db(`UPDATE passcodes SET attempts_left = attempts_left - 1 WHERE id=$1 AND attempts_left > 0`, [row.id]);
      return res.status(401).json({ error: 'invalid_code' });
    }

    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('verify-code error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * === Регистрация ПОЛЬЗОВАТЕЛЯ (без заведения) ===
 * body: { phone, password, pin? }
 * создаёт users (без memberships). Позже пользователь сам создаст/присоединится к заведению.
 */
router.post('/register-user', async (req, res) => {
  try {
    const { phone, password, pin } = req.body || {};
    if (!phone || !password) {
      return res.status(400).json({ error: 'phone_and_password_required' });
    }
    const exists = await db(`SELECT 1 FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exists.rowCount) return res.status(409).json({ error: 'phone_already_registered' });

    const passHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(String(pin).padStart(4, '0'), 10) : null;

    const u = await db(
      `INSERT INTO users(phone, password_hash, pin_hash)
       VALUES ($1,$2,$3)
       RETURNING id, phone, name`,
      [phone, passHash, pinHash]
    );

    return res.status(201).json({ ok: true, user_id: u.rows[0].id });
  } catch (e) {
    console.error('register-user error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * === Регистрация менеджера (как было) — оставляем для сценария "создать заведение" ===
 * body: { phone, name?, surname?, establishmentName, password, pin? }
 */
router.post('/register-manager', async (req, res) => {
  try {
    const { phone, name, surname, establishmentName, password, pin } = req.body || {};
    if (!phone || !establishmentName || !password) {
      return res.status(400).json({ error: 'phone_establishment_password_required' });
    }
    const exists = await db(`SELECT 1 FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exists.rowCount) return res.status(409).json({ error: 'phone_already_registered' });

    const passHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(String(pin).padStart(4, '0'), 10) : null;

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

// === Логин телефоном+паролем (выдаёт refresh+access). membership — опционален ===
router.post('/login-password', async (req, res) => {
  try {
    const { phone, password, pin } = req.body || {};
    if (!phone || !password) return res.status(400).json({ error: 'phone_and_password_required' });

    const uq = await db(`SELECT * FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (!uq.rowCount) return res.status(401).json({ error: 'invalid_credentials' });
    const user = uq.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    // при желании можно задать/обновить PIN
    if (pin) {
      const pinHash = await bcrypt.hash(String(pin).padStart(4, '0'), 10);
      await db(`UPDATE users SET pin_hash=$1 WHERE id=$2`, [pinHash, user.id]);
    }

    // Primary membership — если есть
    const mem = await loadPrimaryMembership(user.id); // может быть null

    const payload = {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role: mem?.role || null,
      establishment_id: mem?.establishment_id || null,
      establishment_name: mem?.establishment_name || null,
    };
    const access = signAccess(payload);

    const refreshRaw = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const refreshHash = sha256(refreshRaw);

    await db(
      `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, mem?.establishment_id || null, refreshHash, req.headers['user-agent'] || null, req.ip || null, nowPlusDays(REFRESH_TTL_DAYS)]
    );

    res.cookie(COOKIE_NAME, refreshRaw, cookieOpts());
    res.status(200);
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('login-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Установка/смена PIN под валидным access ===
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

// === Быстрый вход по PIN + refresh-кука ===
router.post('/unlock', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'pin_required' });

    const refreshRaw = req.cookies?.[COOKIE_NAME];
    if (!refreshRaw) return res.status(401).json({ error: 'no_refresh' });

    const rhash = sha256(refreshRaw);
    // если session.establishment_id NULL — значит пользователь «solo» (без привязки)
    const q = await db(
      `SELECT s.id, s.user_id, s.establishment_id, s.revoked_at,
              u.phone, u.name, u.pin_hash
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.refresh_hash=$1 AND s.revoked_at IS NULL
        LIMIT 1`,
      [rhash]
    );
    if (!q.rowCount) return res.status(401).json({ error: 'invalid_refresh' });
    const row = q.rows[0];

    const ok = row.pin_hash ? await bcrypt.compare(String(pin).padStart(4, '0'), row.pin_hash) : false;
    if (!ok) return res.status(401).json({ error: 'invalid_pin' });

    // membership — если нужен
    let role = null, establishment_id = null, establishment_name = null;
    if (row.establishment_id != null) {
      const active = await ensureActiveMembership(row.user_id, row.establishment_id);
      if (!active) return res.status(401).json({ error: 'membership_revoked' });

      const mem = await db(
        `SELECT m.role, e.name AS establishment_name
           FROM memberships m
           JOIN establishments e ON e.id = m.establishment_id
          WHERE m.user_id=$1 AND m.establishment_id=$2
          LIMIT 1`,
        [row.user_id, row.establishment_id]
      );
      if (mem.rowCount) {
        role = mem.rows[0].role;
        establishment_id = row.establishment_id;
        establishment_name = mem.rows[0].establishment_name;
      }
    }

    const payload = {
      sub: row.user_id,
      phone: row.phone,
      name: row.name,
      role,
      establishment_id,
      establishment_name,
    };
    const access = signAccess(payload);
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('unlock error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === refresh с ротацией — membership опционален ===
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no_refresh' });

    const h = sha256(token);
    const q = await db(
      `SELECT s.id, s.user_id, s.establishment_id, s.revoked_at,
              u.phone, u.name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.refresh_hash = $1 AND s.revoked_at IS NULL
        LIMIT 1`,
      [h]
    );
    if (q.rows.length === 0) return res.status(401).json({ error: 'invalid_refresh' });

    const row = q.rows[0];

    // ротация refresh
    await db(`UPDATE sessions SET revoked_at = now() WHERE id=$1`, [row.id]);

    // соберём payload
    let role = null, establishment_id = null, establishment_name = null;
    if (row.establishment_id != null) {
      const active = await ensureActiveMembership(row.user_id, row.establishment_id);
      if (!active) return res.status(401).json({ error: 'membership_revoked' });

      const mem = await db(
        `SELECT m.role, e.name AS establishment_name
           FROM memberships m
           JOIN establishments e ON e.id = m.establishment_id
          WHERE m.user_id=$1 AND m.establishment_id=$2
          LIMIT 1`,
        [row.user_id, row.establishment_id]
      );
      if (mem.rowCount) {
        role = mem.rows[0].role;
        establishment_id = row.establishment_id;
        establishment_name = mem.rows[0].establishment_name;
      }
    }

    const payload = {
      sub: row.user_id,
      phone: row.phone,
      name: row.name,
      role,
      establishment_id,
      establishment_name,
    };
    const access = signAccess(payload);

    const nextPlain = crypto.randomBytes(32).toString('base64url');
    const nextHash = sha256(nextPlain);
    await db(
      `INSERT INTO sessions(user_id, establishment_id, refresh_hash, ua, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [row.user_id, establishment_id, nextHash, req.headers['user-agent'] || null, req.ip || null, nowPlusDays(REFRESH_TTL_DAYS)]
    );
    res.cookie(COOKIE_NAME, nextPlain, cookieOpts());
    return res.json({ access, user: payload });
  } catch (e) {
    console.error('refresh error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === logout ===
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
