import express from 'express';
import path from 'path';
import multer from 'multer';
import { pool, query as db } from '../../db.js';
import { requirePermission } from '../../utils/permissions.js';
import {
  buildCocktailPhotoUrl,
  deleteObject,
  ensureStorageReady,
  putObject,
  randomCocktailKey,
  resolveObjectPath,
} from '../../utils/storage.js';

const r = express.Router();

const COCKTAIL_CATEGORIES = new Set(['cocktail', 'non_alcoholic', 'coffee', 'shot']);
ensureStorageReady();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('invalid_file_type'));
      return;
    }
    cb(null, true);
  },
});

function uploadPhotoMiddleware(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'file_too_large' });
    }
    if (err.message === 'invalid_file_type') {
      return res.status(400).json({ error: 'invalid_file_type' });
    }
    return res.status(400).json({ error: 'upload_failed' });
  });
}

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function asFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStorageKey(row) {
  const direct = String(row?.photo_storage_key || '').trim();
  if (direct) return direct.replace(/^\/+/, '');

  const legacyUrl = String(row?.photo_url || '').trim();
  if (legacyUrl.startsWith('/uploads/')) {
    return legacyUrl.replace(/^\/uploads\//, '').replace(/^\/+/, '');
  }

  return null;
}

function resolvePhotoUrlForRow(cocktailId, row) {
  const key = normalizeStorageKey(row);
  if (key) return buildCocktailPhotoUrl(cocktailId, true);
  const rawUrl = String(row?.photo_url || '').trim();
  return rawUrl || null;
}

function normalizePhotoInput(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      photoUrl: null,
      photoStorageKey: null,
    };
  }

  if (raw.startsWith('/uploads/')) {
    return {
      photoUrl: null,
      photoStorageKey: raw.replace(/^\/uploads\//, '').replace(/^\/+/, ''),
    };
  }

  if (raw.startsWith('/v1/cocktails/')) {
    return {
      photoUrl: null,
      photoStorageKey: null,
    };
  }

  return {
    photoUrl: raw,
    photoStorageKey: null,
  };
}

function normalizeComponents(components = []) {
  return components.map((c) => ({
    type: c?.type,
    id: asFiniteNumber(c?.id),
    amount: asFiniteNumber(c?.amount),
    unit: typeof c?.unit === 'string' ? c.unit.trim() || null : null,
  }));
}

async function calcPreparation(prepId, estId, visited = new Set()) {
  if (visited.has(prepId)) throw new Error('cycle_detected');
  visited.add(prepId);

  const prepQ = await db(
    `SELECT id, title, yield_value, yield_unit
       FROM preparations
      WHERE id=$1 AND establishment_id=$2`,
    [prepId, estId]
  );
  if (!prepQ.rowCount) return null;

  const prep = prepQ.rows[0];
  const compQ = await db(
    `SELECT ingredient_id, nested_preparation_id, amount, unit
       FROM preparation_components
      WHERE preparation_id=$1`,
    [prepId]
  );

  let cost = 0;
  for (const c of compQ.rows) {
    if (c.ingredient_id) {
      const iQ = await db(
        `SELECT package_volume, package_cost
           FROM ingredients
          WHERE id=$1 AND establishment_id=$2`,
        [c.ingredient_id, estId]
      );
      if (!iQ.rowCount) throw new Error('ingredient_not_found');
      const i = iQ.rows[0];
      const packVolume = asFiniteNumber(i.package_volume) ?? 0;
      const packCost = asFiniteNumber(i.package_cost) ?? 0;
      const unitCost = packVolume > 0 ? packCost / packVolume : 0;
      cost += unitCost * Number(c.amount || 0);
      continue;
    }

    const nested = await calcPreparation(c.nested_preparation_id, estId, new Set(visited));
    if (!nested) throw new Error('nested_preparation_not_found');
    const yieldValue = asFiniteNumber(nested.yield_value) ?? 0;
    const nestedUnitCost = yieldValue > 0 ? nested.cost / yieldValue : 0;
    cost += nestedUnitCost * Number(c.amount || 0);
  }

  return {
    id: prep.id,
    title: prep.title,
    yield_value: asFiniteNumber(prep.yield_value),
    yield_unit: prep.yield_unit,
    cost: +cost.toFixed(4),
  };
}

