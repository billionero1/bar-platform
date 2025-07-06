/**************************************************************************
 *  backend/index.js                               Node 18+  •  ES-modules
 *  ───────────────────────────────────────────────────────────────────────
 *  • Заведения  /  пользователи  /  бары-аутлеты
 *  • JWT-аутентификация    (30 дней)
 *  • Команда (инвайт, смена пароля)                     – как было
 *  • Ингредиенты  (CRUD, привязка к establishment_id)   – НОВОЕ
 **************************************************************************/

import express  from 'express';
import cors     from 'cors';
import pg       from 'pg';
import bcrypt   from 'bcrypt';
import jwt      from 'jsonwebtoken';
import preparationsRouter from './routes/preparations.js';
import ingredientsRouter from './routes/ingredientsRouter.js';
import teamRouter from './routes/teamRouter.js';
import dotenv from 'dotenv';
dotenv.config();






const app = express();
app.use(cors());
app.use(express.json());
app.use('/team', teamRouter);

/* ———————————————————————————  CONFIG  —————————————————————————— */
const JWT_SECRET = 'supersecretkey';         // вынести в .env на проде
const JWT_TTL    = '30d';


const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const db = {
  query: (text, params) => pool.query(text, params),
};

/* ——————————————————————  DB INIT  ——————————————————————— */
await db.query(`
CREATE TABLE IF NOT EXISTS establishments (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  phone            TEXT UNIQUE,
  password_hash    TEXT,
  name             TEXT,
  is_admin         BOOLEAN DEFAULT false,
  must_change_pw   BOOLEAN DEFAULT false
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS outlets (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  name             TEXT NOT NULL
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS ingredients (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  name             TEXT NOT NULL,
  package_volume   REAL,
  package_cost     REAL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

await db.query(`
CREATE TABLE IF NOT EXISTS preparations (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id),
  title            TEXT NOT NULL,
  yield_value      REAL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);


try {
  await db.query(`
  CREATE TABLE IF NOT EXISTS preparation_ingredients (
    id              SERIAL PRIMARY KEY,
    preparation_id  INTEGER NOT NULL REFERENCES preparations(id),
    ingredient_id   INTEGER NOT NULL,
    is_preparation  BOOLEAN DEFAULT false,
    amount          REAL NOT NULL
  );

  `);
  
} catch (err) {
  
}


/* ———————————————————  HELPERS  ————————————————————— */
const normPhone = p => p.replace(/\D/g, '').replace(/^8/, '7');
const hashPw    = p => bcrypt.hash(p, 10);
const cmpPw     = (p, h) => bcrypt.compare(p, h);
const signJWT   = (u) => jwt.sign(u, JWT_SECRET, { expiresIn: JWT_TTL });

/* —————————————  auth-middleware  ————————————— */
function auth(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.sendStatus(401);
  const token = hdr.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.sendStatus(403);
    req.user = payload; // { id, establishment_id, is_admin }
    next();
  });
}

/* ╔══════════════════════ AUTH / TEAM ══════════════════════╗ */

