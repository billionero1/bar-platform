-- Добавляет опциональный "стартовый объём до фильтрации" для заготовок.
ALTER TABLE IF EXISTS preparations
  ADD COLUMN IF NOT EXISTS alt_volume NUMERIC;
