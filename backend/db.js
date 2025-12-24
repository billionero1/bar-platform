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
  ssl: process.env.PGSSL ? { rejectUnauthorized: false } : false,
  max: 20, // максимальное количество клиентов в пуле
  idleTimeoutMillis: 30000, // как долго клиент может простаивать перед закрытием
  connectionTimeoutMillis: 2000, // время ожидания подключения
};

export const pool = new pg.Pool(cfg);

// Обёртка с логированием запросов
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] Query executed:`, {
        text: text.split(' ').slice(0, 4).join(' ') + '...',
        params: params || 'none',
        duration: `${duration}ms`,
        rows: result.rowCount
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[DB] Query failed after ${duration}ms:`, {
      text: text.split(' ').slice(0, 4).join(' ') + '...',
      params: params || 'none',
      error: error.message
    });
    throw error;
  }
};

// ---------- Health check ----------
export async function healthCheck() {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT 1 as health, NOW() as timestamp');
    const duration = Date.now() - start;
    
    const healthStatus = {
      status: 'healthy',
      database: 'connected',
      responseTime: `${duration}ms`,
      timestamp: result.rows[0].timestamp,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
    
    console.log(`[DB] Health check: ${healthStatus.status} (${healthStatus.responseTime})`);
    return healthStatus;
  } catch (error) {
    const healthStatus = {
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    console.error(`[DB] Health check failed:`, healthStatus);
    return healthStatus;
  }
}

// Периодическая проверка здоровья БД
if (process.env.NODE_ENV !== 'test') {
  setInterval(async () => {
    try {
      await healthCheck();
    } catch (error) {
      console.error('[DB] Periodic health check failed:', error);
    }
  }, 5 * 60 * 1000); // Каждые 5 минут
}

// ---------- paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

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

// ---------- required migrations ----------
const REQUIRED_MIGRATIONS = [
  '000_init_tables.sql',
  '001_init_indexes.sql'
];

// ---------- init helper ----------
async function ensureDatabaseStructure() {
  const auto = String(process.env.AUTO_INIT || '1').toLowerCase();
  if (auto === '0' || auto === 'false') {
    console.log('⏭  AUTO_INIT=0 — авто-инициализация миграций отключена.');
    return;
  }

  try {
    console.log('🔍 Проверка структуры базы данных...');
    
    const { rows } = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema='public'`
    );
    const existing = new Set(rows.map(r => r.table_name));
    const missing = REQUIRED_TABLES.filter(t => !existing.has(t));

    if (missing.length > 0) {
      console.log(`⏳ Не хватает таблиц: ${missing.join(', ')}. Применяю миграции...`);
      
      // Применяем миграции по порядку
      for (const migrationFile of REQUIRED_MIGRATIONS) {
        const migrationPath = path.join(__dirname, 'migrations', migrationFile);
        
        if (!fs.existsSync(migrationPath)) {
          console.error(`❌ Файл миграции не найден: ${migrationPath}`);
          continue;
        }
        
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        console.log(`📦 Применяю ${migrationFile}...`);
        
        if (migrationFile === '000_init_tables.sql') {
          // Таблицы создаем в транзакции
          try {
            await pool.query(sql);
            console.log(`✅ ${migrationFile} применен`);
            
            // Ждем немного чтобы транзакция точно завершилась
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (migrationError) {
            console.error(`❌ Ошибка применения миграции ${migrationFile}:`, migrationError.message);
            throw migrationError;
          }
        } else if (migrationFile === '001_init_indexes.sql') {
          // Индексы создаем после коммита таблиц
          try {
            const client = await pool.connect();
            try {
              console.log('🔄 Создаю индексы...');
              
              // Разделяем SQL на отдельные запросы и выполняем их по очереди
              const queries = sql.split(';')
                .filter(query => query.trim().length > 0)
                .map(query => query.trim() + ';');
              
              for (const query of queries) {
                try {
                  await client.query(query);
                  // Извлекаем имя индекса для логирования
                  const indexNameMatch = query.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS (\w+)/);
                  const indexName = indexNameMatch ? indexNameMatch[1] : 'unknown';
                  console.log(`✅ Индекс создан: ${indexName}`);
                } catch (indexError) {
                  // Игнорируем ошибки "уже существует", логируем остальные
                  if (indexError.message.includes('already exists') || 
                      indexError.message.includes('уже существует') ||
                      indexError.message.includes('relation') && indexError.message.includes('does not exist')) {
                    console.log(`ℹ️  Пропускаем индекс: ${indexError.message.split('\n')[0]}`);
                  } else {
                    console.error(`❌ Ошибка создания индекса: ${indexError.message}`);
                  }
                }
              }
            } finally {
              client.release();
            }
          } catch (error) {
            console.error(`❌ Общая ошибка при создании индексов:`, error.message);
          }
        }
      }
      
      console.log('✅ Все миграции применены успешно');
    } else {
      console.log('✅ Все таблицы существуют, проверка структуры завершена');
      
      // Проверяем и досоздаем индексы если нужно (идемпотентно)
      try {
        const indexesMigrationPath = path.join(__dirname, 'migrations', '001_init_indexes.sql');
        
        if (fs.existsSync(indexesMigrationPath)) {
          const sql = fs.readFileSync(indexesMigrationPath, 'utf8');
          
          console.log('🔍 Проверяем CONCURRENTLY индексы...');
          const client = await pool.connect();
          try {
            // Разделяем SQL на отдельные запросы для лучшего контроля
            const queries = sql.split(';')
              .filter(query => query.trim().length > 0)
              .map(query => query.trim() + ';');
            
            for (const query of queries) {
              try {
                await client.query(query);
              } catch (indexError) {
                // Игнорируем ошибки "уже существует"
                if (!indexError.message.includes('already exists') && 
                    !indexError.message.includes('уже существует')) {
                  console.log(`ℹ️  Ошибка при проверке индекса: ${indexError.message.split('\n')[0]}`);
                }
              }
            }
            console.log('✅ CONCURRENTLY индексы проверены/созданы');
          } catch (indexError) {
            console.log('ℹ️  Индексы уже существуют или ошибка (но это нормально):', indexError.message);
          } finally {
            client.release();
          }
        }
      } catch (e) {
        console.log('ℹ️  Пропускаем проверку индексов:', e.message);
      }
    }
    
    // Проверяем здоровье БД после инициализации
    await healthCheck();
  } catch (e) {
    console.error('❌ Ошибка инициализации базы:', e);
    process.exit(1);
  }
}

// выполнить при загрузке модуля
ensureDatabaseStructure();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB] Received SIGINT, closing pool...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[DB] Received SIGTERM, closing pool...');
  await pool.end();
  process.exit(0);
});