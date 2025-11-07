-- migrations/003_add_pin_hash.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'pin_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN pin_hash TEXT;
  END IF;
END$$;
