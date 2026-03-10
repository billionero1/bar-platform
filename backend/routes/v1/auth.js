// backend/routes/v1/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { query as db, pool } from '../../db.js';
import { COOKIE_NAME, JWT_SECRET } from '../../config.js';
import { loadUserData } from '../../utils/sessionUtils.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { hasPermission, listPermissionsForRole } from '../../utils/permissions.js';
import { consumeRateLimit } from '../../utils/rateLimit.js';
import { deliverOtp } from '../../services/otpDelivery.js';
import { seedDefaultTrainingContent } from '../../utils/trainingSeed.js';

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
    // CSRF invalid НЕ логируем в auth_events (чтобы не спамить)
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
    secure: isProd,     // на https будет true за счёт NODE_ENV=production
    sameSite: 'lax',    // одинаково и dev, и prod
    path: '/',
  });

  return res.json({ csrfToken: token });
});

// Обработчик ошибок CSRF (оставляем как было, но без console.error спама)
router.use((err, req, res, next) => {
  if (err?.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      error: 'invalid_csrf_token',
      code: 'CSRF_TOKEN_INVALID',
      message: 'Invalid CSRF token',
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
const PHONE_VERIFICATION_TTL_MINUTES = Number(
  process.env.PHONE_VERIFICATION_TTL_MINUTES || 60
);
const PHONE_VERIFICATION_INTERVAL = `${Math.max(1, PHONE_VERIFICATION_TTL_MINUTES)} minutes`;

function cookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'lax' : 'lax',
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
  if (pwd.length < 8) return 'password_too_short';
  if (!/[A-Z]/.test(pwd)) return 'password_no_uppercase';
  if (!/[a-z]/.test(pwd)) return 'password_no_lowercase';
  if (!/[0-9]/.test(pwd)) return 'password_no_digit';
  return null;
}

function maskPhone(phone) {
  const p = String(phone || '');
  if (p.length < 11) return p;
  return `+${p[0]} ${p[1]}** ***-${p[7]}${p[8]}-${p[9]}${p[10]}`;
}

function normalizeInviteToken(raw) {
  const token = String(raw || '').trim();
  return token.length >= 24 ? token : '';
}

async function isLimited(key, limit = 8, windowMs = 5 * 60 * 1000) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  const result = await consumeRateLimit(key, limit, windowSeconds);
  return result.limited;
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

function buildPayload(user, membership) {
  const role = membership?.role || null;
  return {
    sub: user.id,
    phone: user.phone,
    name: user.name,
    role,
    establishment_id: membership?.establishment_id || null,
    establishment_name: membership?.establishment_name || null,
    permissions: listPermissionsForRole(role),
  };
}

async function createSessionCookie(req, res, userId) {
  const sidPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
  const sidHash = sha256(sidPlain);

  await db(
    `INSERT INTO sessions(user_id, sid_hash, ua, ip, expires_at, last_activity_at)
     VALUES ($1,$2,$3,$4, now() + $5::interval, now())`,
    [userId, sidHash, req.headers['user-agent'] || null, req.ip || null, SESSION_PG_INTERVAL]
  );

  res.cookie(COOKIE_NAME, sidPlain, cookieOpts());
}

// ===================================================================
// auth_events — только полезное и без спама
// ===================================================================
const AUTH_EVENTS_ALLOWLIST = new Set([
  'login_success',
  'login_invalid_credentials',

  'register_success',
  'register_phone_taken',

  'verify_sms_requested',
  'verify_sms_rate_limited',

  'reset_sms_requested',
  'reset_sms_rate_limited',
  'reset_success',
  'reset_invalid_code',

  'logout',
]);

async function logAuthEvent(eventType, req, {
  userId = null,
  phone = null,
  success = null,
  details = null,
} = {}) {
  try {
    if (!AUTH_EVENTS_ALLOWLIST.has(eventType)) return;

    const ip = req?.ip || null;
    const ua = req?.headers?.['user-agent'] || null;
    const method = req?.method || null;
    const path = req?.originalUrl || req?.url || null;

    await db(
      `INSERT INTO auth_events(event_type, user_id, phone, ip, user_agent, method, path, success, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        eventType,
        userId,
        phone,
        ip,
        ua,
        method,
        path,
        success,
        JSON.stringify(details ?? {}),
      ]
    );
  } catch {
    // аудит НЕ должен ломать рабочие запросы
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
      // register_phone_taken — подходит и для verify, потому что смысл: номер уже занят
      await logAuthEvent('register_phone_taken', req, { phone: p, success: false });
      return res.status(400).json({ error: 'phone_already_registered' });
    }

    const exhausted = await db(
      `SELECT 1
         FROM passcodes
        WHERE phone=$1
          AND purpose='verify'
          AND expires_at > now()
          AND attempts_left <= 0
        LIMIT 1`,
      [p]
    );
    if (exhausted.rowCount) {
      return res.status(429).json({ error: 'too_many_attempts' });
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
      await logAuthEvent('verify_sms_rate_limited', req, {
        phone: p,
        success: false,
        details: { window_sec: 60 },
      });
      return res.status(429).json({ error: 'too_many_requests' });
    }

    // создаём SMS-код
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    await db(
      `DELETE FROM phone_verifications
        WHERE phone=$1 AND purpose='register'`,
      [p]
    );
    const codeIns = await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,'verify',3, now() + interval '15 minutes')
       RETURNING id`,
      [p, code]
    );
    const passcodeId = codeIns.rows[0].id;

    try {
      await deliverOtp({
        phone: p,
        code,
        purpose: 'verify',
      });
    } catch (deliveryError) {
      await db(`DELETE FROM passcodes WHERE id=$1`, [passcodeId]).catch(() => {});
      await logAuthEvent('verify_sms_requested', req, {
        phone: p,
        success: false,
        details: {
          purpose: 'verify',
          reason: 'delivery_failed',
        },
      });
      console.error('request-verify delivery error', deliveryError);
      return res.status(503).json({ error: 'otp_delivery_failed' });
    }

    await logAuthEvent('verify_sms_requested', req, {
      phone: p,
      success: true,
      details: { purpose: 'verify' },
    });

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

    const exhausted = await db(
      `SELECT 1
         FROM passcodes
        WHERE phone=$1
          AND purpose='verify'
          AND expires_at > now()
          AND attempts_left <= 0
        LIMIT 1`,
      [p]
    );
    if (exhausted.rowCount) {
      return res.status(429).json({ error: 'too_many_attempts' });
    }

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1
          AND purpose='verify'
          AND expires_at > now()
          AND attempts_left > 0
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
    await db(
      `INSERT INTO phone_verifications(phone, purpose, expires_at)
       VALUES ($1, 'register', now() + $2::interval)
       ON CONFLICT (phone, purpose)
       DO UPDATE SET expires_at = EXCLUDED.expires_at, created_at = now()`,
      [p, PHONE_VERIFICATION_INTERVAL]
    );
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
    if (!user.rowCount) return res.status(404).json({ error: 'not_found' }); // не логируем (anti-enumeration)

    const exhausted = await db(
      `SELECT 1
         FROM passcodes
        WHERE phone=$1
          AND purpose='reset'
          AND expires_at > now()
          AND attempts_left <= 0
        LIMIT 1`,
      [p]
    );
    if (exhausted.rowCount) {
      return res.status(429).json({ error: 'too_many_attempts' });
    }

    const recent = await db(
      `SELECT 1 FROM passcodes
         WHERE phone=$1 AND purpose='reset'
           AND created_at > now() - interval '60 seconds'
         LIMIT 1`,
      [p]
    );
    if (recent.rowCount) {
      await logAuthEvent('reset_sms_rate_limited', req, {
        userId: user.rows[0].id,
        phone: p,
        success: false,
        details: { window_sec: 60 },
      });
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    const codeIns = await db(
      `INSERT INTO passcodes(phone, code, purpose, attempts_left, expires_at)
       VALUES ($1,$2,'reset',3, now() + interval '15 minutes')
       RETURNING id`,
      [p, code]
    );
    const passcodeId = codeIns.rows[0].id;

    try {
      await deliverOtp({
        phone: p,
        code,
        purpose: 'reset',
      });
    } catch (deliveryError) {
      await db(`DELETE FROM passcodes WHERE id=$1`, [passcodeId]).catch(() => {});
      await logAuthEvent('reset_sms_requested', req, {
        userId: user.rows[0].id,
        phone: p,
        success: false,
        details: {
          purpose: 'reset',
          reason: 'delivery_failed',
        },
      });
      console.error('request-reset delivery error', deliveryError);
      return res.status(503).json({ error: 'otp_delivery_failed' });
    }

    await logAuthEvent('reset_sms_requested', req, {
      userId: user.rows[0].id,
      phone: p,
      success: true,
      details: { purpose: 'reset' },
    });

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

    if (!p || !code || !new_password) {
      return res.status(400).json({ error: 'phone_code_password_required' });
    }

    const passwordError = validatePassword(new_password);
    if (passwordError) {
      return res.status(400).json({
        error: passwordError,
        message: 'New password must be at least 8 characters with uppercase, lowercase and digit'
      });
    }

    const uq = await db(`SELECT id, phone, name FROM users WHERE phone=$1 LIMIT 1`, [p]);
    if (!uq.rowCount) {
      return res.status(404).json({ error: 'not_found' }); // не логируем (anti-enumeration)
    }
    const user = uq.rows[0];

    const exhausted = await db(
      `SELECT 1
         FROM passcodes
        WHERE phone=$1
          AND purpose='reset'
          AND expires_at > now()
          AND attempts_left <= 0
        LIMIT 1`,
      [p]
    );
    if (exhausted.rowCount) {
      return res.status(429).json({ error: 'too_many_attempts' });
    }

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1
          AND purpose='reset'
          AND expires_at > now()
          AND attempts_left > 0
        ORDER BY id DESC
        LIMIT 1`,
      [p]
    );
    if (!q.rowCount) {
      await logAuthEvent('reset_invalid_code', req, {
        userId: user.id,
        phone: user.phone,
        success: false,
        details: { reason: 'code_expired_or_not_found' },
      });
      return res.status(401).json({ error: 'code_expired_or_not_found' });
    }

    const row = q.rows[0];
    if (!secureCompare(row.code, code)) {
      await db(
        `UPDATE passcodes SET attempts_left = GREATEST(attempts_left - 1, 0)
          WHERE id=$1 AND attempts_left > 0`,
        [row.id]
      );

      await logAuthEvent('reset_invalid_code', req, {
        userId: user.id,
        phone: user.phone,
        success: false,
        details: { reason: 'invalid_code' },
      });

      return res.status(401).json({ error: 'invalid_code' });
    }

    const passHash = await bcrypt.hash(new_password, 10);
    await db(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passHash, user.id]);
    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);

    const mem = await loadPrimaryMembership(user.id);
    const payload = buildPayload(user, mem);
    const access = signAccess(payload);
    await createSessionCookie(req, res, user.id);

    await logAuthEvent('reset_success', req, {
      userId: user.id,
      phone: user.phone,
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

    if (!phone || !password || !name) {
      // bad_input НЕ логируем
      return res.status(400).json({ error: 'bad_input' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      // bad_input НЕ логируем
      return res.status(400).json({
        error: passwordError,
        message: 'Password must be at least 8 characters with uppercase, lowercase and digit'
      });
    }

    const verified = await db(
      `SELECT 1
         FROM phone_verifications
        WHERE phone=$1
          AND purpose='register'
          AND expires_at > now()
        LIMIT 1`,
      [phone]
    );
    if (!verified.rowCount) {
      return res.status(403).json({ error: 'phone_not_verified' });
    }

    const rlKey = `register:${req.ip || 'ip'}:${phone}`;
    if (await isLimited(rlKey, 5, 60 * 60 * 1000)) {
      // rate limit не логируем (чтобы не спамить)
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const exist = await db(`SELECT id FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exist.rows.length) {
      await logAuthEvent('register_phone_taken', req, { phone, success: false });
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
    const payload = buildPayload(u, mem);
    const access = signAccess(payload);
    await createSessionCookie(req, res, u.id);
    await db(
      `DELETE FROM phone_verifications
        WHERE phone=$1 AND purpose='register'`,
      [phone]
    );

    await logAuthEvent('register_success', req, {
      userId: u.id,
      phone: u.phone,
      success: true,
    });

    return res.json({ user: payload, access });
  } catch (e) {
    console.error('register-user error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// === Invite onboarding ===
router.get('/invite/:token', async (req, res) => {
  try {
    const token = normalizeInviteToken(req.params.token);
    if (!token) return res.status(400).json({ error: 'invalid_invite_token' });

    const tokenHash = sha256(token);
    const q = await db(
      `SELECT i.id, i.invited_phone, i.invited_name, i.invited_surname, i.role,
              i.expires_at, i.accepted_at, i.revoked_at,
              e.id AS establishment_id, e.name AS establishment_name
         FROM team_invitations i
         JOIN establishments e ON e.id = i.establishment_id
        WHERE i.token_hash=$1
        LIMIT 1`,
      [tokenHash]
    );
    if (!q.rowCount) return res.status(404).json({ error: 'invite_not_found' });

    const invite = q.rows[0];
    const expired = new Date(invite.expires_at) <= new Date();
    if (invite.revoked_at || invite.accepted_at || expired) {
      return res.status(410).json({ error: 'invite_expired' });
    }

    return res.json({
      id: invite.id,
      role: invite.role,
      invited_name: invite.invited_name,
      invited_surname: invite.invited_surname,
      invited_phone_masked: maskPhone(invite.invited_phone),
      establishment_id: invite.establishment_id,
      establishment_name: invite.establishment_name,
      expires_at: invite.expires_at,
    });
  } catch (e) {
    console.error('invite.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.post('/invite/:token/accept', async (req, res) => {
  const token = normalizeInviteToken(req.params.token);
  if (!token) return res.status(400).json({ error: 'invalid_invite_token' });

  const client = await pool.connect();
  try {
    const password = String(req.body?.password || '');
    const nameFromBody = String(req.body?.name || '').trim();
    const surnameFromBody = String(req.body?.surname || '').trim();
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        error: passwordError,
        message: 'Password must be at least 8 characters with uppercase, lowercase and digit'
      });
    }

    await client.query('BEGIN');

    const tokenHash = sha256(token);
    const q = await client.query(
      `SELECT i.id, i.establishment_id, i.invited_phone, i.invited_name, i.invited_surname, i.role,
              i.expires_at, i.accepted_at, i.revoked_at, e.name AS establishment_name
         FROM team_invitations i
         JOIN establishments e ON e.id = i.establishment_id
        WHERE i.token_hash=$1
        LIMIT 1
        FOR UPDATE`,
      [tokenHash]
    );
    if (!q.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'invite_not_found' });
    }

    const invite = q.rows[0];
    const expired = new Date(invite.expires_at) <= new Date();
    if (invite.revoked_at || invite.accepted_at || expired) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'invite_expired' });
    }

    const safeName = nameFromBody || String(invite.invited_name || '').trim() || 'Сотрудник';
    const safeSurname = surnameFromBody || String(invite.invited_surname || '').trim() || null;
    const exists = await client.query(
      `SELECT id, phone, name, surname, password_hash
         FROM users
        WHERE phone=$1
        LIMIT 1`,
      [invite.invited_phone]
    );

    let user;
    if (exists.rowCount) {
      const existingUser = exists.rows[0];
      const passwordOk = existingUser.password_hash
        ? await bcrypt.compare(password, existingUser.password_hash)
        : false;

      if (!passwordOk) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'account_exists_use_login' });
      }

      await client.query(
        `UPDATE users
            SET name = COALESCE(NULLIF($1, ''), name),
                surname = COALESCE(NULLIF($2, ''), surname)
          WHERE id=$3`,
        [safeName, safeSurname || '', existingUser.id]
      );
      user = {
        id: existingUser.id,
        phone: existingUser.phone,
        name: safeName || existingUser.name,
      };
    } else {
      const passHash = await bcrypt.hash(password, 10);
      const userIns = await client.query(
        `INSERT INTO users(phone, name, surname, password_hash, is_admin)
         VALUES ($1,$2,$3,$4,false)
         RETURNING id, phone, name`,
        [invite.invited_phone, safeName, safeSurname, passHash]
      );
      user = userIns.rows[0];
    }

    await client.query(
      `INSERT INTO memberships(user_id, establishment_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, establishment_id)
       DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL`,
      [user.id, invite.establishment_id, invite.role]
    );

    await client.query(
      `UPDATE team_invitations
          SET accepted_at = now(), accepted_user_id = $2
        WHERE id = $1`,
      [invite.id, user.id]
    );

    await client.query('COMMIT');

    const membership = {
      role: invite.role,
      establishment_id: invite.establishment_id,
      establishment_name: invite.establishment_name,
    };
    const payload = buildPayload(user, membership);
    const access = signAccess(payload);
    await createSessionCookie(req, res, user.id);

    return res.json({ ok: true, user: payload, access });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('invite.accept error', e);
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