/* 1. Регистрация заведения + первого админа-менеджера */
app.post('/auth/register-manager', async (req, res) => {
  const { establishmentName, name, phone, password } = req.body;
  if (!establishmentName || !phone || password.length < 6)
    return res.status(400).json({ error: 'Неверные данные' });

  const p = normPhone(phone);

  const userExists = await db.query('SELECT 1 FROM users WHERE phone = $1', [p]);
  if (userExists.rowCount > 0)
    return res.status(400).json({ error: 'Телефон уже зарегистрирован' });

  // 1. создаём заведение
  const estRes = await db.query(
    'INSERT INTO establishments (name) VALUES ($1) RETURNING id',
    [establishmentName]
  );
  const estId = estRes.rows[0].id;

  // 2. создаём менеджера
  const pwHash = await hashPw(password);
  const userRes = await db.query(
    `INSERT INTO users
       (establishment_id, phone, password_hash, is_admin, name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [estId, p, pwHash, true, name]
  );
  const uid = userRes.rows[0].id;

  // 3. создаём дефолтный бар
  await db.query(
    'INSERT INTO outlets (establishment_id, name) VALUES ($1, $2)',
    [estId, 'Main bar']
  );

  // 4. формируем токен
  const token = signJWT({
    id: uid,
    establishment_id: estId,
    is_admin: true,
    name,
    establishment_name: establishmentName
  });

  res.json({ token, isAdmin: true });
});



/* 5. Логин */
app.post('/auth/login', async (req, res) => {
  const p = normPhone(req.body.phone);
  const result = await db.query('SELECT * FROM users WHERE phone = $1', [p]);
  const user = result.rows[0];

  if (!user) return res.status(400).json({ error: 'Не найдено' });
  if (user.must_change_pw) return res.status(403).json({ mustChange: true });

  const ok = await cmpPw(req.body.password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Пароль' });

  const estRes = await db.query('SELECT name FROM establishments WHERE id = $1', [user.establishment_id]);

  const token = signJWT({
    id: user.id,
    establishment_id: user.establishment_id,
    is_admin: user.is_admin,
    name: user.name,
    establishment_name: estRes.rows[0]?.name ?? ''
  });

  res.json({ token, isAdmin: !!user.is_admin });
});


/* 6. Профиль / Моя команда */
app.get('/auth/me', auth, async (req, res) => {
  const result = await db.query(
    `SELECT id, phone, name, is_admin AS "isAdmin"
     FROM users
     WHERE id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

app.get('/team', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  const result = await db.query(
    `SELECT id, name, phone, must_change_pw AS "mustChangePw"
     FROM users
     WHERE establishment_id = $1 AND id <> $2`,
    [req.user.establishment_id, req.user.id]
  );
  res.json(result.rows);
});


/* ╔═══════════════════════ INGREDIENTS ═════════════════════╗ */

app.use('/ingredients', ingredientsRouter);

function enrichIngredient(row) {
  const v = Number(row.packVolume);
  const c = Number(row.packCost);
  row.costPerUnit = v > 0 && c > 0 ? +(c / v).toFixed(4) : null;
  return row;
}

/* 1. Получить список (видят все пользователи) */
app.get('/ingredients', auth, async (req, res) => {
  const { rows: ingredients } = await db.query(
    `SELECT id,
            name,
            package_volume AS "packVolume",
            package_unit   AS "volumeUnit",
            package_cost   AS "packCost"
     FROM ingredients
     WHERE establishment_id = $1
     ORDER BY name`,
    [req.user.establishment_id]
  );

  const { rows: rawPreps } = await db.query(
    `SELECT id, title AS name, yield_value AS "packVolume", 'preparation' AS type
 FROM preparations
 WHERE establishment_id = $1
 ORDER BY title`,
    [req.user.establishment_id]
  );

  const enrichedIngredients = ingredients.map(row => ({
    ...enrichIngredient(row),
    type: 'ingredient',
  }));

  const enrichedPreparations = [];

  for (const prep of rawPreps) {
    const { rows: ingredients } = await db.query(
      `SELECT
  pi.amount, pi.unit, pi.is_preparation,
  CASE
    WHEN pi.is_preparation = TRUE THEN p.yield_value
    ELSE i.package_volume
  END AS "packVolume",
  CASE
    WHEN pi.is_preparation = TRUE THEN (
      SELECT SUM(ppi.amount *
        CASE
          WHEN ppi.unit = 'ml' OR ppi.unit = 'g' THEN 1
          WHEN ppi.unit = 'l' OR ppi.unit = 'kg' THEN 1000
          ELSE 1
        END *
        CASE
          WHEN ppi.is_preparation = TRUE THEN 0
          ELSE (SELECT package_cost / package_volume FROM ingredients WHERE id = ppi.ingredient_id)
        END
      )
      FROM preparation_ingredients ppi
      WHERE ppi.preparation_id = pi.ingredient_id
    )
    ELSE i.package_cost
  END AS "packCost"
FROM preparation_ingredients pi
LEFT JOIN ingredients i ON pi.ingredient_id = i.id AND pi.is_preparation = FALSE
LEFT JOIN preparations p ON pi.ingredient_id = p.id AND pi.is_preparation = TRUE
WHERE pi.preparation_id = $1
`,
      [prep.id]
    );

    let totalCost = 0;

    for (const ing of ingredients) {
      const amount = parseFloat(ing.amount);
      const volume = parseFloat(ing.packVolume);
      const cost = parseFloat(ing.packCost);

      if (!amount || !volume || !cost || isNaN(cost)) continue;

    if (!isNaN(cost) && volume > 0 && amount > 0) {
      totalCost += (cost / volume) * amount;
    }

    }

    const packVolume = prep.packVolume ?? 1;
    const costPerUnit = packVolume > 0 ? totalCost / packVolume : null;

    enrichedPreparations.push({
      id: prep.id,
      name: prep.name || prep.title,
      packVolume: prep.packVolume,
      packCost: totalCost,
      costPerUnit: costPerUnit ? +costPerUnit.toFixed(4) : null,
      type: 'preparation',
    });

  }

  res.json([...enrichedIngredients, ...enrichedPreparations]);
});


/* 2. Добавить ингредиент (только админ) */
app.post('/ingredients', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  const { name, packVolume, packCost } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'name' });

  const { rows } = await db.query(
    `INSERT INTO ingredients
      (establishment_id, name, package_volume, package_cost)
    VALUES ($1, $2, $3, $4)`,
    [
      req.user.establishment_id,
      name.trim(),
      packVolume ?? null,
      packCost ?? null,
    ]
  );


  const id = rows[0].id;

    const { rows: result } = await db.query(
    `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost"
    FROM ingredients WHERE id = $1`,
    [id]
  );

  res.status(201).json({
    ...enrichIngredient(result[0]),
    type: 'ingredient',
  });


});


