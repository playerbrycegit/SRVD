/**
 * Recipes module, converted to strict TypeScript. Source: Stage 4 §4/§5/§9/§11.
 * recipe_ingredients are composition-owned by their parent recipe (Stage 4 §5).
 */
import { randomUUID } from 'node:crypto';
import { validateRecipe } from '../../shared-kernel/validation';
import { writeAudit } from '../../shared-kernel/audit';
import type { Database } from '../../shared-kernel/data-access';
import type { RecipeRow, RecipeIngredientRow, RecipeWithIngredients, RecipeInput } from '../../shared-kernel/types';

export interface RecipeListFilters {
  search?: string;
  category?: string | null;
}

export class RecipesService {
  constructor(private readonly db: Database) {}

  createRecipe(userId: string, input: Partial<RecipeInput>): RecipeWithIngredients {
    const v = validateRecipe(input);
    const id = randomUUID();
    const now = Date.now();
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO recipes (id, user_id, name, category, glassware, method, tasting_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, v.name, v.category, v.glassware, v.method, v.tasting_notes, now, now]
      );
      for (const ing of v.ingredients) {
        this.db.run(
          `INSERT INTO recipe_ingredients (id, recipe_id, sort_order, amount, unit, ingredient_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [randomUUID(), id, ing.sort_order, ing.amount, ing.unit, ing.ingredient_name]
        );
      }
    });
    const recipe = this.getRecipe(userId, id);
    if (!recipe) throw new Error('Recipe insert succeeded but could not be read back — this should never happen');
    return recipe;
  }

  /**
   * V1.1 Must-Have (approved decision package §10, "Edit Recipe"). Ingredients are replaced
   * wholesale (delete existing rows, insert the new set) rather than diffed - the decision
   * package flagged this as "the one added wrinkle" versus Edit Shift, and wholesale replacement
   * inside the existing transaction pattern (already proven in createRecipe) is the smallest
   * reliable way to handle add/remove/reorder in one operation without new diffing logic.
   */
  updateRecipe(userId: string, recipeId: string, input: Partial<RecipeInput>): RecipeWithIngredients | null {
    const existing = this.getRecipe(userId, recipeId);
    if (!existing) return null; // ownership-scoped, same as updateShift
    const v = validateRecipe(input);
    const now = Date.now();
    this.db.transaction(() => {
      this.db.run(
        `UPDATE recipes SET name = ?, category = ?, glassware = ?, method = ?, tasting_notes = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [v.name, v.category, v.glassware, v.method, v.tasting_notes, now, recipeId, userId]
      );
      this.db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
      for (const ing of v.ingredients) {
        this.db.run(
          `INSERT INTO recipe_ingredients (id, recipe_id, sort_order, amount, unit, ingredient_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [randomUUID(), recipeId, ing.sort_order, ing.amount, ing.unit, ing.ingredient_name]
        );
      }
    });
    return this.getRecipe(userId, recipeId);
  }

  /** Ownership-scoped by construction. Returns null (not another user's data) if the recipe
   * exists but belongs to someone else. */
  getRecipe(userId: string, recipeId: string): RecipeWithIngredients | null {
    const recipe = this.db.get<RecipeRow>('SELECT * FROM recipes WHERE id = ? AND user_id = ?', [recipeId, userId]);
    if (!recipe) return null;
    const ingredients = this.db.all<RecipeIngredientRow>(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC',
      [recipeId]
    );
    return { ...recipe, ingredients };
  }

  /** Stage 4 §11: search scoped to Vault only, AND logic between name-match and category filter. */
  listRecipes(userId: string, { search = '', category = null }: RecipeListFilters = {}): RecipeRow[] {
    let sql = 'SELECT * FROM recipes WHERE user_id = ?';
    const params: unknown[] = [userId];
    if (search) {
      sql += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY created_at DESC';
    return this.db.all<RecipeRow>(sql, params);
  }

  deleteRecipe(userId: string, recipeId: string): boolean {
    const result = this.db.run('DELETE FROM recipes WHERE id = ? AND user_id = ?', [recipeId, userId]);
    if (result.changes > 0) {
      writeAudit(this.db, { userId, action: 'recipe_deleted', resourceType: 'recipes', resourceId: recipeId });
    }
    return result.changes > 0; // recipe_ingredients cascade automatically (migration 006)
  }
}