// === Создание заведения ===
router.post('/establishments', requireAuth, async (req, res) => {
  try {
    if (!hasPermission(req.user, 'establishment:create')) {
      return res.status(403).json({ error: 'forbidden' });
    }

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
    await seedDefaultTrainingContent(est.id, req.userId);

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

    if (!phoneRaw || !password) {
      // bad_input НЕ логируем
      return res.status(400).json({ error: 'phone_password_required' });
    }

    const phoneNormForKey = normPhone(phoneRaw) || 'invalid';
    const rlKey = `login:${req.ip || 'ip'}:${phoneNormForKey}`;
    if (await isLimited(rlKey, 10, 10 * 60 * 1000)) {
      // rate limit не логируем (чтобы не спамить)
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const phone = normPhone(phoneRaw);
    if (!phone) {
      // bad_input НЕ логируем
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
      await logAuthEvent('login_invalid_credentials', req, {
        phone,
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
      await logAuthEvent('login_invalid_credentials', req, {
        userId: u.id,
        phone: u.phone,
        success: false,
      });
      return res.status(401).json({
        error: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const membership = await loadPrimaryMembership(u.id);

    const payload = buildPayload(u, membership);

    const access = signAccess(payload);
    await createSessionCookie(req, res, u.id);

    await logAuthEvent('login_success', req, {
      userId: u.id,
      phone: u.phone,
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

    let userId = null;
    let phone = null;

    if (raw) {
      const h = sha256(raw);

      // Берём user_id до revoke — чтобы корректно залогировать logout
      const q = await db(
        `SELECT s.user_id, u.phone
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.sid_hash = $1
          LIMIT 1`,
        [h]
      );

      if (q.rowCount) {
        userId = q.rows[0].user_id;
        phone = q.rows[0].phone;
      }

      await db(
        `UPDATE sessions
            SET revoked_at = now()
          WHERE sid_hash = $1
            AND revoked_at IS NULL`,
        [h]
      ).catch(() => {});
    }

    res.clearCookie(COOKIE_NAME, cookieOpts());

    await logAuthEvent('logout', req, { userId, phone, success: true });

    return res.json({ ok: true });
  } catch (e) {
    console.error('logout error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
