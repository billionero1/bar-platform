import 'dotenv/config';
import pg from 'pg';

// Используем PG* переменные окружения
const cfg = {
  host:     process.env.PGHOST     || '127.0.0.1',
  port:     Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'appdb',
  user:     process.env.PGUSER     || 'app',
  password: process.env.PGPASSWORD || '',
  ssl: false,
};

export const pool  = new pg.Pool(cfg);
export const query = (text, params) => pool.query(text, params);