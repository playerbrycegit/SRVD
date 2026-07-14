'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { AuthService } = require('../dist/src/modules/auth/service');
const { RecipesService } = require('../dist/src/modules/recipes/service');

function setup() {
  const db = createDb(':memory:');
  runMigrations(db);
  const auth = new AuthService(db);
  const recipes = new RecipesService(db);
  const userA = auth.register({ email: 'a@example.com', password: 'password123' });
  const userB = auth.register({ email: 'b@example.com', password: 'password123' });
  return { db, recipes, userA, userB };
}

const blackWolf = {
  name: 'Black Wolf', category: 'Shaken', glassware: 'Rocks glass, large cube',
  method: 'Shaken hard, served over weight.', tasting_notes: 'Quiet dominance.',
  ingredients: [
    { ingredient_name: 'Bourbon', amount: '2', unit: 'oz' },
    { ingredient_name: 'Blackberry', amount: '0.75', unit: 'oz' },
    { ingredient_name: 'Lemon', amount: '0.5', unit: 'oz' },
    { ingredient_name: 'Bitters', amount: '2', unit: 'dash' },
  ],
};

test('recipes: create and read back with ingredients in order', () => {
  const { recipes, userA } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  assert.equal(r.name, 'Black Wolf');
  assert.equal(r.ingredients.length, 4);
  assert.equal(r.ingredients[0].ingredient_name, 'Bourbon');
  assert.equal(r.ingredients[3].ingredient_name, 'Bitters');
});

test('recipes: creation is transactional - a rejected recipe leaves no orphaned ingredient rows', () => {
  const { db, recipes, userA } = setup();
  assert.throws(() => recipes.createRecipe(userA.id, { name: '', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] }));
  const count = db.get('SELECT COUNT(*) as c FROM recipe_ingredients').c;
  assert.equal(count, 0);
});

test('recipes: delete cascades to recipe_ingredients (composition, Stage 4 §5)', () => {
  const { db, recipes, userA } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  assert.equal(db.get('SELECT COUNT(*) as c FROM recipe_ingredients WHERE recipe_id = ?', [r.id]).c, 4);
  recipes.deleteRecipe(userA.id, r.id);
  assert.equal(db.get('SELECT COUNT(*) as c FROM recipe_ingredients WHERE recipe_id = ?', [r.id]).c, 0);
});

test('search: name match works', () => {
  const { recipes, userA } = setup();
  recipes.createRecipe(userA.id, blackWolf);
  recipes.createRecipe(userA.id, { ...blackWolf, name: 'Old Fashioned', category: 'Stirred' });
  const results = recipes.listRecipes(userA.id, { search: 'Wolf' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Black Wolf');
});

test('search: category filter + name search combine with AND logic (Stage 4 §11)', () => {
  const { recipes, userA } = setup();
  recipes.createRecipe(userA.id, blackWolf); // Shaken
  recipes.createRecipe(userA.id, { ...blackWolf, name: 'Black Manhattan', category: 'Stirred' });
  const results = recipes.listRecipes(userA.id, { search: 'Black', category: 'Stirred' });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Black Manhattan');
});

test('OWNERSHIP: user B cannot read user A\'s recipe by id', () => {
  const { recipes, userA, userB } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  assert.equal(recipes.getRecipe(userB.id, r.id), null);
});

test('OWNERSHIP: user B\'s recipe list never contains user A\'s recipes, even with a matching search', () => {
  const { recipes, userA, userB } = setup();
  recipes.createRecipe(userA.id, blackWolf);
  const results = recipes.listRecipes(userB.id, { search: 'Wolf' });
  assert.equal(results.length, 0);
});

test('OWNERSHIP: user B cannot delete user A\'s recipe', () => {
  const { recipes, userA, userB } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  assert.equal(recipes.deleteRecipe(userB.id, r.id), false);
  assert.ok(recipes.getRecipe(userA.id, r.id)); // still exists
});

// ---------- V1.1: Edit Recipe (approved decision package, Must-Have) ----------
test('updateRecipe: successfully changes name and category', () => {
  const { recipes, userA } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  const updated = recipes.updateRecipe(userA.id, r.id, { ...blackWolf, name: 'Black Wolf II', category: 'Built' });
  assert.equal(updated.name, 'Black Wolf II');
  assert.equal(updated.category, 'Built');
});

test('updateRecipe: replaces ingredients wholesale - add, remove, and reorder all work in one edit', () => {
  const { db, recipes, userA } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf); // 4 ingredients
  const updated = recipes.updateRecipe(userA.id, r.id, {
    ...blackWolf,
    ingredients: [
      { ingredient_name: 'Rye', amount: '2', unit: 'oz' },      // replaces Bourbon, different name
      { ingredient_name: 'New Ingredient', amount: '1', unit: 'oz' }, // net new
    ],
  });
  assert.equal(updated.ingredients.length, 2);
  assert.equal(updated.ingredients[0].ingredient_name, 'Rye');
  assert.equal(updated.ingredients[1].ingredient_name, 'New Ingredient');
  // old rows genuinely gone, not just unreferenced
  const orphanCount = db.get('SELECT COUNT(*) as c FROM recipe_ingredients WHERE recipe_id = ?', [r.id]).c;
  assert.equal(orphanCount, 2);
});

test('updateRecipe: invalid update (no ingredients) is rejected and leaves the original recipe untouched', () => {
  const { recipes, userA } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  assert.throws(() => recipes.updateRecipe(userA.id, r.id, { ...blackWolf, ingredients: [] }));
  const stillThere = recipes.getRecipe(userA.id, r.id);
  assert.equal(stillThere.ingredients.length, 4); // unchanged - the failed update didn't corrupt it
});

test('OWNERSHIP: user B cannot update user A\'s recipe', () => {
  const { recipes, userA, userB } = setup();
  const r = recipes.createRecipe(userA.id, blackWolf);
  const result = recipes.updateRecipe(userB.id, r.id, { ...blackWolf, name: 'Stolen' });
  assert.equal(result, null);
  assert.equal(recipes.getRecipe(userA.id, r.id).name, 'Black Wolf'); // unchanged
});

test('updateRecipe: returns null for a nonexistent recipe id', () => {
  const { recipes, userA } = setup();
  const result = recipes.updateRecipe(userA.id, 'not-a-real-id', blackWolf);
  assert.equal(result, null);
});
