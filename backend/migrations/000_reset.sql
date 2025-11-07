-- Снести старую схему (безопасно, если данных хранить не нужно)
DROP TABLE IF EXISTS preparation_components CASCADE;
DROP TABLE IF EXISTS preparation_ingredients CASCADE; -- старое имя на всякий
DROP TABLE IF EXISTS preparations CASCADE;
DROP TABLE IF EXISTS ingredients CASCADE;
DROP TABLE IF EXISTS memberships CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS passcodes CASCADE;
DROP TABLE IF EXISTS team CASCADE;      -- старое
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;   -- старое
DROP TABLE IF EXISTS establishments CASCADE;
