'use strict';
/**
 * Recipes module. Source of truth: Stage 4 §4/§5/§9/§11, Stage 9 §2/§6.
 * recipe_ingredients are composition-owned by their parent recipe (Stage 4 §5) - never queried
 * independently of a recipe, and always deleted via the recipe's own cascade (migration 006).
 */
const { randomUUID } = require('node:crypto');
const { validateRecipe } = require('../../shared-kernel/validation');
const { writeAudit } = require('../../shared-kernel/audit');

class RecipesService {
  constructor(db) {
    this.db = db;
  }

  createRecipe(userId, input) {
    const v = validateRecipe(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.exec('BEGIN');
    try {
      this.db.prepare(`
        INSERT INTO recipes (id, user_id, name, category, glassware, method, tasting_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, v.name, v.category, v.glassware, v.method, v.tasting_notes, now, now);
      const insertIng = this.db.prepare(`
        INSERT INTO recipe_ingredients (id, recipe_id, sort_order, amount, unit, ingredient_name)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const ing of v.ingredients) {
        insertIng.run(randomUUID(), id, ing.sort_order, ing.amount, ing.unit, ing.ingredient_name);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return this.getRecipe(userId, id);
  }

  /** Ownership-scoped by construction. Returns null (not another user's data) if the recipe
   * exists but belongs to someone else - this is the specific behavior the ownership tests verify. */
  getRecipe(userId, recipeId) {
    const recipe = this.db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(recipeId, userId);
    if (!recipe) return null;
    const ingredients = this.db.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC'
    ).all(recipeId);
    return { ...recipe, ingredients };
  }

  /** Stage 4 §11: search scoped to Vault only, AND logic between name-match and category filter. */
  listRecipes(userId, { search = '', category = null } = {}) {
    let sql = 'SELECT * FROM recipes WHERE user_id = ?';
    const params = [userId];
    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  deleteRecipe(userId, recipeId) {
    const result = this.db.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').run(recipeId, userId);
    // recipe_ingredients cascade automatically (migration 006)
    if (result.changes > 0) {
      writeAudit(this.db, { userId, action: 'recipe_deleted', resourceType: 'recipes', resourceId: recipeId });
    }
    return result.changes > 0;
  }
}

module.exports = { RecipesService };
