import express from 'express';
import { query as db, pool } from '../../db.js';
import { requirePermission } from '../../utils/permissions.js';
import { convertAmountLoose, normalizeUnit } from '../../utils/units.js';

const r = express.Router();

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function normalizeComponents(components = []) {
  return components.map((c) => ({
    type: c?.type,
    id: Number(c?.id),
    amount: Number(c?.amount),
    unit: normalizeUnit(c?.unit),
  }));
}

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function scaleBreakdownItem(item, ratio) {
  const next = {
    ...item,
    amount: +(Number(item.amount || 0) * ratio).toFixed(4),
    cost: +(Number(item.cost || 0) * ratio).toFixed(4),
  };
  if (Array.isArray(item.expanded) && item.expanded.length) {
    next.expanded = item.expanded.map((sub) => scaleBreakdownItem(sub, ratio));
  }
  return next;
}

function scaleBreakdown(breakdown, ratio) {
  return breakdown.map((item) => scaleBreakdownItem(item, ratio));
}

function buildScaledCalc(calc, ratio, payload = {}) {
  const scaledCost = +(Number(calc.cost || 0) * ratio).toFixed(4);
  const requestedVolume = calc.yield_value ? +(Number(calc.yield_value) * ratio).toFixed(4) : null;
  const requestedAltVolume = calc.alt_volume ? +(Number(calc.alt_volume) * ratio).toFixed(4) : null;
  return {
    ...calc,
    base_cost: calc.cost,
    cost: scaledCost,
    breakdown: scaleBreakdown(calc.breakdown, ratio),
    scale_factor: +ratio.toFixed(6),
    requested_volume: requestedVolume,
    requested_alt_volume: requestedAltVolume,
    cost_for_requested: scaledCost,
    cost_for_volume: scaledCost, // обратная совместимость со старым полем
    ...payload,
  };
}

// Рекурсивный расчёт стоимости и разложения (с защитой от циклов)
async function calcPreparation(prepId, estId, visited = new Set()) {
  if (visited.has(prepId)) throw new Error('cycle_detected');
  visited.add(prepId);

  const prepQ = await db(
    `SELECT id, title, yield_value, yield_unit, alt_volume
       FROM preparations
      WHERE id=$1 AND establishment_id=$2`,
    [prepId, estId]
  );
  if (prepQ.rowCount === 0) return null;

  const prep = prepQ.rows[0];
  const prepYieldUnit = normalizeUnit(prep.yield_unit);

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
      if (!i) throw new Error('ingredient_not_found');

      const unitCost = i.package_volume > 0 ? i.package_cost / i.package_volume : 0;
      const ingredientUnit = normalizeUnit(i.unit);
      const sourceUnit = normalizeUnit(c.unit) || ingredientUnit;
      const amount = asFiniteNumber(c.amount) || 0;
      const amountForCost = convertAmountLoose(amount, sourceUnit, ingredientUnit);
      if (amountForCost === null) throw new Error('unit_mismatch');

      const partCost = unitCost * amountForCost;
      cost += partCost;
      breakdown.push({
        type: 'ingredient',
        id: i.id,
        name: i.name,
        amount,
        unit: sourceUnit || ingredientUnit,
        cost: +partCost.toFixed(4),
      });
    } else {
      const sub = await calcPreparation(c.nested_preparation_id, estId, new Set(visited));
      if (!sub) throw new Error('nested_preparation_not_found');

      const subYieldValue = asFiniteNumber(sub.yield_value) || 0;
      const subYieldUnit = normalizeUnit(sub.yield_unit);
      const sourceUnit = normalizeUnit(c.unit) || subYieldUnit;
      const usedAmount = asFiniteNumber(c.amount) || 0;
      const usedAmountForCost = convertAmountLoose(usedAmount, sourceUnit, subYieldUnit);
      if (usedAmountForCost === null) throw new Error('unit_mismatch');

      const subUnitCost = subYieldValue > 0 ? sub.cost / subYieldValue : 0;
      const partCost = subUnitCost * usedAmountForCost;
      cost += partCost;

      const ratio = subYieldValue > 0 ? usedAmountForCost / subYieldValue : 0;
      const expanded = ratio > 0 ? scaleBreakdown(sub.breakdown, ratio) : [];
      breakdown.push({
        type: 'preparation',
        id: sub.id,
        name: sub.title,
        amount: usedAmount,
        unit: sourceUnit || subYieldUnit,
        cost: +partCost.toFixed(4),
        ...(expanded.length ? { expanded } : {}),
      });
    }
  }

  return {
    id: prep.id,
    title: prep.title,
    yield_value: prep.yield_value,
    yield_unit: prepYieldUnit || prep.yield_unit || null,
    alt_volume: prep.alt_volume,
    cost: +cost.toFixed(4),
    cost_per_unit: prep.yield_value > 0 ? +(cost / prep.yield_value).toFixed(4) : null,
    breakdown,
  };
}

