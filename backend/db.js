// backend/db.js
import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------- PG config ----------
const cfg = {
  host:     process.env.PGHOST     || '127.0.0.1',
  port:     Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'appdb',
  user:     process.env.PGUSER     || 'app',
  password: process.env.PGPASSWORD || '',
  ssl: false,
};

export const pool = new pg.Pool(cfg);
export const query = (text, params) => pool.query(text, params);

// ---------- paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const initFile   = path.join(__dirname, 'migrations', '000_init.sql');

// ---------- required tables ----------
const REQUIRED_TABLES = [
  'users',
  'establishments',
  'memberships',
  'sessions',
  'passcodes',
  'ingredients',
  'preparations',
  'preparation_items',
];

// ---------- init helper ----------
async function ensureDatabaseStructure() {
  const auto = String(process.env.AUTO_INIT || '1').toLowerCase();
  if (auto === '0' || auto === 'false') {
    console.log('⏭  AUTO_INIT=0 — авто-инициализация миграций отключена.');
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema='public'`
    );
    const existing = new Set(rows.map(r => r.table_name));
    const missing  = REQUIRED_TABLES.filter(t => !existing.has(t));

    const sql = fs.readFileSync(initFile, 'utf8');

    if (missing.length > 0) {
      console.log(`⏳ Не хватает таблиц: ${missing.join(', ')}. Применяю migrations/000_init.sql ...`);
      await pool.query(sql);
      console.log('✅ Структура приведена к актуальной (созданы недостающие объекты).');
    } else {
      // прогоняем идемпотентную миграцию даже при полном наборе — она
      // догенерит новые колонки/индексы, если они появились в файле
      await pool.query(sql);
      console.log('✅ Проверка структуры/идемпотентный апдейт выполнены.');
    }
  } catch (e) {
    console.error('❌ Ошибка инициализации базы:', e);
  }
}

// выполнить при загрузке модуля
ensureDatabaseStructure();
