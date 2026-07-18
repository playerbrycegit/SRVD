-- PostgreSQL migration 007: calculator_presets
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/007_create_calculator_presets.sql. JSONB used instead of SQLite's TEXT.

CREATE TABLE IF NOT EXISTS calculator_presets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_type  TEXT NOT NULL CHECK (preset_type IN ('batch','abv')),
  name         TEXT NOT NULL,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_presets_user_type ON calculator_presets (user_id, preset_type);
