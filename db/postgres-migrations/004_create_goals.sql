-- PostgreSQL migration 004: goals
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/004_create_goals.sql. NUMERIC(10,2) for target_amount, same fix as 003.

CREATE TABLE IF NOT EXISTS goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_amount  NUMERIC(10,2) NOT NULL CHECK (target_amount > 0),
  window_days    INTEGER NOT NULL DEFAULT 7,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
