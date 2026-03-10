import express from 'express';
import { query as db } from '../../db.js';
import { rowsToCsv } from '../../utils/csv.js';
import { hasPermission, requirePermission } from '../../utils/permissions.js';

const r = express.Router();

const REQUEST_KINDS = new Set(['supply', 'writeoff', 'maintenance', 'incident', 'vacation']);
const REQUEST_STATUSES = new Set(['draft', 'submitted', 'approved', 'rejected', 'in_progress', 'done']);
const MANAGER_STATUSES = new Set(['approved', 'rejected', 'in_progress', 'done', 'submitted']);

const TEMPLATES = [
  {
    kind: 'supply',
    title: 'Заявка на поставку',
    fields: ['позиция', 'количество', 'единица', 'комментарий'],
  },
  {
    kind: 'writeoff',
    title: 'Акт списания',
    fields: ['позиция', 'количество', 'причина', 'подтверждение'],
  },
  {
    kind: 'maintenance',
    title: 'Заявка на ремонт',
    fields: ['оборудование', 'проблема', 'срочность', 'контакт'],
  },
  {
    kind: 'incident',
    title: 'Служебная записка',
    fields: ['тип', 'описание', 'дата/время', 'свидетели'],
  },
  {
    kind: 'vacation',
    title: 'Заявка на отпуск/смену',
    fields: ['период', 'причина', 'замена', 'комментарий'],
  },
];

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function safeDetails(details) {
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    return details;
  }
  return {};
}

r.get('/templates', requirePermission('forms:read'), (_req, res) => {
  return res.json(TEMPLATES);
});

r.get('/', requirePermission('forms:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const filters = [];
    const params = [est];

    const kind = req.query.kind ? String(req.query.kind).trim() : null;
    const status = req.query.status ? String(req.query.status).trim() : null;

    if (kind && REQUEST_KINDS.has(kind)) {
      params.push(kind);
      filters.push(`r.kind = $${params.length}`);
    }
    if (status && REQUEST_STATUSES.has(status)) {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }

    const whereSuffix = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const q = await db(
      `SELECT
          r.id,
          r.kind,
          r.title,
          r.details,
          r.status,
          r.created_at,
          r.updated_at,
          r.created_by,
          u.name AS created_by_name,
          u.phone AS created_by_phone
       FROM operation_requests r
       JOIN users u ON u.id = r.created_by
      WHERE r.establishment_id = $1
        ${whereSuffix}
      ORDER BY r.created_at DESC
      LIMIT 200`,
      params
    );

    return res.json(q.rows);
  } catch (e) {
    console.error('forms.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/', requirePermission('forms:create'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const kind = String(req.body?.kind || '').trim();
    const title = String(req.body?.title || '').trim();
    const details = safeDetails(req.body?.details);
    let status = String(req.body?.status || 'submitted').trim();

    if (!REQUEST_KINDS.has(kind) || !title) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
    if (!REQUEST_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    if (!hasPermission(req.user, 'forms:manage_status') && status !== 'draft' && status !== 'submitted') {
      status = 'submitted';
    }

    const ins = await db(
      `INSERT INTO operation_requests(establishment_id, created_by, kind, title, details, status)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       RETURNING id`,
      [est, req.userId, kind, title, JSON.stringify(details), status]
    );

    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error('forms.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.get('/export.csv', requirePermission('forms:export'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT
          r.id,
          r.kind,
          r.title,
          r.status,
          r.details,
          r.created_at,
          r.updated_at,
          u.name AS created_by_name,
          u.phone AS created_by_phone
       FROM operation_requests r
       JOIN users u ON u.id = r.created_by
      WHERE r.establishment_id = $1
      ORDER BY r.created_at DESC`,
      [est]
    );

    const csv = rowsToCsv(
      [
        { key: 'id', label: 'id' },
        { key: 'kind', label: 'kind' },
        { key: 'title', label: 'title' },
        { key: 'status', label: 'status' },
        { key: 'details', label: 'details_json' },
        { key: 'created_by_name', label: 'created_by_name' },
        { key: 'created_by_phone', label: 'created_by_phone' },
        { key: 'created_at', label: 'created_at' },
        { key: 'updated_at', label: 'updated_at' },
      ],
      q.rows.map((row) => ({
        ...row,
        details: JSON.stringify(row.details || {}),
      }))
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"forms_export.csv\"');
    return res.status(200).send(csv);
  } catch (e) {
    console.error('forms.export error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.patch('/:id', requirePermission('forms:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const q = await db(
      `SELECT id, created_by, status
         FROM operation_requests
        WHERE id=$1 AND establishment_id=$2`,
      [id, est]
    );
    if (!q.rowCount) return res.sendStatus(404);

    const row = q.rows[0];
    const ownDraft = row.created_by === req.userId && (row.status === 'draft' || row.status === 'submitted');
    const canManageAny = hasPermission(req.user, 'forms:update_any');
    const canUpdateOwn = hasPermission(req.user, 'forms:update_own');
    if (!canManageAny && !(canUpdateOwn && ownDraft)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const title = String(req.body?.title || '').trim();
    const details = safeDetails(req.body?.details);
    if (!title) return res.status(400).json({ error: 'title_required' });

    await db(
      `UPDATE operation_requests
          SET title=$1,
              details=$2::jsonb,
              updated_at=now()
        WHERE id=$3 AND establishment_id=$4`,
      [title, JSON.stringify(details), id, est]
    );

    return res.sendStatus(200);
  } catch (e) {
    console.error('forms.patch error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.patch('/:id/status', requirePermission('forms:manage_status'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const status = String(req.body?.status || '').trim();
    if (!MANAGER_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }

    const upd = await db(
      `UPDATE operation_requests
          SET status=$1, updated_at=now()
        WHERE id=$2 AND establishment_id=$3`,
      [status, id, est]
    );
    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('forms.status error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
