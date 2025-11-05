import 'dotenv/config';
import pg from 'pg';

const { DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER } = process.env;
const DB_PASSWORD = String(process.env.DB_PASSWORD ?? ''); // строго строка

// Local = без SSL, внешние хосты = SSL (но не мешать localhost)
const isLocalUrl = DATABASE_URL ? /localhost|127\.0\.0\.1/.test(DATABASE_URL) : false;

const configFromUrl = DATABASE_URL
  ? {
      connectionString: DATABASE_URL,
      ssl: isLocalUrl ? false : { rejectUnauthorized: false }
    }
  : {
      host: DB_HOST || 'localhost',
      port: Number(DB_PORT || 5432),
      database: DB_NAME || 'appdb',
      user: DB_USER || 'appuser',
      password: DB_PASSWORD,
      ssl: false
    };

export const pool = new pg.Pool(configFromUrl);
