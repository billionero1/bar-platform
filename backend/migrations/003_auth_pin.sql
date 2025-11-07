-- 003_auth_pin.sql  — passcodes + sessions + индексы

-- одноразовые коды (логин и инвайт)
CREATE TABLE IF NOT EXISTS passcodes (
  id             SERIAL PRIMARY KEY,
  phone          TEXT NOT NULL,
  code           TEXT NOT NULL,                -- храним как есть (4 цифры)
  purpose        TEXT NOT NULL CHECK (purpose IN ('login','invite')),
  attempts_left  INTEGER NOT NULL DEFAULT 3,
  expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passcodes_phone_purpose ON passcodes(phone, purpose);
CREATE INDEX IF NOT EXISTS idx_passcodes_expires ON passcodes(expires_at);

-- refresh-сессии (ротация, отзыв)
CREATE TABLE IF NOT EXISTS sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  refresh_hash     TEXT NOT NULL,          -- sha256 от refresh
  ua               TEXT,
  ip               TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id, revoked_at);

-- страховка: phone уникален
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='users' AND constraint_type='UNIQUE') THEN
    BEGIN
      ALTER TABLE users ADD CONSTRAINT uq_users_phone UNIQUE (phone);
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END IF;
END$$;
