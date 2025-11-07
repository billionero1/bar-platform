-- establishments
CREATE TABLE IF NOT EXISTS establishments (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  phone            TEXT UNIQUE,
  name             TEXT,
  surname          TEXT,
  is_admin         BOOLEAN DEFAULT false,
  password_hash    TEXT,
  created_at       TIMESTAMP DEFAULT now()
);

-- memberships
CREATE TABLE IF NOT EXISTS memberships (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('manager','staff')),
  created_at       TIMESTAMP DEFAULT now(),
  UNIQUE (user_id, establishment_id)
);

-- ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  package_volume   REAL,
  package_cost     REAL,
  unit             TEXT,
  created_at       TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ingredients_est ON ingredients(establishment_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);

-- preparations
CREATE TABLE IF NOT EXISTS preparations (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  yield_value      REAL,
  yield_unit       TEXT,
  created_at       TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preparations_est ON preparations(establishment_id);
CREATE INDEX IF NOT EXISTS idx_preparations_title ON preparations(title);

-- preparation_components
CREATE TABLE IF NOT EXISTS preparation_components (
  id                      SERIAL PRIMARY KEY,
  preparation_id          INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  ingredient_id           INTEGER,
  nested_preparation_id   INTEGER,
  amount                  REAL NOT NULL,
  unit                    TEXT,
  is_preparation          BOOLEAN GENERATED ALWAYS AS (nested_preparation_id IS NOT NULL) STORED,
  CHECK (
    (ingredient_id IS NOT NULL AND nested_preparation_id IS NULL)
    OR
    (ingredient_id IS NULL AND nested_preparation_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pc_prep  ON preparation_components(preparation_id);
CREATE INDEX IF NOT EXISTS idx_pc_ing   ON preparation_components(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pc_nprep ON preparation_components(nested_preparation_id);

-- passcodes (на след. итерации)
CREATE TABLE IF NOT EXISTS passcodes (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  code          TEXT NOT NULL,
  purpose       TEXT NOT NULL, -- login|invite
  attempts_left INTEGER NOT NULL DEFAULT 3,
  expires_at    TIMESTAMP NOT NULL,
  created_at    TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passcodes_phone ON passcodes(phone);

-- sessions (на след. итерации)
CREATE TABLE IF NOT EXISTS sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  refresh_hash     TEXT NOT NULL,
  ua               TEXT,
  ip               TEXT,
  created_at       TIMESTAMP DEFAULT now(),
  revoked_at       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
