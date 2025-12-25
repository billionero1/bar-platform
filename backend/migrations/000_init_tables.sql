BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  phone           TEXT UNIQUE NOT NULL,
  name            TEXT,
  surname         TEXT,
  is_admin        BOOLEAN DEFAULT FALSE,
  password_hash   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS establishments (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('manager','staff')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  revoked_at       TIMESTAMPTZ
);

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

CREATE TABLE IF NOT EXISTS passcodes (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  code          TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  attempts_left INTEGER NOT NULL DEFAULT 3,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  unit       TEXT,
  cost       NUMERIC,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preparations (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  yield_unit   TEXT,
  yield_amount NUMERIC,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preparation_items (
  id             SERIAL PRIMARY KEY,
  preparation_id INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  item_type      TEXT NOT NULL CHECK (item_type IN ('ingredient','preparation')),
  item_id        INTEGER NOT NULL,
  amount         NUMERIC NOT NULL,
  unit           TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_valid_idx ON sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_passcodes_phone ON passcodes(phone);
CREATE INDEX IF NOT EXISTS idx_prep_items_prep ON preparation_items(preparation_id);

CREATE TABLE IF NOT EXISTS auth_events (
  id         BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,

  user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  phone      TEXT,

  ip         TEXT,
  user_agent TEXT,

  method     TEXT,
  path       TEXT,

  success    BOOLEAN,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
