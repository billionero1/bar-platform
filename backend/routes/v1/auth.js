// backend/routes/v1/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { query as db } from '../../db.js';
import { COOKIE_NAME } from '../../config.js';
import { loadUserData } from '../../utils/sessionUtils.js';
import { requireAuth } from '../../middleware/requireAuth.js';

// Secure compare для защиты от timing attacks
function secureCompare(a, b) {
  try {
    const aBuf = Buffer.from(String(a || ''), 'utf8');
    const bBuf = Buffer.from(String(b || ''), 'utf8');
    return aBuf.length === bBuf.length && 
           crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const isProd = process.env.NODE_ENV === 'production';

// === Простой double-submit CSRF ===
const CSRF_COOKIE_NAME = 'x-csrf-token';
const CSRF_IGNORED_METHODS = ['GET', 'HEAD', 'OPTIONS'];

router.use(cookieParser());

function csrfMiddleware(req, res, next) {
  if (CSRF_IGNORED_METHODS.includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    console.error('[CSRF] Invalid CSRF token:', {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(403).json({
      error: 'invalid_csrf_token',
      code: 'CSRF_TOKEN_INVALID',
      message: 'Invalid CSRF token',
    });
  }

  return next();
}

router.use(csrfMiddleware);

router.get('/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
  });

  return res.json({ csrfToken: token });
});

// Обработчик ошибок CSRF
router.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    console.error('[CSRF] Invalid CSRF token:', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(403).json({ 
      error: 'invalid_csrf_token',
      code: 'CSRF_TOKEN_INVALID',
      message: 'Invalid CSRF token'
    });
  }
  next(err);
});

// === server-side session config ===
function parseSessionDays(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 30;
  const m = s.match(/^(\d+)\s*d?$/);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}
const SESSION_DAYS_NUM = parseSessionDays(process.env.REFRESH_TTL_DAYS);
const SESSION_PG_INTERVAL = `${SESSION_DAYS_NUM} days`;
const SESSION_MAX_AGE_MS  = SESSION_DAYS_NUM * 24 * 60 * 60 * 1000;

function cookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function normPhone(s) {
  let d = (s || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

function validatePassword(password) {
  const pwd = String(password || '');
  
  if (pwd.length < 8) {
    return 'password_too_short';
  }
  if (!/[A-Z]/.test(pwd)) {
    return 'password_no_uppercase';
  }
  if (!/[a-z]/.test(pwd)) {
    return 'password_no_lowercase'; 
  }
  if (!/[0-9]/.test(pwd)) {
    return 'password_no_digit';
  }
  return null;
}

// --- simple in-memory rate limit ---
const RATE = new Map();

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, bucket] of RATE.entries()) {
    if (bucket.expires < now) {
      RATE.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0 && !process.env.NODE_ENV === 'test') {
    console.log(`[RATE LIMIT] Cleaned ${cleaned} expired entries`);
  }
}, 10 * 60 * 1000);

function cleanupIfNeeded() {
  if (RATE.size > 10000) {
    const now = Date.now();
    for (const [key, bucket] of RATE.entries()) {
      if (bucket.expires < now) {
        RATE.delete(key);
        if (RATE.size <= 8000) break;
      }
    }
  }
}

function isLimited(key, limit = 8, windowMs = 5 * 60 * 1000) {
  cleanupIfNeeded();
  const now = Date.now();
  let bucket = RATE.get(key);
  if (!bucket || bucket.expires < now) {
    bucket = { count: 0, expires: now + windowMs };
    RATE.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > limit;
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
  if (!q.rows.length) {
    return { establishment_id: null, establishment_name: null, role: 'solo' };
  }
  return q.rows[0];
}

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.ACCESS_TTL || '15m' });
}