/* 3. Обновить ингредиент (только админ) */
app.put('/ingredients/:id', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  const id = +req.params.id;

  const { rows: exists } = await db.query(
    `SELECT 1 FROM ingredients WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (exists.length === 0) return res.sendStatus(404);

  const { name, packVolume, packCost } = req.body;


  await db.query(
    `UPDATE ingredients SET
        name = COALESCE($1, name),
        package_volume = COALESCE($2, package_volume),
        package_cost = COALESCE($3, package_cost)
    WHERE id = $4`,
    [name, packVolume, packCost, id]
  );


  const { rows: result } = await db.query(
    `SELECT id, name, package_volume AS "packVolume", package_cost AS "packCost"
    FROM ingredients WHERE id = $1`,
    [id]
  );


  res.json({
  ...enrichIngredient(result[0]),
  type: 'ingredient',
  });

});


/* 4. Удалить ингредиент (только админ) */
app.delete('/ingredients/:id', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);
  const id = +req.params.id;

  const result = await db.query(
    `DELETE FROM ingredients
     WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );

  if (result.rowCount === 0) return res.sendStatus(404);
  res.sendStatus(204);
});




/* ╔═══════════════════════ PREPARATIONS ════════════════════╗ */

app.use('/preparations', preparationsRouter);

app.post('/preparations', auth, async (req, res) => {
  const { title, yieldValue, ingredients, altVolume } = req.body;

  if (
    !title?.trim() ||
    !yieldValue ||
    !Array.isArray(ingredients) ||
    ingredients.length === 0
  ) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const { rows } = await db.query(
    `INSERT INTO preparations (establishment_id, title, yield_value, alt_volume)
    VALUES ($1, $2, $3, $4)
    RETURNING id`,
    [
      req.user.establishment_id,
      title.trim(),
      parseFloat(yieldValue),
      altVolume !== undefined && altVolume !== null && altVolume !== '' ? parseFloat(altVolume) : null
    ]
  );



  const prepId = rows[0].id;

  for (const entry of ingredients) {
    if (
      !entry.id ||
      typeof entry.id !== 'number' ||
      typeof entry.amount !== 'string' ||
      (entry.type !== 'ingredient' && entry.type !== 'preparation')
    ) {
      console.error('⚠️ Пропущен некорректный элемент:', entry);
      continue;
    }

    const isPreparation = entry.type === 'preparation';
    const table = isPreparation ? 'preparations' : 'ingredients';

    const { rows: valid } = await db.query(
      `SELECT id FROM ${table} WHERE id = $1 AND establishment_id = $2`,
      [entry.id, req.user.establishment_id]
    );

    if (!valid.length) {
      console.error(`❌ ${table} с id=${entry.id} не найден`);
      continue;
    }

    await db.query(
      `INSERT INTO preparation_ingredients
      (preparation_id, ingredient_id, is_preparation, amount)
      VALUES ($1, $2, $3, $4)`,
      [prepId, entry.id, isPreparation, parseFloat(entry.amount)]
    );

  }

  console.log('✅ Успешно создана заготовка:', title, 'ID:', prepId);
  // Дополнительно подтягиваем name для каждого ингредиента
  const enrichedIngredients = [];

  for (const ing of ingredients) {
    const isPreparation = ing.type === 'preparation';
    const table = isPreparation ? 'preparations' : 'ingredients';

    const { rows } = await db.query(
      `SELECT ${isPreparation ? 'title' : 'name'} AS name FROM ${table} WHERE id = $1`,
      [ing.id]
    );

    enrichedIngredients.push({
      id: ing.id,
      name: rows[0]?.name || '(неизвестно)',
      amount: ing.amount,
      type: ing.type,
    });
  }

  res.status(201).json({
    id: prepId,
    title: title.trim(),
    yieldValue: parseFloat(yieldValue),
    ingredients: enrichedIngredients,
    type: 'preparation'
  });


});


