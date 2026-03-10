// backend/utils/sessionUtils.js
import { query as db } from '../db.js';
import { listPermissionsForRole } from './permissions.js';

/**
 * Проверка sid_hash в таблице sessions.
 * Никаких console.log в нормальном флоу.
 */
export async function validateSession(sidHash, updateActivity = false) {
  try {
    const q = await db(
      `
      SELECT s.id, s.user_id, s.expires_at, s.revoked_at
      FROM sessions s
      WHERE s.sid_hash = $1
      LIMIT 1
      `,
      [sidHash]
    );

    if (!q.rowCount) {
      return { valid: false, reason: 'SESSION_NOT_FOUND' };
    }

    const row = q.rows[0];

    if (row.revoked_at) {
      return { valid: false, reason: 'SESSION_REVOKED' };
    }

    if (new Date(row.expires_at) <= new Date()) {
      return { valid: false, reason: 'SESSION_EXPIRED' };
    }

    if (updateActivity) {
      // activity update — best-effort
      await db(`UPDATE sessions SET last_activity_at = now() WHERE id = $1`, [
        row.id,
      ]);
    }

    return {
      valid: true,
      userId: row.user_id,
      sessionId: row.id,
    };
  } catch (error) {
    console.error('[SESSION] validateSession failed:', error);
    return { valid: false, reason: 'INTERNAL_ERROR' };
  }
}

/**
 * Загружает "payload" пользователя + основное membership.
 * Без console.log в нормальном флоу.
 */
export async function loadUserData(userId) {
  try {
    const userQ = await db(
      `SELECT id, phone, name FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (!userQ.rowCount) {
      return null;
    }

    const user = userQ.rows[0];

    const mem = await db(
      `
      SELECT m.establishment_id, m.role, e.name AS establishment_name
      FROM memberships m
      LEFT JOIN establishments e ON e.id = m.establishment_id
      WHERE m.user_id = $1
        AND (
          NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name='memberships' AND column_name='revoked_at'
          )
          OR m.revoked_at IS NULL
        )
      ORDER BY m.id ASC
      LIMIT 1
      `,
      [userId]
    );

    const membership = mem.rows[0] || {};

    const role = membership.role || null;

    return {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role,
      establishment_id: membership.establishment_id || null,
      establishment_name: membership.establishment_name || null,
      permissions: listPermissionsForRole(role),
    };
  } catch (error) {
    console.error('[USER] loadUserData failed:', error);
    return null;
  }
}

/**
 * Для ручной отладки: возвращает строку sessions + user (без логов).
 * Не используем в прод-флоу.
 */
export async function debugSession(sidHash) {
  try {
    const q = await db(
      `
      SELECT s.*, u.phone, u.name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.sid_hash = $1
      LIMIT 1
      `,
      [sidHash]
    );

    return q.rowCount ? q.rows[0] : null;
  } catch (error) {
    console.error('[DEBUG] debugSession failed:', error);
    return null;
  }
}
