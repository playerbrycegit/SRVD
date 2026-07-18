-- PostgreSQL migration 003: shifts
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/003_create_shifts.sql. NUMERIC(10,2) used for cash_tips/card_tips instead of
-- SQLite's REAL - the currency-precision fix documented in the TypeScript migration report.

CREATE TABLE IF NOT EXISTS shifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date   DATE NOT NULL,
  hours        NUMERIC(4,2),
  cash_tips    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cash_tips >= 0),
  card_tips    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (card_tips >= 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON shifts (user_id, shift_date DESC);