async function calcCocktail(cocktailId, estId) {
  const cq = await db(
    `SELECT id, title, category, output_value, output_unit, garnish, serving, method,
            photo_url, photo_storage_key, photo_content_type, notes
       FROM cocktails
      WHERE id=$1 AND establishment_id=$2`,
    [cocktailId, estId]
  );
  if (!cq.rowCount) return null;

  const cocktail = cq.rows[0];
  const compQ = await db(
    `SELECT id, ingredient_id, preparation_id, amount, unit
       FROM cocktail_components
      WHERE cocktail_id=$1
      ORDER BY id ASC`,
    [cocktailId]
  );

  const breakdown = [];
  let totalCost = 0;

  for (const c of compQ.rows) {
    const amount = asFiniteNumber(c.amount) ?? 0;
    if (c.ingredient_id) {
      const iQ = await db(
        `SELECT id, name, package_volume, package_cost, unit
           FROM ingredients
          WHERE id=$1 AND establishment_id=$2`,
        [c.ingredient_id, estId]
      );
      if (!iQ.rowCount) throw new Error('ingredient_not_found');
      const i = iQ.rows[0];
      const packVolume = asFiniteNumber(i.package_volume) ?? 0;
      const packCost = asFiniteNumber(i.package_cost) ?? 0;
      const unitCost = packVolume > 0 ? packCost / packVolume : 0;
      const partCost = unitCost * amount;
      totalCost += partCost;
      breakdown.push({
        type: 'ingredient',
        id: i.id,
        name: i.name,
        amount,
        unit: c.unit || i.unit || null,
        cost: +partCost.toFixed(4),
      });
      continue;
    }

    const nested = await calcPreparation(c.preparation_id, estId);
    if (!nested) throw new Error('nested_preparation_not_found');
    const yieldValue = asFiniteNumber(nested.yield_value) ?? 0;
    const unitCost = yieldValue > 0 ? nested.cost / yieldValue : 0;
    const partCost = unitCost * amount;
    totalCost += partCost;
    breakdown.push({
      type: 'preparation',
      id: nested.id,
      name: nested.title,
      amount,
      unit: c.unit || nested.yield_unit || null,
      cost: +partCost.toFixed(4),
    });
  }

  const outputValue = asFiniteNumber(cocktail.output_value);
  const costPerOutput = outputValue && outputValue > 0 ? +(totalCost / outputValue).toFixed(4) : null;

  return {
    id: cocktail.id,
    title: cocktail.title,
    category: cocktail.category,
    output_value: outputValue,
    output_unit: cocktail.output_unit,
    garnish: cocktail.garnish,
    serving: cocktail.serving,
    method: cocktail.method,
    photo_url: resolvePhotoUrlForRow(cocktail.id, cocktail),
    notes: cocktail.notes,
    total_cost: +totalCost.toFixed(4),
    cost_per_output: costPerOutput,
    breakdown,
  };
}

