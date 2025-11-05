import express from 'express';
import auth from '../middleware/auth.js';
import { query as dbQuery } from '../db.js';

const db = { query: (t,p)=>dbQuery(t,p) };
const router = express.Router();

async function getPreparationCost(prepId, db, visited = new Set()) {
  if (visited.has(prepId)) return 0;
  visited.add(prepId);

  const { rows: ingredients } = await db.query(
    `SELECT
       pi.ingredient_id AS id,
       pi.amount,
       pi.is_preparation AS "isPreparation"
     FROM preparation_ingredients pi
     WHERE pi.preparation_id = $1`,
    [prepId]
  );

  let total = 0;
  for (const ing of ingredients) {
    if (!ing.isPreparation) {
      const { rows: [data] } = await db.query(
        `SELECT package_cost, package_volume FROM ingredients WHERE id = $1`,
        [ing.id]
      );
      if (data && data.package_cost && data.package_volume) {
        total += Number(ing.amount) * (Number(data.package_cost) / Number(data.package_volume));
      }
    } else {
      const { rows: [prep] } = await db.query(
        `SELECT yield_value FROM preparations WHERE id = $1`,
        [ing.id]
      );
      if (prep && prep.yield_value > 0) {
        const subCost = await getPreparationCost(ing.id, db, new Set(visited));
        total += Number(ing.amount) * (subCost / Number(prep.yield_value));
      }
    }
  }
  return total;
}

router.get('/', auth, async (req, res) => {
  try {
    const { rows: preps } = await db.query(
      `SELECT id, title, yield_value, alt_volume
       FROM preparations
       WHERE establishment_id = $1`,
      [req.user.establishment_id]
    );

    const result = [];
    for (const prep of preps) {
      const { rows: ingredients } = await db.query(
        `SELECT
           pi.ingredient_id as id,
           pi.is_preparation,
           pi.amount,
           COALESCE(i.name, p.title) as name
         FROM preparation_ingredients pi
         LEFT JOIN ingredients i ON i.id = pi.ingredient_id AND pi.is_preparation = false
         LEFT JOIN preparations p ON p.id = pi.ingredient_id AND pi.is_preparation = true
         WHERE pi.preparation_id = $1`,
        [prep.id]
      );

      const yieldValue = Number(prep.yield_value) || 1;
      const totalCost = await getPreparationCost(prep.id, db);
      const costPerUnit = yieldValue > 0 ? +(totalCost / yieldValue).toFixed(4) : null;

      result.push({
        id: prep.id,
        name: prep.title,
        yieldValue,
        altVolume: prep.alt_volume ?? null,
        ingredients: ingredients.map(i => ({
          id: i.id,
          name: i.name,
          amount: i.amount.toString(),
          type: i.is_preparation ? 'preparation' : 'ingredient',
        })),
        costPerUnit: isFinite(costPerUnit) ? costPerUnit : null,
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Ошибка получения заготовок:', err);
    res.status(500).json({ error: 'Ошибка получения заготовок' });
  }
});

router.get('/:id', auth, async (req, res) => {
  const id = +req.params.id;

  const { rows: prepRows } = await db.query(
    `SELECT id, title, yield_value, alt_volume
     FROM preparations
     WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!prepRows.length) return res.sendStatus(404);
  const prep = prepRows[0];

  const { rows: ingredients } = await db.query(
    `SELECT
       pi.ingredient_id AS id,
       pi.amount,
       pi.is_preparation AS "isPreparation",
       COALESCE(i.name, p.title) AS name
     FROM preparation_ingredients pi
     LEFT JOIN ingredients i ON pi.ingredient_id = i.id AND pi.is_preparation = FALSE
     LEFT JOIN preparations p ON pi.ingredient_id = p.id AND pi.is_preparation = TRUE
     WHERE pi.preparation_id = $1`,
    [id]
  );

  const yieldValue = Number(prep.yield_value) || 1;
  const totalCost = await getPreparationCost(id, db);
  const costPerUnit = yieldValue > 0 ? +(totalCost / yieldValue).toFixed(4) : null;

  res.json({
    id: prep.id,
    title: prep.title,
    yieldValue: prep.yield_value,
    altVolume: prep.alt_volume ?? null,
    ingredients: ingredients.map(i => ({
      id: i.id,
      name: i.name,
      amount: i.amount.toString(),
      type: i.isPreparation ? 'preparation' : 'ingredient',
    })),
    costPerUnit: isFinite(costPerUnit) ? costPerUnit : null,
  });
});

router.post('/', auth, async (req, res) => {
  const { title, yieldValue, altVolume, ingredients } = req.body;
  if (!title || !yieldValue || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  const { rows } = await db.query(
    `INSERT INTO preparations (title, yield_value, alt_volume, establishment_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [title.trim(), yieldValue, altVolume ?? null, req.user.establishment_id]
  );
  const newId = rows[0].id;

  const insertValues = ingredients.map((ing, i) =>
    `(${newId}, $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  ).join(',');

  const insertParams = ingredients.flatMap(ing => [
    ing.id,
    ing.type === 'preparation',
    ing.amount
  ]);

  if (insertParams.length > 0) {
    await db.query(
      `INSERT INTO preparation_ingredients (preparation_id, ingredient_id, is_preparation, amount)
       VALUES ${insertValues}`,
      insertParams
    );
  }

  res.status(201).json({ id: newId });
});

router.put('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { title, yieldValue, altVolume, ingredients } = req.body;
  if (!title || !yieldValue || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  await db.query(
    `UPDATE preparations
     SET title = $1, yield_value = $2, alt_volume = $3
     WHERE id = $4 AND establishment_id = $5`,
    [title.trim(), yieldValue, altVolume ?? null, id, req.user.establishment_id]
  );

  await db.query(`DELETE FROM preparation_ingredients WHERE preparation_id = $1`, [id]);

  const insertValues2 = ingredients.map((ing, i) =>
    `(${id}, $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`
  ).join(',');

  const insertParams2 = ingredients.flatMap(ing => [
    ing.id,
    ing.type === 'preparation',
    ing.amount
  ]);

  if (insertParams2.length > 0) {
    await db.query(
      `INSERT INTO preparation_ingredients (preparation_id, ingredient_id, is_preparation, amount)
       VALUES ${insertValues2}`,
      insertParams2
    );
  }

  res.sendStatus(200);
});

router.delete('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  await db.query(`DELETE FROM preparation_ingredients WHERE preparation_id = $1`, [id]);
  await db.query(`DELETE FROM preparations WHERE id = $1 AND establishment_id = $2`, [id, req.user.establishment_id]);
  res.sendStatus(200);
});

export default router;
