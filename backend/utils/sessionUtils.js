// backend/utils/sessionUtils.js
import { query as db } from '../db.js';

export async function validateSession(sidHash, updateActivity = false) {
  try {
    const q = await db(`
      SELECT s.id, s.user_id, s.expires_at, s.revoked_at
      FROM sessions s
      WHERE s.sid_hash = $1
      LIMIT 1
    `, [sidHash]);
    
    if (!q.rowCount) {
      console.log(`[SESSION] Session not found for hash: ${sidHash.slice(0, 16)}...`);
      return { valid: false, reason: 'SESSION_NOT_FOUND' };
    }
    
    const row = q.rows[0];
    
    if (row.revoked_at) {
      console.log(`[SESSION] Session revoked: user=${row.user_id}, session=${row.id}`);
      return { valid: false, reason: 'SESSION_REVOKED' };
    }
    
    if (new Date(row.expires_at) <= new Date()) {
      console.log(`[SESSION] Session expired: user=${row.user_id}, session=${row.id}`);
      return { valid: false, reason: 'SESSION_EXPIRED' };
    }
    
    if (updateActivity) {
      await db(`UPDATE sessions SET last_activity_at = now() WHERE id = $1`, [row.id]);
      console.log(`[SESSION] Activity updated: user=${row.user_id}, session=${row.id}`);
    }
    
    console.log(`[SESSION] Valid session: user=${row.user_id}, session=${row.id}`);
    return { 
      valid: true, 
      userId: row.user_id, 
      sessionId: row.id
    };
  } catch (error) {
    console.error(`[SESSION] Error validating session:`, error);
    return { valid: false, reason: 'INTERNAL_ERROR' };
  }
}

export async function loadUserData(userId) {
  try {
    const userQ = await db(
      `SELECT id, phone, name FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    
    if (!userQ.rowCount) {
      console.log(`[USER] User not found: ${userId}`);
      return null;
    }

    const user = userQ.rows[0];
    const mem = await db(
      `SELECT m.establishment_id, m.role, e.name AS establishment_name
       FROM memberships m
       LEFT JOIN establishments e ON e.id = m.establishment_id
       WHERE m.user_id = $1 AND m.revoked_at IS NULL
       ORDER BY m.id ASC
       LIMIT 1`,
      [userId]
    );

    const membership = mem.rows[0] || {};
    
    console.log(`[USER] Loaded user data: ${user.phone}, establishment: ${membership.establishment_name || 'none'}`);

    return {
      sub: user.id,
      phone: user.phone,
      name: user.name,
      role: membership.role || null,
      establishment_id: membership.establishment_id || null,
      establishment_name: membership.establishment_name || null,
    };
  } catch (error) {
    console.error(`[USER] Error loading user data for ${userId}:`, error);
    return null;
  }
}

// Дополнительная функция для отладки
export async function debugSession(sidHash) {
  try {
    const q = await db(
      `SELECT s.*, u.phone, u.name 
       FROM sessions s 
       JOIN users u ON u.id = s.user_id
       WHERE s.sid_hash = $1 LIMIT 1`,
      [sidHash]
    );
    
    if (q.rowCount) {
      const session = q.rows[0];
      console.log(`[DEBUG] Session debug:`, {
        id: session.id,
        user_id: session.user_id,
        user_phone: session.phone,
        expires_at: session.expires_at,
        revoked_at: session.revoked_at,
        last_activity_at: session.last_activity_at,
        need_pin: session.need_pin
      });
      return session;
    }
    return null;
  } catch (error) {
    console.error(`[DEBUG] Error debugging session:`, error);
    return null;
  }
}