r.get('/', requirePermission('preparations:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT id, title, yield_value, yield_unit, alt_volume
         FROM preparations
        WHERE establishment_id=$1
        ORDER BY title`,
      [est]
    );

    const result = [];
    for (const p of q.rows) {
      const calc = await calcPreparation(p.id, est).catch(() => null);
      result.push({
        id: p.id,
        title: p.title,
        yield_value: p.yield_value,
        yield_unit: normalizeUnit(p.yield_unit) || p.yield_unit || null,
        alt_volume: p.alt_volume,
        cost_per_unit: calc?.cost_per_unit ?? null,
        breakdown: calc?.breakdown ?? [],
      });
    }

    return res.json(result);
  } catch (e) {
    console.error('preparations.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/', requirePermission('preparations:create'), async (req, res) => {
  const client = await pool.connect();
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const { title, yield_value, yield_unit, alt_volume, components } = req.body || {};
    const normalizedComponents = normalizeComponents(components);
    const normalizedYieldUnit = normalizeUnit(yield_unit);

    if (!title?.trim() || normalizedComponents.length === 0) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    for (const c of normalizedComponents) {
      const validType = c.type === 'ingredient' || c.type === 'preparation';
      if (!validType || !Number.isFinite(c.id) || !Number.isFinite(c.amount) || c.amount <= 0) {
        return res.status(400).json({ error: 'invalid_component' });
      }
    }

    const parsedAltVolume =
      alt_volume === undefined || alt_volume === null || String(alt_volume).trim() === ''
        ? null
        : parsePositiveNumber(alt_volume);
    if (alt_volume !== undefined && alt_volume !== null && String(alt_volume).trim() !== '' && parsedAltVolume === null) {
      return res.status(400).json({ error: 'invalid_alt_volume' });
    }

    await client.query('BEGIN');

    const prepIns = await client.query(
      `INSERT INTO preparations(establishment_id, title, yield_value, yield_unit, alt_volume)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [est, title.trim(), yield_value ?? null, normalizedYieldUnit, parsedAltVolume]
    );
    const prepId = prepIns.rows[0].id;

    const values = [];
    const params = [prepId];

    normalizedComponents.forEach((c, i) => {
      const base = i * 4;
      values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(
        c.type === 'ingredient' ? c.id : null,
        c.type === 'preparation' ? c.id : null,
        c.amount,
        c.unit
      );
    });

    await client.query(
      `INSERT INTO preparation_components(preparation_id, ingredient_id, nested_preparation_id, amount, unit)
       VALUES ${values.join(',')}`,
      params
    );

    await client.query('COMMIT');
    return res.status(201).json({ id: prepId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('preparations.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

r.put('/:id', requirePermission('preparations:update'), async (req, res) => {
  const client = await pool.connect();
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const { title, yield_value, yield_unit, alt_volume, components } = req.body || {};
    const normalizedComponents = normalizeComponents(components);
    const normalizedYieldUnit = normalizeUnit(yield_unit);

    if (!title?.trim() || normalizedComponents.length === 0) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    for (const c of normalizedComponents) {
      const validType = c.type === 'ingredient' || c.type === 'preparation';
      if (!validType || !Number.isFinite(c.id) || !Number.isFinite(c.amount) || c.amount <= 0) {
        return res.status(400).json({ error: 'invalid_component' });
      }
    }

    const parsedAltVolume =
      alt_volume === undefined || alt_volume === null || String(alt_volume).trim() === ''
        ? null
        : parsePositiveNumber(alt_volume);
    if (alt_volume !== undefined && alt_volume !== null && String(alt_volume).trim() !== '' && parsedAltVolume === null) {
      return res.status(400).json({ error: 'invalid_alt_volume' });
    }

    await client.query('BEGIN');

    const upd = await client.query(
      `UPDATE preparations
          SET title=$1, yield_value=$2, yield_unit=$3, alt_volume=$4
        WHERE id=$5 AND establishment_id=$6
      RETURNING id`,
      [title.trim(), yield_value ?? null, normalizedYieldUnit, parsedAltVolume, id, est]
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      return res.sendStatus(404);
    }

    await client.query(`DELETE FROM preparation_components WHERE preparation_id=$1`, [id]);

    const values = [];
    const params = [id];

    normalizedComponents.forEach((c, i) => {
      const base = i * 4;
      values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(
        c.type === 'ingredient' ? c.id : null,
        c.type === 'preparation' ? c.id : null,
        c.amount,
        c.unit
      );
    });

    await client.query(
      `INSERT INTO preparation_components(preparation_id, ingredient_id, nested_preparation_id, amount, unit)
       VALUES ${values.join(',')}`,
      params
    );

    await client.query('COMMIT');
    return res.sendStatus(200);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('preparations.put error', e);
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

r.get('/:id/calc', requirePermission('preparations:calc'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const hasVolumeQuery = req.query.volume !== undefined;
    const hasAltVolumeQuery = req.query.alt_volume !== undefined;
    const hasKnownQuery =
      req.query.known_amount !== undefined
      || req.query.known_component_index !== undefined
      || req.query.known_component_id !== undefined
      || req.query.known_component_type !== undefined;

    const activeModes = [hasVolumeQuery, hasAltVolumeQuery, hasKnownQuery].filter(Boolean).length;
    if (activeModes > 1) {
      return res.status(400).json({ error: 'multiple_calc_modes_not_allowed' });
    }

    const volume = hasVolumeQuery ? parsePositiveNumber(req.query.volume) : null;
    if (hasVolumeQuery && volume === null) {
      return res.status(400).json({ error: 'invalid_volume' });
    }

    const altVolume = hasAltVolumeQuery ? parsePositiveNumber(req.query.alt_volume) : null;
    if (hasAltVolumeQuery && altVolume === null) {
      return res.status(400).json({ error: 'invalid_alt_volume' });
    }

    const knownAmount = req.query.known_amount !== undefined
      ? parsePositiveNumber(req.query.known_amount)
      : null;
    if (req.query.known_amount !== undefined && knownAmount === null) {
      return res.status(400).json({ error: 'invalid_known_amount' });
    }

    const knownComponentIndex = req.query.known_component_index !== undefined
      ? Number(req.query.known_component_index)
      : null;
    if (
      req.query.known_component_index !== undefined
      && (!Number.isInteger(knownComponentIndex) || knownComponentIndex < 0)
    ) {
      return res.status(400).json({ error: 'invalid_known_component_index' });
    }

    const knownComponentId = req.query.known_component_id !== undefined
      ? Number(req.query.known_component_id)
      : null;
    if (
      req.query.known_component_id !== undefined
      && (!Number.isInteger(knownComponentId) || knownComponentId <= 0)
    ) {
      return res.status(400).json({ error: 'invalid_known_component_id' });
    }

    const knownComponentType = req.query.known_component_type;
    if (
      knownComponentType !== undefined
      && knownComponentType !== 'ingredient'
      && knownComponentType !== 'preparation'
    ) {
      return res.status(400).json({ error: 'invalid_known_component_type' });
    }

    const calc = await calcPreparation(id, est);
    if (!calc) return res.sendStatus(404);

    if (hasVolumeQuery) {
      if (!(Number(calc.yield_value) > 0)) {
        return res.status(400).json({ error: 'yield_value_required_for_volume_calc' });
      }
      const ratio = volume / Number(calc.yield_value);
      return res.json(
        buildScaledCalc(calc, ratio, {
          calculation_basis: 'yield',
          requested_volume: volume,
        })
      );
    }

    if (hasAltVolumeQuery) {
      if (!(Number(calc.alt_volume) > 0)) {
        return res.status(400).json({ error: 'alt_volume_required_for_alt_calc' });
      }
      const ratio = altVolume / Number(calc.alt_volume);
      return res.json(
        buildScaledCalc(calc, ratio, {
          calculation_basis: 'alt_volume',
          requested_alt_volume: altVolume,
        })
      );
    }

    if (hasKnownQuery) {
      if (knownAmount === null) return res.status(400).json({ error: 'known_amount_required' });
      if (knownComponentIndex === null && knownComponentId === null) {
        return res.status(400).json({ error: 'known_component_required' });
      }

      let component = null;
      if (knownComponentIndex !== null) {
        component = calc.breakdown[knownComponentIndex] || null;
      } else {
        component = calc.breakdown.find((item) => {
          if (item.id !== knownComponentId) return false;
          if (!knownComponentType) return true;
          return item.type === knownComponentType;
        }) || null;
      }

      if (!component) return res.status(404).json({ error: 'known_component_not_found' });
      const baseAmount = Number(component.amount);
      if (!(baseAmount > 0)) return res.status(400).json({ error: 'known_component_zero_amount' });

      const ratio = knownAmount / baseAmount;
      return res.json(
        buildScaledCalc(calc, ratio, {
          calculation_basis: 'known_component',
          known_component_index: knownComponentIndex,
          known_component_id: component.id,
          known_component_type: component.type,
          known_component_amount: knownAmount,
        })
      );
    }

    return res.json({
      ...calc,
      scale_factor: 1,
      calculation_basis: 'base',
    });
  } catch (e) {
    console.error('preparations.calc error', e);
    if (e?.message === 'unit_mismatch') {
      return res.status(400).json({ error: 'unit_mismatch' });
    }
    return res.status(400).json({ error: 'calc_failed' });
  }
});

r.delete('/:id', requirePermission('preparations:delete'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const del = await db(
      `DELETE FROM preparations
        WHERE id=$1 AND establishment_id=$2`,
      [id, est]
    );

    if (!del.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('preparations.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
