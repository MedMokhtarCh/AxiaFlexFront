-- Reset base de test POS (PostgreSQL)
-- Conserve UNIQUEMENT les tables coeur:
--   - users
--   - products (articles)
--   - categories
--   - restaurant_settings (settings)
--
-- Tout le reste est vidé (TRUNCATE ... RESTART IDENTITY CASCADE)
-- pour repartir sur une base propre de test.

BEGIN;

DO $$
DECLARE
  keep_tables text[] := ARRAY[
    'users',
    'products',
    'categories',
    'restaurant_settings'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> ALL(keep_tables)
      AND tablename NOT LIKE 'typeorm_%'
  LOOP
    EXECUTE format(
      'TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE',
      'public',
      r.tablename
    );
  END LOOP;
END $$;

COMMIT;