// === Аудит auth-событий ===
async function logAuthEvent(
  eventType,
  {
    userId = null,
    phone = null,
    ip = null,
    ua = null,
    success = null,
  } = {}
) {
  try {
    await db(
      `INSERT INTO auth_events(event_type, user_id, phone, ip, user_agent, success)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [eventType, userId, phone, ip || null, ua || null, success]
    );
  } catch (e) {
    console.warn('[auth_events] failed to write audit log', e?.message || e);
  }
}

// === Проверка наличия валидной sid-сессии ===
router.get('/has-session', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.json({
        has: false,
        phone: null,
        user: null,
      });
    }

    const h = sha256(raw);

    const q = await db(
      `SELECT
          s.id,
          s.user_id,
          s.expires_at,
          s.revoked_at,
          u.phone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.sid_hash = $1
      LIMIT 1`,
      [h]
    );

    if (!q.rowCount) {
      return res.json({
        has: false,
        phone: null,
        user: null,
      });
    }

    const row = q.rows[0];

    if (row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return res.json({
        has: false,
        phone: null,
        user: null,
      });
    }

    const userData = await loadUserData(row.user_id);
    if (!userData) {
      return res.json({
        has: false,
        phone: null,
        user: null,
      });
    }

    return res.json({
      has: true,
      phone: userData.phone,
      user: userData,
    });
  } catch (e) {
    console.error('has-session error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === phone verification (SMS-коды) ===
router.post('/request-verify', async (req, res) => {
  try {
    const rawPhone = (req.body || {}).phone;
    const p = normPhone(rawPhone);

    if (!p) {
      return res.status(400).json({ error: 'phone_required' });
    }
    if (p.length !== 11) {
      return res.status(400).json({ error: 'invalid_phone' });
    }

    // Проверяем, не занят ли номер
    const exist = await db(
      `SELECT id FROM users WHERE phone=$1 LIMIT 1`,
      [p]
    );

    if (exist.rowCount) {
      return res.status(400).json({ error: 'phone_already_registered' });
    }

    // rate-limit по запросам SMS-кода
    const recent = await db(
      `SELECT 1 FROM passcodes
         WHERE phone=$1 AND purpose='verify'
           AND created_at > now() - interval '60 seconds'
         LIMIT 1`,
      [p]
    );
    if (recent.rows.length) {
      return res.status(429).json({ error: 'too_many_requests' });
    }

    // создаём SMS-код
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,'verify',3, now() + interval '15 minutes')`,
      [p, code]
    );

    if (!isProd) console.log(`[VERIFY] ${p} -> ${code}`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('request-verify error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/verify-code', async (req, res) => {
  try {
    const p = normPhone((req.body || {}).phone);
    const code = (req.body || {}).code;
    if (!p || !code) return res.status(400).json({ error: 'phone_and_code_required' });

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1 AND purpose='verify' AND expires_at > now()
        ORDER BY id DESC
        LIMIT 1`,
      [p]
    );
    if (!q.rows.length) return res.status(401).json({ error: 'code_expired_or_not_found' });

    const row = q.rows[0];
    if (!secureCompare(row.code, code)) {
      await db(
        `UPDATE passcodes SET attempts_left = GREATEST(attempts_left - 1, 0)
          WHERE id=$1 AND attempts_left > 0`,
        [row.id]
      );
      return res.status(401).json({ error: 'invalid_code' });
    }

    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error('verify-code error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Восстановление пароля (SMS-коды) ===
router.post('/request-reset', async (req, res) => {
  try {
    const rawPhone = (req.body || {}).phone;
    const p = normPhone(rawPhone);

    if (!p) {
      return res.status(400).json({ error: 'phone_required' });
    }
    if (p.length !== 11) {
      return res.status(400).json({ error: 'invalid_phone' });
    }

    const user = await db(`SELECT id FROM users WHERE phone=$1 LIMIT 1`, [p]);
    if (!user.rowCount) return res.status(404).json({ error: 'not_found' });

    const recent = await db(
      `SELECT 1 FROM passcodes
         WHERE phone=$1 AND purpose='reset'
           AND created_at > now() - interval '60 seconds'
         LIMIT 1`,
      [p]
    );
    if (recent.rowCount) return res.status(429).json({ error: 'too_many_requests' });

    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,'reset',3, now() + interval '15 minutes')`,
      [p, code]
    );

    if (!isProd) console.log(`[RESET] ${p} -> ${code}`);
    return res.json({ ok: true });
  } catch (e) {
    console.error('request-reset error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const p = normPhone((req.body || {}).phone);
    const code = (req.body || {}).code;
    const new_password = (req.body || {}).new_password;

    const ip = req.ip || 'unknown';
    const ua = req.headers['user-agent'] || null;

    if (!p || !code || !new_password) {
      await logAuthEvent('password_reset_fail', {
        phone: p,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ error: 'phone_code_password_required' });
    }

    const passwordError = validatePassword(new_password);
    if (passwordError) {
      await logAuthEvent('password_reset_fail', {
        phone: p,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ 
        error: passwordError,
        message: 'New password must be at least 8 characters with uppercase, lowercase and digit'
      });
    }

    const uq = await db(`SELECT * FROM users WHERE phone=$1 LIMIT 1`, [p]);
    if (!uq.rowCount) {
      await logAuthEvent('password_reset_fail', {
        phone: p,
        ip,
        ua,
        success: false,
      });
      return res.status(404).json({ error: 'not_found' });
    }
    const user = uq.rows[0];

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1 AND purpose='reset' AND expires_at > now()
        ORDER BY id DESC
        LIMIT 1`,
      [p]
    );
    if (!q.rowCount) {
      await logAuthEvent('password_reset_fail', {
        userId: user.id,
        phone: user.phone,
        ip,
        ua,
        success: false,
      });
      return res.status(401).json({ error: 'code_expired_or_not_found' });
    }

    const row = q.rows[0];
    if (!secureCompare(row.code, code)) {
      await db(
        `UPDATE passcodes SET attempts_left = attempts_left - 1
          WHERE id=$1 AND attempts_left > 0`,
        [row.id]
      );

      await logAuthEvent('password_reset_fail', {
        userId: user.id,
        phone: user.phone,
        ip,
        ua,
        success: false,
      });

      return res.status(401).json({ error: 'invalid_code' });
    }

    const passHash = await bcrypt.hash(new_password, 10);
    await db(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passHash, user.id]);
    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);

    const mem = await loadPrimaryMembership(user.id);
    const payload = {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role: mem?.role || null,
      establishment_id: mem?.establishment_id || null,
      establishment_name: mem?.establishment_name || null,
    };
    const access = signAccess(payload);

    const sidPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash  = sha256(sidPlain);
    await db(
      `INSERT INTO sessions(user_id, sid_hash, ua, ip, expires_at, last_activity_at)
       VALUES ($1,$2,$3,$4, now() + $5::interval, now())`,
      [user.id, sidHash, ua, ip, SESSION_PG_INTERVAL]
    );

    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    await logAuthEvent('password_reset_success', {
      userId: user.id,
      phone: user.phone,
      ip,
      ua,
      success: true,
    });

    return res.json({ ok: true, access, user: payload });
  } catch (e) {
    console.error('reset-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Регистрация ===
router.post('/register-user', async (req, res) => {
  try {
    const phone = normPhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    const ip = req.ip || 'unknown';
    const ua = req.headers['user-agent'] || null;

    if (!phone || !password || !name) {
      await logAuthEvent('register_fail', {
        phone,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ error: 'bad_input' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      await logAuthEvent('register_fail', {
        phone,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ 
        error: passwordError,
        message: 'Password must be at least 8 characters with uppercase, lowercase and digit'
      });
    }

    const rlKey = `register:${ip}:${phone}`;
    if (isLimited(rlKey, 5, 60 * 60 * 1000)) {
      await logAuthEvent('register_rate_limited', {
        phone,
        ip,
        ua,
        success: false,
      });
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const exist = await db(`SELECT id FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exist.rows.length) {
      await logAuthEvent('register_fail', {
        phone,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ error: 'phone_already_registered' });
    }

    const passHash = await bcrypt.hash(password, 10);

    const ins = await db(
      `INSERT INTO users (phone, password_hash, name)
       VALUES ($1,$2,$3)
       RETURNING id, phone, name`,
      [phone, passHash, name]
    );
    const u = ins.rows[0];

    const mem = await loadPrimaryMembership(u.id);
    const payload = {
      sub: u.id,
      phone: u.phone,
      name: u.name,
      role: mem?.role || null,
      establishment_id: mem?.establishment_id || null,
      establishment_name: mem?.establishment_name || null,
    };
    const access = signAccess(payload);

    const sidPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash  = sha256(sidPlain);

    await db(
      `INSERT INTO sessions(user_id, sid_hash, ua, ip, expires_at, last_activity_at)
       VALUES ($1,$2,$3,$4, now() + $5::interval, now())`,
      [u.id, sidHash, ua, ip, SESSION_PG_INTERVAL]
    );

    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    await logAuthEvent('register_success', {
      userId: u.id,
      phone: u.phone,
      ip,
      ua,
      success: true,
    });

    return res.json({ user: payload, access });
  } catch (e) {
    console.error('register-user error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Создание заведения ===
router.post('/establishments', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'establishment_name_required' });
    }

    const estIns = await db(
      `INSERT INTO establishments(name)
       VALUES ($1)
       RETURNING id, name, created_at`,
      [trimmedName]
    );
    const est = estIns.rows[0];

    await db(
      `INSERT INTO memberships(user_id, establishment_id, role)
       VALUES ($1, $2, 'manager')`,
      [req.userId, est.id]
    );

    return res.status(201).json({
      ok: true,
      establishment: {
        id: est.id,
        name: est.name,
        created_at: est.created_at,
      },
      membership: {
        user_id: req.userId,
        role: 'manager',
      },
    });
  } catch (e) {
    console.error('create-establishment error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Логин по паролю ===
router.post('/login-password', async (req, res) => {
  try {
    const body = req.body || {};
    const phoneRaw = String(body.phone || '');
    const password = String(body.password || '');

    const ip = req.ip || 'unknown';
    const ua = req.headers['user-agent'] || null;

    if (!phoneRaw || !password) {
      await logAuthEvent('login_fail', {
        phone: phoneRaw,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ error: 'phone_password_required' });
    }

    const rlKey = `login:${ip}:${normPhone(phoneRaw)}`;
    if (isLimited(rlKey, 10, 10 * 60 * 1000)) {
      await logAuthEvent('login_rate_limited', {
        phone: phoneRaw,
        ip,
        ua,
        success: false,
      });
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const phone = normPhone(phoneRaw);
    if (!phone) {
      await logAuthEvent('login_fail', {
        phone: phoneRaw,
        ip,
        ua,
        success: false,
      });
      return res.status(400).json({ error: 'phone_required' });
    }

    const { rows, rowCount } = await db(
      `SELECT id, phone, name, password_hash
         FROM users
        WHERE phone = $1
        LIMIT 1`,
      [phone]
    );

    if (!rowCount) {
      await logAuthEvent('login_fail', {
        phone,
        ip,
        ua,
        success: false,
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const u = rows[0];

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await logAuthEvent('login_fail', {
        userId: u.id,
        phone: u.phone,
        ip,
        ua,
        success: false,
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const membership = await loadPrimaryMembership(u.id);

    const payload = {
      sub: u.id,
      phone: u.phone,
      name: u.name,
      role: membership?.role || null,
      establishment_id: membership?.establishment_id || null,
      establishment_name: membership?.establishment_name || null,
    };

    const access = signAccess(payload);

    const sidPlain =
      crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash = sha256(sidPlain);

    await db(
      `INSERT INTO sessions (user_id, sid_hash, ua, ip, expires_at, last_activity_at)
      VALUES ($1, $2, $3, $4, now() + $5::interval, now())`,
      [u.id, sidHash, req.headers['user-agent'] || null, req.ip || null, SESSION_PG_INTERVAL]
    );

    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    await logAuthEvent('login_success', {
      userId: u.id,
      phone: u.phone,
      ip,
      ua,
      success: true,
    });

    return res.json({
      user: payload,
      access,
    });
  } catch (e) {
    console.error('login-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === logout ===
router.post('/logout', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (raw) {
      const h = sha256(raw);
      await db(
        `UPDATE sessions
            SET revoked_at = now()
          WHERE sid_hash = $1
            AND revoked_at IS NULL`,
        [h]
      ).catch(() => {});
    }
    res.clearCookie(COOKIE_NAME, cookieOpts());
    return res.json({ ok: true });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;