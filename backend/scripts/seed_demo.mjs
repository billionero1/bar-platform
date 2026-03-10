import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const {
  PGHOST = '127.0.0.1',
  PGPORT = '5432',
  PGDATABASE = 'appdb',
  PGUSER = 'app',
  PGPASSWORD = '',
} = process.env;

const pool = new pg.Pool({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Чистим демо-данные (если были)
    await client.query(`
      TRUNCATE TABLE preparation_components RESTART IDENTITY CASCADE;
      TRUNCATE TABLE preparations           RESTART IDENTITY CASCADE;
      TRUNCATE TABLE ingredients            RESTART IDENTITY CASCADE;
      TRUNCATE TABLE memberships            RESTART IDENTITY CASCADE;
      TRUNCATE TABLE users                  RESTART IDENTITY CASCADE;
      TRUNCATE TABLE establishments         RESTART IDENTITY CASCADE;
    `);

    // 1) Заведение
    const { rows: estRows } = await client.query(
      `INSERT INTO establishments(name) VALUES ($1) RETURNING id, name`,
      ['Малибу']
    );
    const estId = estRows[0].id;

    // 2) Менеджер
    const passwordHash = await bcrypt.hash('admin123', 10);
    const { rows: userRows } = await client.query(
      `INSERT INTO users(phone, name, surname, is_admin, password_hash)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, phone, name`,
      ['79250000000', 'Менеджер', 'Тест', true, passwordHash]
    );
    const userId = userRows[0].id;

    const staffPasswordHash = await bcrypt.hash('staff123A', 10);
    const { rows: staffRows } = await client.query(
      `INSERT INTO users(phone, name, surname, is_admin, password_hash)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, phone, name`,
      ['79250000001', 'Бармен', 'Смена', false, staffPasswordHash]
    );
    const staffId = staffRows[0].id;

    // 3) Роль менеджера
    await client.query(
      `INSERT INTO memberships(user_id, establishment_id, role)
       VALUES ($1,$2,'manager') ON CONFLICT DO NOTHING`,
      [userId, estId]
    );
    await client.query(
      `INSERT INTO memberships(user_id, establishment_id, role)
       VALUES ($1,$2,'staff') ON CONFLICT DO NOTHING`,
      [staffId, estId]
    );

    await client.query(
      `INSERT INTO learning_topics(establishment_id, category, title, summary, bullets, position, created_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [
        estId,
        'Стандарты',
        'Базовый onboarding смены',
        'Ключевые шаги открытия барной станции и санитарных проверок.',
        JSON.stringify([
          'Проверка льда и стекла перед сменой',
          'Маркировка префабов и контроль FIFO',
          'Проверка чистоты станции до сервиса',
        ]),
        10,
        userId,
      ]
    );

    await client.query(
      `INSERT INTO quiz_questions(establishment_id, question, options, correct_option, hint, position, created_by)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [
        estId,
        'Какой метод чаще всего применяют для Manhattan?',
        JSON.stringify(['Shake', 'Stir', 'Build', 'Blend']),
        1,
        'Spirit-forward коктейли без сильной аэрации обычно stir.',
        10,
        userId,
      ]
    );

    // 4) Ингредиенты
    await client.query(
      `INSERT INTO ingredients(establishment_id, name, package_volume, package_cost, unit)
       VALUES 
       ($1,'Сахар', 1.0, 67.0, 'кг'),
       ($1,'Вода',  1.0, 1.0,  'л'),
       ($1,'Облепиха с/м', 1.0, 777.0, 'кг')`,
      [estId]
    );

    // Берём ID ингредиентов
    const { rows: ingRows } = await client.query(
      `SELECT id, name FROM ingredients WHERE establishment_id=$1`,
      [estId]
    );
    const idByName = Object.fromEntries(ingRows.map(r => [r.name, r.id]));

    // 5) Заготовка: Сахарный сироп (1 л)
    const { rows: prepSyrRows } = await client.query(
      `INSERT INTO preparations(establishment_id, title, yield_value, yield_unit)
       VALUES ($1,'Сахарный сироп',1.0,'л')
       RETURNING id, title`,
      [estId]
    );
    const prepSyrId = prepSyrRows[0].id;

    // Состав сиропа: 0.5 кг сахара + 0.5 л воды
    await client.query(
      `INSERT INTO preparation_components(preparation_id, ingredient_id, amount, unit)
       VALUES
       ($1,$2,0.5,'кг'),
       ($1,$3,0.5,'л')`,
      [prepSyrId, idByName['Сахар'], idByName['Вода']]
    );

    // 6) Заготовка: Микс облепихи (0.35 кг)
    const { rows: prepMixRows } = await client.query(
      `INSERT INTO preparations(establishment_id, title, yield_value, yield_unit)
       VALUES ($1,'Микс облепихи',0.35,'кг')
       RETURNING id, title`,
      [estId]
    );
    const prepMixId = prepMixRows[0].id;

    // Состав микса: 0.2 кг «Облепиха с/м» + 0.15 кг «Сахарный сироп» (как заготовка)
    await client.query(
      `INSERT INTO preparation_components(preparation_id, ingredient_id, amount, unit)
       VALUES ($1,$2,0.2,'кг')`,
      [prepMixId, idByName['Облепиха с/м']]
    );

    await client.query(
      `INSERT INTO preparation_components(preparation_id, nested_preparation_id, amount, unit)
       VALUES ($1,$2,0.15,'кг')`,
      [prepMixId, prepSyrId]
    );

    // 7) Техкарта коктейля
    const { rows: cocktailRows } = await client.query(
      `INSERT INTO cocktails(
        establishment_id, title, category, output_value, output_unit, garnish, serving, method, photo_url, notes
      )
      VALUES (
        $1, 'Облепиховый сауэр', 'cocktail', 0.16, 'л',
        'Долька апельсина', 'Олд-фэшн + лед', 'Шейк', '',
        'Демо-карта для проверки калькуляции и интерфейса'
      )
      RETURNING id`,
      [estId]
    );
    const cocktailId = cocktailRows[0].id;

    await client.query(
      `INSERT INTO cocktail_components(cocktail_id, preparation_id, amount, unit)
       VALUES ($1, $2, 0.09, 'л')`,
      [cocktailId, prepMixId]
    );

    await client.query(
      `INSERT INTO cocktail_components(cocktail_id, ingredient_id, amount, unit)
       VALUES ($1, $2, 0.05, 'л')`,
      [cocktailId, idByName['Вода']]
    );

    // 8) Пример служебной заявки
    await client.query(
      `INSERT INTO operation_requests(establishment_id, created_by, kind, title, details, status)
       VALUES (
         $1,
         $2,
         'supply',
         'Пополнить сиропы и цитрус',
         $3::jsonb,
         'submitted'
       )`,
      [
        estId,
        staffId,
        JSON.stringify({
          items: [
            { name: 'Сахар', qty: 5, unit: 'кг' },
            { name: 'Лайм', qty: 30, unit: 'шт' },
          ],
          comment: 'На 3 смены вперед',
        }),
      ]
    );

    await client.query('COMMIT');

    console.log('✅ Seed OK');
    console.log({
      establishment_id: estId,
      manager_phone: '79250000000',
      manager_password: 'admin123',
      staff_phone: '79250000001',
      staff_password: 'staff123A',
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
