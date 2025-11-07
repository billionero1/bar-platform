import express from 'express';
import { query as db } from '../../db.js';
import { requireAuth } from '../../middleware/requireAuth.js';

const r = express.Router();

// рекурсивный расчёт стоимости и разложения (с защитой от циклов)
async function calcPreparation(prepId, estId, visited = new Set()) {
  if (visited.has(prepId)) throw new Error('cycle_detected');
  visited.add(prepId);

  const prepQ = await db(
    `SELECT id, title, yield_value, yield_unit
       FROM preparations
      WHERE id=$1 AND establishment_id=$2`,
    [prepId, estId]
  );
  if (prepQ.rowCount === 0) return null;
  const prep = prepQ.rows[0];

  const compQ = await db(
    `SELECT id, ingredient_id, nested_preparation_id, amount, unit
       FROM preparation_components
      WHERE preparation_id=$1`,
    [prepId]
  );

  let cost = 0;
  const breakdown = [];
  for (const c of compQ.rows) {
    if (c.ingredient_id) {
      const iQ = await db(
        `SELECT id, name, package_volume, package_cost, unit
           FROM ingredients
          WHERE id=$1 AND establishment_id=$2`,
        [c.ingredient_id, estId]
      );
      const i = iQ.rows[0];
      const unitCost = (i?.package_volume>0) ? (i.package_cost/i.package_volume) : 0;
      const partCost = unitCost * Number(c.amount);
      cost += partCost;
      breakdown.push({ type:'ingredient', id:i.id, name:i.name, amount:c.amount, unit:c.unit||i.unit, cost: +partCost.toFixed(4) });
    } else {
      const sub = await calcPreparation(c.nested_preparation_id, estId, new Set(visited));
      const subUnitCost = (sub?.yield_value>0) ? (sub.cost / sub.yield_value) : 0;
      const partCost = subUnitCost * Number(c.amount);
      cost += partCost;
      breakdown.push({ type:'preparation', id:sub.id, name:sub.title, amount:c.amount, unit:c.unit||sub.yield_unit, cost:+partCost.toFixed(4) });
    }
  }

  return {
    id: prep.id,
    title: prep.title,
    yield_value: prep.yield_value,
    yield_unit: prep.yield_unit,
    cost: +cost.toFixed(4),
    cost_per_unit: (prep.yield_value>0) ? +(cost/prep.yield_value).toFixed(4) : null,
    breakdown
  };
}

r.get('/', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const q = await db(
    `SELECT id, title, yield_value, yield_unit
       FROM preparations
      WHERE establishment_id=$1
      ORDER BY title`,
    [est]
  );

  // легкое обогащение стоимостью за единицу
  const result = [];
  for (const p of q.rows) {
    const calc = await calcPreparation(p.id, est).catch(()=>null);
    result.push({
      id: p.id, title: p.title,
      yield_value: p.yield_value, yield_unit: p.yield_unit,
      cost_per_unit: calc?.cost_per_unit ?? null
    });
  }
  res.json(result);
});

r.post('/', requireAuth, async (req, res) => {
  const est = req.user.establishment_id;
  const { title, yield_value, yield_unit, components } = req.body||{};
  if (!title?.trim() || !Array.isArray(components) || components.length===0) {
    return res.status(400).json({ error:'invalid_payload' });
  }
  const ins = await db(
    `INSERT INTO preparations(establishment_id, title, yield_value, yield_unit)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [est, title.trim(), yield_value??null, yield_unit??null]
  );
  const id = ins.rows[0].id;

  // компоненты: [{type:'ingredient'|'preparation', id, amount, unit}]
  const vals = [];
  const params = [];
  components.forEach((c, i) => {
    vals.push(`($1, $${i*4+2}, $${i*4+3}, $${i*4+4}, $${i*4+5})`);
    params.push(
      c.type==='ingredient' ? c.id : null,
      c.type==='preparation' ? c.id : null,
      c.amount,
      c.unit||null
    );
  });
  await db(
    `INSERT INTO preparation_components(preparation_id, ingredient_id, nested_preparation_id, amount, unit)
     VALUES ${vals.join(',')}`,
    [id, ...params]
  );

  res.status(201).json({ id });
});

r.get('/:id/calc', requireAuth, async (req, res) => {
  try {
    const est = req.user.establishment_id;
    const id = +req.params.id;
    const volume = req.query.volume ? Number(req.query.volume) : null;

    const calc = await calcPreparation(id, est);
    if (!calc) return res.sendStatus(404);

    if (volume && calc.yield_value>0) {
      const k = volume / calc.yield_value;
      return res.json({
        ...calc,
        requested_volume: volume,
        cost_for_volume: +(calc.cost * k).toFixed(4)
      });
    }
    res.json(calc);
  } catch (e) {
    console.error('calc error', e);
    res.status(400).json({ error:'calc_failed' });
  }
});

export default r;
