import express from 'express';
import { query as db } from '../../db.js';
import { requireAuth } from '../../middleware/requireAuth.js';

const r = express.Router();

r.get('/', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const q = await db(
    `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost", unit
       FROM ingredients
      WHERE establishment_id = $1
      ORDER BY name`,
    [est]
  );
  const data = q.rows.map(x => ({
    id: x.id, name: x.name, packVolume: x.packVolume, packCost: x.packCost, unit: x.unit,
    costPerUnit: (x.packVolume>0 && x.packCost>0) ? +(x.packCost/x.packVolume).toFixed(4) : null,
    type: 'ingredient',
  }));
  res.json(data);
});

r.post('/', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const { name, packVolume, packCost, unit } = req.body||{};
  if (!name?.trim()) return res.status(400).json({ error:'name_required' });
  const ins = await db(
    `INSERT INTO ingredients(establishment_id,name,package_volume,package_cost,unit)
     VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [est, name.trim(), packVolume??null, packCost??null, unit??null]
  );
  res.status(201).json({ id: ins.rows[0].id });
});

r.put('/:id', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const id = +req.params.id;
  const { name, packVolume, packCost, unit } = req.body||{};
  await db(
    `UPDATE ingredients
        SET name=$1, package_volume=$2, package_cost=$3, unit=$4
      WHERE id=$5 AND establishment_id=$6`,
    [name.trim(), packVolume??null, packCost??null, unit??null, id, est]
  );
  res.sendStatus(200);
});

r.delete('/:id', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const id = +req.params.id;
  await db(`DELETE FROM ingredients WHERE id=$1 AND establishment_id=$2`, [id, est]);
  res.sendStatus(200);
});

export default r;
