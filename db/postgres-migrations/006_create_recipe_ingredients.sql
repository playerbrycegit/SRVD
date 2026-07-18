-- PostgreSQL migration 006: recipe_ingredients
-- STATUS: written in correct syntax, never executed. Translated from
-- db/migrations/006_create_recipe_ingredients.sql.

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL,
  amount           TEXT,
  unit             TEXT,
  ingredient_name  TEXT NOT NULL CHECK (length(ingredient_name) BETWEEN 1 AND 120)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients (recipe_id);
