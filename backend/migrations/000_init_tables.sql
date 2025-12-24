BEGIN;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  phone           TEXT UNIQUE NOT NULL,
  name            TEXT,
  surname         TEXT,
  is_admin        BOOLEAN DEFAULT FALSE,
  password_hash   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ESTABLISHMENTS
CREATE TABLE IF NOT EXISTS establishments (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- MEMBERSHIPS
CREATE TABLE IF NOT EXISTS memberships (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('manager','staff')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- страховка на колонку отзыва доступа
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='memberships' AND column_name='revoked_at'
  ) THEN
    ALTER TABLE memberships ADD COLUMN revoked_at TIMESTAMPTZ;
  END IF;
END$$;

-- SESSIONS
DROP TABLE IF EXISTS sessions CASCADE;

CREATE TABLE sessions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sid_hash         TEXT   NOT NULL UNIQUE,
  ua               TEXT,
  ip               TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ
);

-- PASSCODES (SMS/verify/сброс пароля)
CREATE TABLE IF NOT EXISTS passcodes (
  id           SERIAL PRIMARY KEY,
  phone        TEXT NOT NULL,
  code         TEXT NOT NULL,
  purpose      TEXT NOT NULL, -- 'verify'|'reset' (SMS-коды для верификации и сброса пароля)
  attempts_left INTEGER NOT NULL DEFAULT 3,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- INGREDIENTS
CREATE TABLE IF NOT EXISTS ingredients (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  unit       TEXT,           -- мл, г и т.п.
  cost       NUMERIC,        -- цена за unit
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PREPARATIONS (заготовки)
CREATE TABLE IF NOT EXISTS preparations (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  yield_unit     TEXT,        -- итоговая единица выхода
  yield_amount   NUMERIC,     -- сколько выходит
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- PREPARATION_ITEMS (состав заготовки: ингредиенты или другие заготовки)
CREATE TABLE IF NOT EXISTS preparation_items (
  id               SERIAL PRIMARY KEY,
  preparation_id   INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  item_type        TEXT NOT NULL CHECK (item_type IN ('ingredient','preparation')),
  item_id          INTEGER NOT NULL,  -- ссылается либо на ingredients.id, либо на preparations.id
  amount           NUMERIC NOT NULL,
  unit             TEXT
);

-- Базовые индексы (без CONCURRENTLY - они в транзакции)
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_valid_idx ON sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_passcodes_phone ON passcodes(phone);
CREATE INDEX IF NOT EXISTS idx_prep_items_prep ON preparation_items(preparation_id);

-- AUTH EVENTS (аудит авторизации)
CREATE TABLE IF NOT EXISTS auth_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,        -- login_success, login_fail, register_success и т.п.
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  phone       TEXT,
  ip          TEXT,
  user_agent  TEXT,
  success     BOOLEAN,
  created_at  TIMESTAMPTZ DEFAULT now()
);

COMMIT;