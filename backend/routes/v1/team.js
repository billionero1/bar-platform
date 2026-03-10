import crypto from 'crypto';
import express from 'express';
import { query as db } from '../../db.js';
import { hasPermission, requirePermission } from '../../utils/permissions.js';

const r = express.Router();

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function normPhone(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

async function countActiveManagers(establishmentId) {
  const q = await db(
    `SELECT COUNT(*)::int AS cnt
       FROM memberships
      WHERE establishment_id=$1
        AND role='manager'
        AND revoked_at IS NULL`,
    [establishmentId]
  );
  return Number(q.rows[0]?.cnt || 0);
}

function buildInviteUrl(req, token) {
  const configured = String(process.env.FRONTEND_ORIGIN || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  const path = `/onboarding/${token}`;
  if (configured) return `${configured}${path}`;

  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin) return `${origin}${path}`;

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173');
  const host = rawHost.replace(/:3001$/, ':5173');
  return `${proto}://${host}${path}`;
}

r.get('/', requirePermission('team:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT
          m.id AS membership_id,
          m.user_id,
          m.role,
          m.created_at,
          u.phone,
          u.name,
          u.surname
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE m.establishment_id = $1
        AND m.revoked_at IS NULL
      ORDER BY CASE WHEN m.role = 'manager' THEN 0 ELSE 1 END, u.name ASC, u.phone ASC`,
      [est]
    );

    return res.json({
      can_manage: hasPermission(req.user, 'team:manage'),
      rows: q.rows,
    });
  } catch (e) {
    console.error('team.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.get('/invites', requirePermission('invites:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT id, invited_phone, invited_name, invited_surname, role,
              expires_at, accepted_at, revoked_at, created_at
         FROM team_invitations
        WHERE establishment_id=$1
        ORDER BY created_at DESC
        LIMIT 200`,
      [est]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error('team.invites.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/invites', requirePermission('invites:create'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const phone = normPhone(req.body?.phone);
    const invitedName = String(req.body?.name || '').trim() || null;
    const invitedSurname = String(req.body?.surname || '').trim() || null;
    const role = String(req.body?.role || 'staff').trim();
    const ttlHoursRaw = Number(req.body?.ttl_hours ?? 72);
    const ttlHours = Number.isFinite(ttlHoursRaw) ? Math.min(168, Math.max(1, ttlHoursRaw)) : 72;

    if (!phone || phone.length !== 11) {
      return res.status(400).json({ error: 'invalid_phone' });
    }
    if (role !== 'manager' && role !== 'staff') {
      return res.status(400).json({ error: 'invalid_role' });
    }

    const memberExists = await db(
      `SELECT 1
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.establishment_id=$1
          AND m.revoked_at IS NULL
          AND u.phone=$2
        LIMIT 1`,
      [est, phone]
    );
    if (memberExists.rowCount) {
      return res.status(400).json({ error: 'already_member' });
    }

    const userExists = await db(
      `SELECT id, phone, name, surname
         FROM users
        WHERE phone=$1
        LIMIT 1`,
      [phone]
    );
    if (userExists.rowCount) {
      const existingUser = userExists.rows[0];
      const membershipUpsert = await db(
        `INSERT INTO memberships(user_id, establishment_id, role)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, establishment_id)
         DO UPDATE SET role = EXCLUDED.role, revoked_at = NULL
         RETURNING id, user_id, role`,
        [existingUser.id, est, role]
      );
      return res.status(201).json({
        linked_existing_user: true,
        membership_id: membershipUpsert.rows[0].id,
        user: {
          id: existingUser.id,
          phone: existingUser.phone,
          name: existingUser.name,
          surname: existingUser.surname,
        },
        role: membershipUpsert.rows[0].role,
      });
    }

    const token = `inv_${crypto.randomBytes(24).toString('base64url')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const inviteIns = await db(
      `INSERT INTO team_invitations(
        establishment_id,
        created_by,
        invited_phone,
        invited_name,
        invited_surname,
        role,
        token_hash,
        expires_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        now() + ($8 || ' hours')::interval
      )
      RETURNING id, expires_at`,
      [est, req.userId, phone, invitedName, invitedSurname, role, tokenHash, String(Math.trunc(ttlHours))]
    );

    const row = inviteIns.rows[0];
    return res.status(201).json({
      id: row.id,
      expires_at: row.expires_at,
      invite_url: buildInviteUrl(req, token),
      invite_token: token,
    });
  } catch (e) {
    console.error('team.invites.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/invites/:inviteId', requirePermission('invites:cancel'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const inviteId = Number(req.params.inviteId);
    if (!Number.isFinite(inviteId)) return res.status(400).json({ error: 'invalid_id' });

    const upd = await db(
      `UPDATE team_invitations
          SET revoked_at = now()
        WHERE id=$1
          AND establishment_id=$2
          AND revoked_at IS NULL
          AND accepted_at IS NULL`,
      [inviteId, est]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('team.invites.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.patch('/:membershipId/role', requirePermission('team:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const membershipId = Number(req.params.membershipId);
    if (!Number.isFinite(membershipId)) return res.status(400).json({ error: 'invalid_id' });

    const role = String(req.body?.role || '').trim();
    if (role !== 'manager' && role !== 'staff') {
      return res.status(400).json({ error: 'invalid_role' });
    }

    const q = await db(
      `SELECT id, user_id, role
         FROM memberships
        WHERE id=$1
          AND establishment_id=$2
          AND revoked_at IS NULL`,
      [membershipId, est]
    );
    if (!q.rowCount) return res.sendStatus(404);

    const row = q.rows[0];
    if (row.role === role) return res.sendStatus(200);

    if (row.role === 'manager' && role === 'staff') {
      const managerCount = await countActiveManagers(est);
      if (managerCount <= 1) {
        return res.status(400).json({ error: 'last_manager' });
      }
    }

    await db(
      `UPDATE memberships
          SET role=$1
        WHERE id=$2
          AND establishment_id=$3
          AND revoked_at IS NULL`,
      [role, membershipId, est]
    );

    return res.sendStatus(200);
  } catch (e) {
    console.error('team.role error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/:membershipId', requirePermission('team:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const membershipId = Number(req.params.membershipId);
    if (!Number.isFinite(membershipId)) return res.status(400).json({ error: 'invalid_id' });

    const q = await db(
      `SELECT id, user_id, role
         FROM memberships
        WHERE id=$1
          AND establishment_id=$2
          AND revoked_at IS NULL`,
      [membershipId, est]
    );
    if (!q.rowCount) return res.sendStatus(404);

    const row = q.rows[0];
    if (row.user_id === req.userId) {
      return res.status(400).json({ error: 'cannot_revoke_self' });
    }

    if (row.role === 'manager') {
      const managerCount = await countActiveManagers(est);
      if (managerCount <= 1) {
        return res.status(400).json({ error: 'last_manager' });
      }
    }

    await db(
      `UPDATE memberships
          SET revoked_at=now()
        WHERE id=$1
          AND establishment_id=$2
          AND revoked_at IS NULL`,
      [membershipId, est]
    );

    return res.sendStatus(200);
  } catch (e) {
    console.error('team.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
