BEGIN;

CREATE TABLE IF NOT EXISTS phone_telegram_links (
  phone               TEXT PRIMARY KEY,
  chat_id             TEXT NOT NULL,
  telegram_user_id    BIGINT,
  telegram_username   TEXT,
  telegram_first_name TEXT,
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_telegram_bind_tokens (
  id         BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  phone      TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_telegram_links_chat_id
  ON phone_telegram_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_otp_telegram_bind_tokens_phone
  ON otp_telegram_bind_tokens(phone, purpose, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_telegram_bind_tokens_expires
  ON otp_telegram_bind_tokens(expires_at);

COMMIT;
