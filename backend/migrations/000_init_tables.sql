BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  phone         TEXT UNIQUE NOT NULL,
  name          TEXT,
  surname       TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS establishments (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  UNIQUE (user_id, establishment_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sid_hash         TEXT NOT NULL UNIQUE,
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
  purpose       TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  attempts_left INTEGER NOT NULL DEFAULT 3,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Телефон подтверждён для регистрации (one-time window)
CREATE TABLE IF NOT EXISTS phone_verifications (
  phone      TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('register')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (phone, purpose)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  package_volume   NUMERIC,
  package_cost     NUMERIC,
  unit             TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preparations (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  yield_value      NUMERIC,
  yield_unit       TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preparation_components (
  id                    SERIAL PRIMARY KEY,
  preparation_id        INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  ingredient_id         INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  nested_preparation_id INTEGER REFERENCES preparations(id) ON DELETE CASCADE,
  amount                NUMERIC NOT NULL,
  unit                  TEXT,
  CONSTRAINT preparation_components_one_source CHECK (
    (ingredient_id IS NOT NULL AND nested_preparation_id IS NULL)
    OR
    (ingredient_id IS NULL AND nested_preparation_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS cocktails (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'cocktail'
                   CHECK (category IN ('cocktail', 'non_alcoholic', 'coffee', 'shot')),
  output_value     NUMERIC,
  output_unit      TEXT,
  garnish          TEXT,
  serving          TEXT,
  method           TEXT,
  photo_url        TEXT,
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cocktail_components (
  id             SERIAL PRIMARY KEY,
  cocktail_id    INTEGER NOT NULL REFERENCES cocktails(id) ON DELETE CASCADE,
  ingredient_id  INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  preparation_id INTEGER REFERENCES preparations(id) ON DELETE CASCADE,
  amount         NUMERIC NOT NULL,
  unit           TEXT,
  CONSTRAINT cocktail_components_one_source CHECK (
    (ingredient_id IS NOT NULL AND preparation_id IS NULL)
    OR
    (ingredient_id IS NULL AND preparation_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS operation_requests (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  created_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL
                   CHECK (kind IN ('supply', 'writeoff', 'maintenance', 'incident', 'vacation')),
  title            TEXT NOT NULL,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'in_progress', 'done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_invitations (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  created_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_phone    TEXT NOT NULL,
  invited_name     TEXT,
  invited_surname  TEXT,
  role             TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  token_hash       TEXT NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  accepted_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score            INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  total_questions  INTEGER NOT NULL CHECK (total_questions > 0),
  correct_answers  INTEGER NOT NULL CHECK (correct_answers >= 0),
  answers          JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_sec     INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_kpis (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  shift_date       DATE NOT NULL,
  recorded_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guests_count     INTEGER NOT NULL DEFAULT 0,
  orders_count     INTEGER NOT NULL DEFAULT 0,
  revenue          NUMERIC NOT NULL DEFAULT 0,
  writeoff_cost    NUMERIC NOT NULL DEFAULT 0,
  avg_ticket       NUMERIC NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (establishment_id, shift_date)
);

-- Мягкая миграция со старой структуры preparation_items -> preparation_components
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'preparation_items'
  )
  AND NOT EXISTS (SELECT 1 FROM preparation_components)
  THEN
    INSERT INTO preparation_components (
      preparation_id,
      ingredient_id,
      nested_preparation_id,
      amount,
      unit
    )
    SELECT
      pi.preparation_id,
      CASE WHEN pi.item_type = 'ingredient' THEN pi.item_id ELSE NULL END,
      CASE WHEN pi.item_type = 'preparation' THEN pi.item_id ELSE NULL END,
      pi.amount,
      pi.unit
    FROM preparation_items pi;
  END IF;
END $$;

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
