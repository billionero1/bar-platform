-- !!! ОСТОРОЖНО: Полный сброс схемы public
-- Требует роли с правом DROP SCHEMA.
BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION CURRENT_USER;

-- стандартные привилегии как у «чистой» БД
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO PUBLIC;

COMMIT;
