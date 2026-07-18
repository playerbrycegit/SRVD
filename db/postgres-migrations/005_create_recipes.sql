-- PostgreSQL migration 005: recipes
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/005_create_recipes.sql.

CREATE TABLE IF NOT EXISTS recipes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category       TEXT NOT NULL CHECK (category IN ('Classic','Original','Stirred','Shaken','Built','Batch')),
  glassware      TEXT,
  method         TEXT,
  tasting_notes  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipes_user_created ON recipes (user_id, created_at DESC);
-- Optional enhancement over the SQLite version (not required for parity):
-- CREATE INDEX IF NOT EXISTS idx_recipes_name_fts ON recipes USING GIN (to_tsvector('english', name));
