import express from 'express';
import auth from '../middleware/auth.js';
import { query as dbQuery } from '../db.js';

const db = { query: (t,p)=>dbQuery(t,p) };
const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost"
       FROM ingredients
       WHERE establishment_id = $1
       ORDER BY name`,
      [req.user.establishment_id]
    );

    const enriched = rows.map(row => ({
      id: row.id,
      name: row.name,
      packVolume: row.packVolume,
      packCost: row.packCost,
      costPerUnit: (row.packVolume && row.packCost && row.packVolume > 0)
                   ? +(row.packCost / row.packVolume).toFixed(4)
                   : null,
      type: 'ingredient',
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Ошибка получения ингредиентов:', err);
    res.status(500).json({ error: 'Ошибка получения ингредиентов' });
  }
});

router.post('/', auth, async (req, res) => {
  const { name, packVolume, packCost } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name' });

  const { rows } = await db.query(
    `INSERT INTO ingredients (name, package_volume, package_cost, establishment_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name.trim(), packVolume ?? null, packCost ?? null, req.user.establishment_id]
  );
  res.status(201).json({ id: rows[0].id });
});

router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { name, packVolume, packCost } = req.body;

  await db.query(
    `UPDATE ingredients
     SET name = $1, package_volume = $2, package_cost = $3
     WHERE id = $4 AND establishment_id = $5`,
    [name.trim(), packVolume ?? null, packCost ?? null, id, req.user.establishment_id]
  );
  res.sendStatus(200);
});

router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;
  await db.query(
    `DELETE FROM ingredients WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  res.sendStatus(200);
});

export default router;