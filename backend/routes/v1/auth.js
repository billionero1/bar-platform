// backend/routes/v1/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { query as db } from '../../db.js';
import { COOKIE_NAME, IDLE_MINUTES } from '../../config.js';


const router = express.Router();
router.use(cookieParser());

// === server-side session config (фиксированные N дней, без продления по действиям) ===
// Поддерживаем REFRESH_TTL_DAYS=30 или 30d
function parseSessionDays(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 30;
  const m = s.match(/^(\d+)\s*d?$/); // "30" или "30d"
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}
const SESSION_DAYS_NUM = parseSessionDays(process.env.REFRESH_TTL_DAYS);
const SESSION_PG_INTERVAL = `${SESSION_DAYS_NUM} days`;           // для SQL: now() + $5::interval
const SESSION_MAX_AGE_MS  = SESSION_DAYS_NUM * 24 * 60 * 60 * 1000; // для cookie

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const isProd = process.env.NODE_ENV === 'production';

function cookieOpts() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',                         // важно: на весь сайт
    maxAge: SESSION_MAX_AGE_MS,        // только UI-время; валидность — по БД
  };
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function genPin4() { return String(crypto.randomInt(0, 10000)).padStart(4, '0'); }

function normPhone(s) {
  let d = (s || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

// --- simple in-memory rate limit (per IP/key) ---
const RATE = new Map();

function isLimited(key, limit = 8, windowMs = 5 * 60 * 1000) {
  const now = Date.now();
  let bucket = RATE.get(key);
  if (!bucket || bucket.expires < now) {
    bucket = { count: 0, expires: now + windowMs };
    RATE.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function resetLimit(key) {
  RATE.delete(key);
}

async function ensureActiveMembership(userId, estId) {
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
  if (!q.rows.length) {
    return { establishment_id: null, establishment_name: null, role: 'solo' };
  }
  return q.rows[0];
}

// вспомогательно: подпишем «лёгкий» access только для фронта (не используется сервером)
function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.ACCESS_TTL || '15m' });
}

// === Проверка наличия валидной sid-сессии + idle-логика для PIN ===
router.get('/has-session', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.json({
        has: false,
        phone: null,
        has_pin: false,
        need_pin: false,
        user: null,
      });
    }

    const h = sha256(raw);
    const q = await db(
      `SELECT s.id,
              s.user_id,
              s.expires_at,
              s.revoked_at,
              s.need_pin,
              s.last_activity_at,
              u.phone,
              u.name,
              u.pin_hash
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
        has_pin: false,
        need_pin: false,
        user: null,
      });
    }

    const row = q.rows[0];

    // Сессия истекла по сроку или отозвана
    if (row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return res.json({
        has: false,
        phone: null,
        has_pin: false,
        need_pin: false,
        user: null,
      });
    }

    const hasPin = !!row.pin_hash;
    const now = new Date();
    const lastActivity = row.last_activity_at
      ? new Date(row.last_activity_at)
      : null;

    // Собираем payload пользователя так же, как в login/reset/register
    const mem = await loadPrimaryMembership(row.user_id);
    const payload = {
      sub: row.user_id,
      phone: row.phone,
      name: row.name,
      role: mem?.role || null,
      establishment_id: mem?.establishment_id || null,
      establishment_name: mem?.establishment_name || null,
    };

    // Если уже стоит need_pin — сразу говорим фронту, что нужен PIN
    if (row.need_pin) {
      return res.json({
        has: true,
        phone: row.phone,
        has_pin: hasPin,
        need_pin: true,
        user: payload,
      });
    }

    // Idle-логика: если давно не было активности, решаем — PIN или разлогин
    if (lastActivity && IDLE_MINUTES > 0) {
      const diffMs = now.getTime() - lastActivity.getTime();
      const idleMs = IDLE_MINUTES * 60 * 1000;

      if (diffMs > idleMs) {
        if (hasPin) {
          // PIN есть — помечаем сессию как заблокированную по PIN
          await db(
            `UPDATE sessions SET need_pin = true WHERE id = $1`,
            [row.id]
          ).catch(() => {});

          return res.json({
            has: true,
            phone: row.phone,
            has_pin: true,
            need_pin: true,
            user: payload,
          });
        } else {
          // PIN нет — сессию считаем протухшей
          await db(
            `UPDATE sessions
                SET revoked_at = now()
              WHERE id = $1
                AND revoked_at IS NULL`,
            [row.id]
          ).catch(() => {});

          return res.json({
            has: false,
            phone: null,
            has_pin: false,
            need_pin: false,
            user: null,
          });
        }
      }
    }

    // Всё ок, сессия жива и PIN не нужен
    return res.json({
      has: true,
      phone: row.phone,
      has_pin: hasPin,
      need_pin: false,
      user: payload,
    });
  } catch (e) {
    console.error('has-session error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});



/// === Лёгкий пинг: просто обновляем last_activity_at, если сессия живая и не в need_pin ===
router.post('/ping', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res
        .status(401)
        .json({ error: 'no_session', code: 'SESSION_EXPIRED' });
    }

    const h = sha256(raw);
    const q = await db(
      `SELECT s.id,
              s.user_id,
              s.expires_at,
              s.revoked_at,
              s.need_pin,
              u.pin_hash
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.sid_hash = $1
        LIMIT 1`,
      [h]
    );

    if (!q.rowCount) {
      return res
        .status(401)
        .json({ error: 'invalid_session', code: 'SESSION_EXPIRED' });
    }

    const row = q.rows[0];

    // Сессия истекла по сроку или отозвана
    if (row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return res
        .status(401)
        .json({ error: 'expired', code: 'SESSION_EXPIRED' });
    }

    // Если уже стоит need_pin — сразу просим PIN
    if (row.need_pin) {
      return res
        .status(401)
        .json({ error: 'pin_required', code: 'PIN_REQUIRED' });
    }

    // НИКАКОЙ idle-логики здесь! Просто отмечаем активность.
    await db(
      `UPDATE sessions SET last_activity_at = now() WHERE id = $1`,
      [row.id]
    ).catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    console.error('ping error', e);
    return res
      .status(500)
      .json({ error: 'internal_error', code: 'INTERNAL' });
  }
});



// === phone verification (регистрация — эмуляция) ===
router.post('/request-verify', async (req, res) => {
  try {
    const p = normPhone((req.body || {}).phone);
    if (!p) {
      return res.status(400).json({ error: 'phone_required' });
    }

    // 1) Сразу проверяем, не занят ли номер
    const exist = await db(
      `SELECT id FROM users WHERE phone=$1 LIMIT 1`,
      [p]
    );

    if (exist.rowCount) {
      // Номер уже есть в базе → СМС НЕ отправляем,
      // отдаём такую же ошибку, как в /register-user
      return res
        .status(400)
        .json({ error: 'phone_already_registered' });
      // rusify(e) на фронте превратит это в "Этот номер уже зарегистрирован"
    }

    // 2) rate-limit по запросам кода
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

    // 3) создаём код и сохраняем
    const code = genPin4();
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
    if (row.code !== code) {
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

// === Восстановление пароля ===
router.post('/request-reset', async (req, res) => {
  try {
    const p = normPhone((req.body || {}).phone);
    if (!p) return res.status(400).json({ error: 'phone_required' });

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

    const code = genPin4();
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
    if (!p || !code || !new_password) {
      return res.status(400).json({ error: 'phone_code_password_required' });
    }

    const uq = await db(`SELECT * FROM users WHERE phone=$1 LIMIT 1`, [p]);
    if (!uq.rowCount) return res.status(404).json({ error: 'not_found' });
    const user = uq.rows[0];

    const q = await db(
      `SELECT id, code, attempts_left
         FROM passcodes
        WHERE phone=$1 AND purpose='reset' AND expires_at > now()
        ORDER BY id DESC
        LIMIT 1`,
      [p]
    );
    if (!q.rowCount) return res.status(401).json({ error: 'code_expired_or_not_found' });

    const row = q.rows[0];
    if (row.code !== code) {
      await db(
        `UPDATE passcodes SET attempts_left = attempts_left - 1
          WHERE id=$1 AND attempts_left > 0`,
        [row.id]
      );
      return res.status(401).json({ error: 'invalid_code' });
    }

    const passHash = await bcrypt.hash(new_password, 10);
    await db(`UPDATE users SET password_hash=$1 WHERE id=$2`, [passHash, user.id]);
    await db(`DELETE FROM passcodes WHERE id=$1`, [row.id]);

    // payload чисто для фронта
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

    // создаём НОВУЮ серверную сессию (30 дней фикс) и ставим куку
    const sidPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash  = sha256(sidPlain);
    await db(
      `INSERT INTO sessions(user_id, sid_hash, ua, ip, expires_at, last_activity_at)
      VALUES ($1,$2,$3,$4, now() + $5::interval, now())`,
      [user.id, sidHash, req.headers['user-agent'] || null, req.ip || null, SESSION_PG_INTERVAL]
    );




    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    return res.json({ ok: true, access, user: payload });
  } catch (e) {
    console.error('reset-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});


// ───────────────────────────────────────────────────────────────────────────────
// 1) Регистрация (solo) — создаёт юзера + заводит серверную сессию (30 дней)
// ───────────────────────────────────────────────────────────────────────────────
router.post('/register-user', async (req, res) => {
  try {
    // 1) нормализуем телефон корректной функцией (normPhone)
    const phone = normPhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const pin = req.body?.pin ? String(req.body.pin) : null;
    const name = String(req.body?.name || '').trim();

    if (!phone || !password || !name) {
      return res.status(400).json({ error: 'bad_input' });
    }

    // 2) проверка занятости
    const exist = await db(`SELECT id FROM users WHERE phone=$1 LIMIT 1`, [phone]);
    if (exist.rows.length) {
      return res.status(400).json({ error: 'phone_already_registered' });
    }

    // 3) хэшируем пароль и (опционально) PIN
    const passHash = await bcrypt.hash(password, 10);
    const pinHash = pin && /^\d{4}$/.test(pin)
      ? await bcrypt.hash(pin, 10)
      : null;

    // 4) создаём пользователя; name пишем из тела
    const ins = await db(
      `INSERT INTO users (phone, password_hash, pin_hash, name)
       VALUES ($1,$2,$3,$4)
       RETURNING id, phone, name, pin_hash`,
      [phone, passHash, pinHash, name]
    );
    const u = ins.rows[0];


    // 5) формируем payload через membership (или solo по умолчанию)
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

    // 6) создаём серверную 30-дневную сессию и ставим sid-куку
    const sidPlain = crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash  = sha256(sidPlain);

    // ВАЖНО: считаем срок жизни прямо в БД — никаких дат из JS
    await db(
      `INSERT INTO sessions(user_id, sid_hash, ua, ip, expires_at, last_activity_at)
      VALUES ($1,$2,$3,$4, now() + $5::interval, now())`,
      [u.id, sidHash, req.headers['user-agent'] || null, req.ip || null, SESSION_PG_INTERVAL]
    );


    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    // 7) совместимый ответ (как при логине/ресете)
    return res.json({ user: payload, access });
  } catch (e) {
    console.error('register-user error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});


// === Регистрация менеджера (создание заведения) ===
router.post('/register-manager', async (req, res) => {
  try {
    const p = normPhone((req.body || {}).phone);
    const { name, surname, establishmentName, password, pin } = req.body || {};
    if (!p || !establishmentName || !password) {
      return res.status(400).json({ error: 'phone_establishment_password_required' });
    }

    const exists = await db(`SELECT 1 FROM users WHERE phone=$1 LIMIT 1`, [p]);
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
      [p, name || null, surname || null, passHash, pinHash]
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

// === ВХОД ПО ТЕЛЕФОНУ И ПАРОЛЮ: создаём НОВУЮ сессию, PIN не требуем ===
router.post('/login-password', async (req, res) => {
  try {
    const body = req.body || {};
    const phoneRaw = String(body.phone || '');
    const password = String(body.password || '');

    if (!phoneRaw || !password) {
      return res.status(400).json({ error: 'phone_password_required' });
    }

    const phone = normPhone(phoneRaw);
    if (!phone) {
      return res.status(400).json({ error: 'phone_required' });
    }

    // ищем пользователя
    const { rows, rowCount } = await db(
      `SELECT id, phone, name, password_hash, pin_hash
         FROM users
        WHERE phone = $1
        LIMIT 1`,
      [phone]
    );

    if (!rowCount) {
      return res.status(401).json({
        error: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const u = rows[0];

    // проверяем пароль
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({
        error: 'invalid_credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // основное заведение / роль
    const membership = await loadPrimaryMembership(u.id);

    const payload = {
      sub: u.id,
      phone: u.phone,
      name: u.name,
      role: membership?.role || null,
      establishment_id: membership?.establishment_id || null,
      establishment_name: membership?.establishment_name || null,
    };

    // access — только для совместимости (фронт его не использует)
    const access = signAccess(payload);

    // создаём новую sid-сессию
    const sidPlain =
      crypto.randomUUID() + ':' + crypto.randomBytes(12).toString('hex');
    const sidHash = sha256(sidPlain);

    await db(
      `INSERT INTO sessions (user_id, sid_hash, ua, ip, expires_at, last_activity_at)
      VALUES ($1, $2, $3, $4, now() + $5::interval, now())`,
      [u.id, sidHash, req.headers['user-agent'] || null, req.ip || null, SESSION_PG_INTERVAL]
    );


    // ставим sid-куку
    res.cookie(COOKIE_NAME, sidPlain, cookieOpts());

    // отдаём данные пользователю
    return res.json({
      user: payload,
      has_pin: !!u.pin_hash,
      access,
    });
  } catch (e) {
    console.error('login-password error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});




// === Установка/смена PIN под валидным access (Bearer) ===
// body: { pin: "1234" }
router.post('/set-pin', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'no_token' });

    let decoded;
    try { decoded = jwt.verify(token, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'bad_token' }); }

    const { pin } = req.body || {};
    const pinStr = String(pin || '');
    if (pinStr.length < 4) return res.status(400).json({ error: 'pin_required' });

    const pinHash = await bcrypt.hash(pinStr.padStart(4, '0'), 10);
    await db(`UPDATE users SET pin_hash=$1 WHERE id=$2`, [pinHash, decoded.sub]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('set-pin error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});


// === Быстрый вход по PIN по текущей sid-сессии ===
router.post('/unlock', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) {
      return res.status(400).json({ error: 'pin_required' });
    }

    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) {
      return res.status(401).json({ error: 'no_session', code: 'SESSION_EXPIRED' });
    }

    const h = sha256(raw);

    // лёгкий rate limit по IP + кусок хэша сессии
    const rlKey = `unlock:${req.ip || 'unknown'}:${h.slice(0, 16)}`;
    if (isLimited(rlKey)) {
      return res.status(429).json({ error: 'too_many_requests' });
    }

    const q = await db(
      `SELECT s.id,
              s.user_id,
              s.expires_at,
              s.revoked_at,
              s.need_pin,
              s.last_activity_at,
              u.pin_hash
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.sid_hash = $1
        LIMIT 1`,
      [h]
    );

    if (!q.rowCount) {
      return res.status(401).json({ error: 'invalid_session', code: 'SESSION_EXPIRED' });
    }

    const row = q.rows[0];
    if (row.revoked_at || new Date(row.expires_at) <= new Date()) {
      return res.status(401).json({ error: 'expired', code: 'SESSION_EXPIRED' });
    }

    if (!row.pin_hash) {
      return res.status(401).json({ error: 'no_pin', code: 'NO_PIN' });
    }

    const ok = await bcrypt.compare(String(pin).padStart(4, '0'), row.pin_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_pin', code: 'INVALID_PIN' });
    }

    // PIN ок → снимаем need_pin и обновляем активность
    await db(
      `UPDATE sessions
          SET need_pin = false,
              last_activity_at = now()
        WHERE id = $1`,
      [row.id]
    );

    // успешный ввод — сбрасываем лимит
    resetLimit(rlKey);

    return res.json({ ok: true });
  } catch (e) {
    console.error('unlock error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});



// === logout (ревок текущей сессии) ===
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
