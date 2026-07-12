-- Migration 007: calculator_presets
-- Source: Stage 4 §4. Schema exists now even though the save-preset UI is V1.1 (Master Blueprint §3).
-- payload is JSON since preset shape mirrors whatever the calculator's input rows are.

CREATE TABLE IF NOT EXISTS calculator_presets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  preset_type  TEXT NOT NULL CHECK (preset_type IN ('batch','abv')),
  name         TEXT NOT NULL,
  payload      TEXT NOT NULL,   -- JSON-encoded
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presets_user_type ON calculator_presets (user_id, preset_type);