app.get('/preparations/:id', auth, async (req, res) => {
  const id = +req.params.id;

  const { rows: prepRows } = await db.query(
    `SELECT id, title, yield_value, alt_volume
    FROM preparations
    WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );


  if (!prepRows.length) return res.sendStatus(404);
  const prep = prepRows[0];

  const { rows: ingredients } = await db.query(`
    SELECT
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

  // === считаем себестоимость ===
  let totalCost = 0;

  // Массив ингредиентов с полем costPerUnit!
  const ingredientsWithCost = [];

  for (const ing of ingredients) {
    let ingCostPerUnit = null;
    if (!ing.isPreparation) {
      const { rows: [data] } = await db.query(
        `SELECT package_cost, package_volume FROM ingredients WHERE id = $1`,
        [ing.id]
      );
      if (data && data.package_cost && data.package_volume) {
        ingCostPerUnit = Number(data.package_cost) / Number(data.package_volume);
        totalCost += Number(ing.amount) * ingCostPerUnit;
      }
    } else {
      // вложенная заготовка (только 1 уровень)
      const { rows: [subPrep] } = await db.query(
        `SELECT yield_value FROM preparations WHERE id = $1`,
        [ing.id]
      );
      if (subPrep && subPrep.yield_value > 0) {
        const { rows: subIngredients } = await db.query(
          `SELECT
            pi.ingredient_id as id,
            pi.is_preparation,
            pi.amount
          FROM preparation_ingredients pi
          WHERE pi.preparation_id = $1`,
          [ing.id]
        );
        let subTotal = 0;
        for (const sub of subIngredients) {
          if (!sub.is_preparation) {
            const { rows: [subData] } = await db.query(
              `SELECT package_cost, package_volume FROM ingredients WHERE id = $1`,
              [sub.id]
            );
            if (subData && subData.package_cost && subData.package_volume) {
              subTotal += Number(sub.amount) * (Number(subData.package_cost) / Number(subData.package_volume));
            }
          }
        }
        ingCostPerUnit = subTotal / Number(subPrep.yield_value);
        totalCost += Number(ing.amount) * ingCostPerUnit;
      }
    }

    ingredientsWithCost.push({
      id: ing.id,
      name: ing.name,
      amount: ing.amount.toString(),
      type: ing.isPreparation ? 'preparation' : 'ingredient',
      costPerUnit: ingCostPerUnit,
    });
  }

  let costPerUnit = 0;
  if (prep.yield_value > 0) {
    costPerUnit = totalCost / Number(prep.yield_value);
  }

  res.json({
    id: prep.id,
    title: prep.title,
    yieldValue: prep.yield_value,
    altVolume: prep.alt_volume, // ← добавь эту строку!
    ingredients: ingredientsWithCost,
    costPerUnit: isFinite(costPerUnit) ? costPerUnit : null
  });

});







app.put('/preparations/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { title, yieldValue, ingredients, altVolume } = req.body;


  if (
    !title?.trim() ||
    !yieldValue ||
    !Array.isArray(ingredients) ||
    ingredients.length === 0
  ) {
    return res.status(400).json({ error: 'Неверные данные' });
  }


  const { rows: existing } = await db.query(
    `SELECT id FROM preparations WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!existing.length) return res.status(404).json({ error: 'Заготовка не найдена' });

  await db.query(
    `UPDATE preparations
    SET title = $1, yield_value = $2, alt_volume = $3
    WHERE id = $4`,
    [
      title.trim(),
      parseFloat(yieldValue),
      altVolume !== undefined && altVolume !== null && altVolume !== '' ? parseFloat(altVolume) : null,
      id
    ]
  );



  await db.query(`DELETE FROM preparation_ingredients WHERE preparation_id = $1`, [id]);

  for (const entry of ingredients) {
    if (
      !entry.id ||
      typeof entry.id !== 'number' ||
      typeof entry.amount !== 'string' ||
      (entry.type !== 'ingredient' && entry.type !== 'preparation')
    ) {
      console.warn('⚠️ Пропущен некорректный элемент:', entry);
      continue;
    }

    const isPreparation = entry.type === 'preparation';
    const targetTable = isPreparation ? 'preparations' : 'ingredients';

    const { rows: source } = await db.query(
      `SELECT id FROM ${targetTable} WHERE id = $1 AND establishment_id = $2`,
      [entry.id, req.user.establishment_id]
    );

    if (!source.length) {
      console.warn(`❌ ${targetTable} с id=${entry.id} не найден`);
      continue;
    }

  await db.query(
    `INSERT INTO preparation_ingredients
    (preparation_id, ingredient_id, is_preparation, amount)
    VALUES ($1, $2, $3, $4)`,
    [id, entry.id, isPreparation, parseFloat(entry.amount)]
  );

  }

  console.log('✅ Успешно обновлена заготовка:', title);
  res.json({ success: true });
});


app.delete('/preparations/:id', auth, async (req, res) => {
  const id = +req.params.id;

  const { rows: prep } = await db.query(
    `SELECT id FROM preparations WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );

  if (!prep.length) return res.status(404).json({ error: 'Заготовка не найдена' });

  await db.query(`DELETE FROM preparation_ingredients WHERE preparation_id = $1`, [id]);
  await db.query(`DELETE FROM preparations WHERE id = $1`, [id]);

  res.json({ success: true });
});




export { db };

/* ———————————————————  SERVER START  —————————————————— */
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✔  API  http://localhost:${PORT}`);
});
