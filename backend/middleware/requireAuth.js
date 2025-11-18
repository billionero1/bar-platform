// backend/middleware/requireAuth.js
import crypto from 'crypto';
import { query as db } from '../db.js';
import { COOKIE_NAME, IDLE_MINUTES } from '../config.js';

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Проверка сессии по sid-куке.
 * Здесь:
 *  - проверяем, что сессия существует и не истекла (expires_at / revoked_at)
 *  - проверяем idle + need_pin
 *  - при необходимости возвращаем 401 с code = PIN_REQUIRED / SESSION_EXPIRED
 */
export async function requireAuth(req, res, next) {
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
              s.last_activity_at,
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

    const now = new Date();
    const lastActivity = row.last_activity_at
      ? new Date(row.last_activity_at)
      : null;
    const hasPin = !!row.pin_hash;

    // Если уже стоит need_pin — сразу просим PIN
    if (row.need_pin) {
      return res
        .status(401)
        .json({ error: 'pin_required', code: 'PIN_REQUIRED' });
    }

    // Idle-логика
    if (lastActivity && IDLE_MINUTES > 0) {
      const diffMs = now.getTime() - lastActivity.getTime();
      const idleMs = IDLE_MINUTES * 60 * 1000;

      if (diffMs > idleMs) {
        if (hasPin) {
          // PIN есть — блокируем по PIN
          await db(
            `UPDATE sessions SET need_pin = true WHERE id = $1`,
            [row.id]
          ).catch(() => {});

          return res
            .status(401)
            .json({ error: 'pin_required', code: 'PIN_REQUIRED' });
        } else {
          // PIN нет — убиваем сессию
          await db(
            `UPDATE sessions
                SET revoked_at = now()
              WHERE id = $1
                AND revoked_at IS NULL`,
            [row.id]
          ).catch(() => {});

          return res
            .status(401)
            .json({ error: 'session_expired', code: 'SESSION_EXPIRED' });
        }
      }
    }

    // Всё ок: обновляем last_activity_at
    await db(
      `UPDATE sessions SET last_activity_at = now() WHERE id = $1`,
      [row.id]
    ).catch(() => {});

    req.userId = row.user_id;
    return next();
  } catch (e) {
    console.error('requireAuth error', e);
    return res
      .status(500)
      .json({ error: 'internal_error', code: 'INTERNAL' });
  }
}
