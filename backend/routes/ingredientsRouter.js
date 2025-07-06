import express from 'express';
import auth from '../middleware/auth.js';
import { db } from '../index.js';

const router = express.Router();

// Получение всех ингредиентов и заготовок
router.get('/', auth, async (req, res) => {
  const { rows: ingredients } = await db.query(
    `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost",
            created_at, 'ingredient' AS type
     FROM ingredients
     WHERE establishment_id = $1`,
    [req.user.establishment_id]
  );

  const { rows: preparations } = await db.query(
    `SELECT id, title AS name, yield_value AS "packVolume",
            NULL AS "packCost", CURRENT_TIMESTAMP AS created_at,
            'preparation' AS type
     FROM preparations
     WHERE establishment_id = $1`,
    [req.user.establishment_id]
  );

  res.json([...ingredients, ...preparations]);
});

// Добавление ингредиента
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

// Обновление ингредиента
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

// Удаление ингредиента
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  await db.query(
    `DELETE FROM ingredients
     WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );

  res.sendStatus(200);
});

export default router;
