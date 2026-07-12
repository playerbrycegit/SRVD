-- Migration 006: recipe_ingredients
-- Source: Stage 4 §4. Composition relationship - an ingredient row has no meaning outside its
-- recipe (Stage 4 §5). amount/unit are free-text on purpose (real bartender input like "a splash").

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id               TEXT PRIMARY KEY,
  recipe_id        TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  amount           TEXT,
  unit             TEXT,
  ingredient_name  TEXT NOT NULL CHECK (length(ingredient_name) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
