BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_topics (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  category         TEXT NOT NULL DEFAULT 'Общее',
  title            TEXT NOT NULL,
  summary          TEXT NOT NULL DEFAULT '',
  bullets          JSONB NOT NULL DEFAULT '[]'::jsonb,
  position         INTEGER NOT NULL DEFAULT 100,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id               SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  options          JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option   INTEGER NOT NULL DEFAULT 0 CHECK (correct_option >= 0),
  hint             TEXT,
  position         INTEGER NOT NULL DEFAULT 100,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cocktails
  ADD COLUMN IF NOT EXISTS photo_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS photo_content_type TEXT;

UPDATE cocktails
   SET photo_storage_key = regexp_replace(photo_url, '^/uploads/', '')
 WHERE photo_storage_key IS NULL
   AND photo_url LIKE '/uploads/%';

CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at);
CREATE INDEX IF NOT EXISTS idx_learning_topics_establishment_active
  ON learning_topics(establishment_id, is_active, position, id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_establishment_active
  ON quiz_questions(establishment_id, is_active, position, id);

COMMIT;
