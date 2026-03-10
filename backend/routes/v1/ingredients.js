import express from 'express';
import { query as db } from '../../db.js';
import { requirePermission } from '../../utils/permissions.js';

const r = express.Router();

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

r.get('/', requirePermission('ingredients:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost", unit
         FROM ingredients
        WHERE establishment_id = $1
        ORDER BY name`,
      [est]
    );

    const data = q.rows.map((x) => ({
      id: x.id,
      name: x.name,
      packVolume: x.packVolume,
      packCost: x.packCost,
      unit: x.unit,
      costPerUnit: x.packVolume > 0 && x.packCost > 0 ? +(x.packCost / x.packVolume).toFixed(4) : null,
      type: 'ingredient',
    }));

    return res.json(data);
  } catch (e) {
    console.error('ingredients.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/', requirePermission('ingredients:create'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const { name, packVolume, packCost, unit } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });

    const ins = await db(
      `INSERT INTO ingredients(establishment_id, name, package_volume, package_cost, unit)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id`,
      [est, name.trim(), packVolume ?? null, packCost ?? null, unit ?? null]
    );

    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error('ingredients.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.put('/:id', requirePermission('ingredients:update'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const { name, packVolume, packCost, unit } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name_required' });

    const upd = await db(
      `UPDATE ingredients
          SET name=$1, package_volume=$2, package_cost=$3, unit=$4
        WHERE id=$5 AND establishment_id=$6`,
      [name.trim(), packVolume ?? null, packCost ?? null, unit ?? null, id, est]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('ingredients.put error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/:id', requirePermission('ingredients:delete'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const del = await db(`DELETE FROM ingredients WHERE id=$1 AND establishment_id=$2`, [id, est]);
    if (!del.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('ingredients.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
