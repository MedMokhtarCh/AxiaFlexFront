-- PostgreSQL maintenance snippets (à exécuter manuellement si besoin)
-- 1) Purge commandes/tickets/paiements
-- 2) Réinitialisation minimale (garder ADMIN/SUPER_ADMIN + settings)

-- ==========================================================
-- 1) Purge commandes / tickets / paiements
-- ==========================================================
BEGIN;

TRUNCATE TABLE
  payment_item,
  payment,
  ticket_item,
  ticket,
  order_item,
  "order",
  invoice,
  print_jobs
RESTART IDENTITY CASCADE;

COMMIT;

-- ==========================================================
-- 2) Réinitialisation minimale
-- ==========================================================
BEGIN;

TRUNCATE TABLE
  payment_item,
  payment,
  ticket_item,
  ticket,
  order_item,
  "order",
  invoice,
  print_jobs
RESTART IDENTITY CASCADE;

DELETE FROM users
WHERE UPPER(COALESCE(role, '')) NOT IN ('ADMIN', 'SUPER_ADMIN');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE UPPER(COALESCE(role, '')) IN ('ADMIN', 'SUPER_ADMIN')
  ) THEN
    INSERT INTO users (name, role, pin)
    VALUES ('Admin', 'ADMIN', '1234');
  END IF;
END $$;

DELETE FROM restaurant_settings;

COMMIT;