r.get('/', requirePermission('cocktails:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const q = await db(
      `SELECT id, title, category, output_value, output_unit, garnish, serving, photo_url, photo_storage_key
         FROM cocktails
        WHERE establishment_id=$1
          AND is_active=true
        ORDER BY title`,
      [est]
    );

    const rows = [];
    for (const c of q.rows) {
      const calc = await calcCocktail(c.id, est).catch(() => null);
      rows.push({
        id: c.id,
        title: c.title,
        category: c.category,
        output_value: asFiniteNumber(c.output_value),
        output_unit: c.output_unit,
        garnish: c.garnish,
        serving: c.serving,
        photo_url: resolvePhotoUrlForRow(c.id, c),
        total_cost: calc?.total_cost ?? null,
        cost_per_output: calc?.cost_per_output ?? null,
      });
    }

    return res.json(rows);
  } catch (e) {
    console.error('cocktails.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/', requirePermission('cocktails:create'), async (req, res) => {
  const client = await pool.connect();
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'cocktail').trim();
    const outputValue = req.body?.output_value ?? null;
    const outputUnit = req.body?.output_unit ?? null;
    const garnish = req.body?.garnish ?? null;
    const serving = req.body?.serving ?? null;
    const method = req.body?.method ?? null;
    const photoInput = normalizePhotoInput(req.body?.photo_url ?? null);
    const notes = req.body?.notes ?? null;
    const normalizedComponents = normalizeComponents(req.body?.components || []);

    if (!title || normalizedComponents.length === 0) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
    if (!COCKTAIL_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'invalid_category' });
    }

    for (const c of normalizedComponents) {
      const validType = c.type === 'ingredient' || c.type === 'preparation';
      if (!validType || c.id === null || c.amount === null || c.amount <= 0) {
        return res.status(400).json({ error: 'invalid_component' });
      }
    }

    await client.query('BEGIN');

    const ins = await client.query(
      `INSERT INTO cocktails(
        establishment_id, title, category, output_value, output_unit, garnish, serving, method,
        photo_url, photo_storage_key, photo_content_type, notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        est,
        title,
        category,
        outputValue,
        outputUnit,
        garnish,
        serving,
        method,
        photoInput.photoUrl,
        photoInput.photoStorageKey,
        null,
        notes,
      ]
    );
    const cocktailId = ins.rows[0].id;

    const params = [cocktailId];
    const values = [];
    normalizedComponents.forEach((c, idx) => {
      const base = idx * 4;
      values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      params.push(
        c.type === 'ingredient' ? c.id : null,
        c.type === 'preparation' ? c.id : null,
        c.amount,
        c.unit
      );
    });

    await client.query(
      `INSERT INTO cocktail_components(cocktail_id, ingredient_id, preparation_id, amount, unit)
       VALUES ${values.join(',')}`,
      params
    );

    await client.query('COMMIT');
    return res.status(201).json({ id: cocktailId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('cocktails.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

r.get('/:id', requirePermission('cocktails:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const calc = await calcCocktail(id, est);
    if (!calc) return res.sendStatus(404);
    return res.json(calc);
  } catch (e) {
    console.error('cocktails.getById error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.get('/:id/calc', requirePermission('cocktails:calc'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const calc = await calcCocktail(id, est);
    if (!calc) return res.sendStatus(404);

    const output = req.query.output ? asFiniteNumber(req.query.output) : null;
    if (output && (calc.output_value ?? 0) > 0) {
      const ratio = output / Number(calc.output_value);
      return res.json({
        ...calc,
        requested_output: output,
        cost_for_requested_output: +(calc.total_cost * ratio).toFixed(4),
      });
    }

    return res.json(calc);
  } catch (e) {
    console.error('cocktails.calc error', e);
    return res.status(400).json({ error: 'calc_failed' });
  }
});

r.put('/:id', requirePermission('cocktails:update'), async (req, res) => {
  const client = await pool.connect();
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'cocktail').trim();
    const outputValue = req.body?.output_value ?? null;
    const outputUnit = req.body?.output_unit ?? null;
    const garnish = req.body?.garnish ?? null;
    const serving = req.body?.serving ?? null;
    const method = req.body?.method ?? null;
    const photoInput = normalizePhotoInput(req.body?.photo_url ?? null);
    const notes = req.body?.notes ?? null;
    const hasComponents = Array.isArray(req.body?.components);
    const normalizedComponents = hasComponents
      ? normalizeComponents(req.body?.components || [])
      : [];

    if (!title) return res.status(400).json({ error: 'title_required' });
    if (!COCKTAIL_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'invalid_category' });
    }

    if (hasComponents) {
      if (!normalizedComponents.length) return res.status(400).json({ error: 'components_required' });
      for (const c of normalizedComponents) {
        const validType = c.type === 'ingredient' || c.type === 'preparation';
        if (!validType || c.id === null || c.amount === null || c.amount <= 0) {
          return res.status(400).json({ error: 'invalid_component' });
        }
      }
    }

    await client.query('BEGIN');

    const upd = await client.query(
      `UPDATE cocktails
          SET title=$1,
              category=$2,
              output_value=$3,
              output_unit=$4,
              garnish=$5,
              serving=$6,
              method=$7,
              photo_url=$8,
              photo_storage_key=$9,
              photo_content_type=$10,
              notes=$11
        WHERE id=$12 AND establishment_id=$13`,
      [
        title,
        category,
        outputValue,
        outputUnit,
        garnish,
        serving,
        method,
        photoInput.photoUrl,
        photoInput.photoStorageKey,
        null,
        notes,
        id,
        est,
      ]
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      return res.sendStatus(404);
    }

    if (hasComponents) {
      await client.query(`DELETE FROM cocktail_components WHERE cocktail_id=$1`, [id]);

      const params = [id];
      const values = [];
      normalizedComponents.forEach((c, idx) => {
        const base = idx * 4;
        values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
        params.push(
          c.type === 'ingredient' ? c.id : null,
          c.type === 'preparation' ? c.id : null,
          c.amount,
          c.unit
        );
      });

      await client.query(
        `INSERT INTO cocktail_components(cocktail_id, ingredient_id, preparation_id, amount, unit)
         VALUES ${values.join(',')}`,
        params
      );
    }

    await client.query('COMMIT');
    return res.sendStatus(200);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('cocktails.put error', e);
    return res.status(500).json({ error: 'internal_error' });
  } finally {
    client.release();
  }
});

r.get('/:id/photo', requirePermission('cocktails:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const q = await db(
      `SELECT id, photo_storage_key, photo_content_type, photo_url
         FROM cocktails
        WHERE id=$1 AND establishment_id=$2`,
      [id, est]
    );
    if (!q.rowCount) return res.sendStatus(404);

    const row = q.rows[0];
    const key = normalizeStorageKey(row);
    if (!key) return res.sendStatus(404);

    const filePath = await resolveObjectPath(key);
    if (!filePath) return res.sendStatus(404);

    const explicitType = String(row.photo_content_type || '').trim();
    const ext = path.extname(filePath).toLowerCase();
    const inferredType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg';
    const contentType = explicitType || inferredType;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);
  } catch (e) {
    console.error('cocktails.photo.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/:id/photo', requirePermission('cocktails:upload_photo'), uploadPhotoMiddleware, async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!req.file) return res.status(400).json({ error: 'file_required' });

    const prevQ = await db(
      `SELECT id, photo_storage_key, photo_url
         FROM cocktails
        WHERE id=$1 AND establishment_id=$2`,
      [id, est]
    );
    if (!prevQ.rowCount) return res.sendStatus(404);
    const prev = prevQ.rows[0];
    const prevKey = normalizeStorageKey(prev);

    const nextKey = randomCocktailKey(req.file.originalname);
    await putObject(nextKey, req.file.buffer);

    const upd = await db(
      `UPDATE cocktails
          SET photo_storage_key=$1,
              photo_content_type=$2,
              photo_url=NULL
        WHERE id=$3 AND establishment_id=$4`,
      [nextKey, req.file.mimetype || null, id, est]
    );
    if (!upd.rowCount) {
      await deleteObject(nextKey).catch(() => {});
      return res.sendStatus(404);
    }

    if (prevKey && prevKey !== nextKey) {
      await deleteObject(prevKey).catch(() => {});
    }

    return res.json({ photo_url: buildCocktailPhotoUrl(id, true) });
  } catch (e) {
    console.error('cocktails.photo error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/:id', requirePermission('cocktails:delete'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const del = await db(
      `UPDATE cocktails
          SET is_active=false
        WHERE id=$1 AND establishment_id=$2
        RETURNING photo_storage_key, photo_url`,
      [id, est]
    );
    if (!del.rowCount) return res.sendStatus(404);

    const key = normalizeStorageKey(del.rows[0]);
    if (key) {
      await deleteObject(key).catch(() => {});
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error('cocktails.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
