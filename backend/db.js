import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const cfg = {
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'appdb',
  user: process.env.PGUSER || 'app',
  password: process.env.PGPASSWORD || '',
  ssl: process.env.PGSSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export const pool = new pg.Pool(cfg);

export async function query(text, params) {
  const started = Date.now();
  try {
    const result = await pool.query(text, params);
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'development') {
      const sqlPreview = String(text || '').trim().split(/\s+/).slice(0, 6).join(' ');
      const duration = Date.now() - started;
      console.log('[DB] query', { sql: sqlPreview, duration_ms: duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    const duration = Date.now() - started;
    console.error('[DB] query failed', {
      duration_ms: duration,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function healthCheck() {
  try {
    const started = Date.now();
    const result = await pool.query('SELECT 1 as health, NOW() as timestamp');
    const duration = Date.now() - started;

    return {
      status: 'healthy',
      responseTime: `${duration}ms`,
      timestamp: result.rows[0].timestamp,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function migrationChecksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function isDestructiveMigration(filename) {
  return /(?:^|_)reset(?:_|$)/i.test(filename);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const allowDestructive = ['1', 'true'].includes(
    String(process.env.ALLOW_DESTRUCTIVE_MIGRATIONS || '').toLowerCase()
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  return files.filter((name) => {
    if (!isDestructiveMigration(name)) return true;
    if (allowDestructive) return true;
    console.warn(
      `[DB] skip destructive migration "${name}" (set ALLOW_DESTRUCTIVE_MIGRATIONS=1 to allow)`
    );
    return false;
  });
}

async function ensureSchemaMigrationsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
  );
}

async function runMigrationFile(version, sql, checksum) {
  const client = await pool.connect();
  try {
    if (/create\s+index\s+concurrently/i.test(sql)) {
      // CREATE INDEX CONCURRENTLY нельзя выполнять одним multi-statement запросом.
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/g)
        .map((item) => item.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await client.query(statement);
      }
    } else {
      await client.query(sql);
    }
    await client.query(
      `INSERT INTO schema_migrations(version, checksum)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [version, checksum]
    );
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  const auto = String(process.env.AUTO_INIT || '1').toLowerCase();
  if (auto === '0' || auto === 'false') {
    console.log('[DB] AUTO_INIT=0, skipping migrations');
    return;
  }

  await ensureSchemaMigrationsTable();

  const appliedQ = await query(`SELECT version, checksum FROM schema_migrations`);
  const applied = new Map(appliedQ.rows.map((row) => [row.version, row.checksum]));

  const files = listMigrationFiles();
  for (const version of files) {
    const filePath = path.join(MIGRATIONS_DIR, version);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = migrationChecksum(sql);

    const previousChecksum = applied.get(version);
    if (previousChecksum) {
      if (previousChecksum !== checksum) {
        throw new Error(`Migration checksum mismatch for ${version}`);
      }
      continue;
    }

    console.log(`[DB] applying migration ${version}`);
    await runMigrationFile(version, sql, checksum);
    console.log(`[DB] applied migration ${version}`);
  }
}

let initPromise = null;

export function initializeDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      await runMigrations();
      const status = await healthCheck();
      if (status.status !== 'healthy') {
        throw new Error(`Database health check failed: ${status.error || 'unknown_error'}`);
      }
      return status;
    })();
  }
  return initPromise;
}

export async function closeDatabasePool() {
  await pool.end();
}
