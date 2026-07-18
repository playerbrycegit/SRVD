-- PostgreSQL migration 001: users
-- STATUS: written in correct syntax, never executed - no Postgres server exists in the sandbox
-- this was built in. Translated from db/migrations/001_create_users.sql, with one deliberate
-- change: NUMERIC is used for money elsewhere in this migration set (see 003, 004) per the fix
-- documented in the TypeScript migration completion report - SQLite's REAL is a float and never
-- should have been used for currency; Postgres NUMERIC is exact.

CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  email_verified_at     TIMESTAMPTZ,
  display_name          TEXT,
  unit_preference       TEXT NOT NULL DEFAULT 'oz' CHECK (unit_preference IN ('oz','ml')),
  currency_preference   TEXT NOT NULL DEFAULT 'USD',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
