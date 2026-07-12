-- Migration 005: recipes
-- Source: Stage 4 §4. category is a fixed enum matching the Vault filter list exactly (Stage 3 §7).

CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category      TEXT NOT NULL CHECK (category IN ('Classic','Original','Stirred','Shaken','Built','Batch')),
  glassware     TEXT,
  method        TEXT,
  tasting_notes TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes (user_id, created_at DESC);
