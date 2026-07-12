'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { writeAudit, AUDITABLE_ACTIONS } = require('../dist/src/shared-kernel/audit');
const { AuthService } = require('../dist/src/modules/auth/service');
const { RecipesService } = require('../dist/src/modules/recipes/service');
const { ShiftsService } = require('../dist/src/modules/shifts/service');

function freshDb() {
  const db = createDb(':memory:');
  runMigrations(db);
  return db;
}

test('audit: rejects an action not on the Stage 4 §18 allowed list', () => {
  const db = freshDb();
  assert.throws(() => writeAudit(db, { userId: null, action: 'not_a_real_action' }), /not a recognized auditable action/);
});

test('audit: recipe deletion writes an audit_log entry (Stage 4 §18)', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const recipes = new RecipesService(db);
  const user = auth.register({ email: 'a@example.com', password: 'password123' });
  const r = recipes.createRecipe(user.id, {
    name: 'Test', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }],
  });
  recipes.deleteRecipe(user.id, r.id);
  const entry = db.get("SELECT * FROM audit_log WHERE action = 'recipe_deleted' AND resource_id = ?", [r.id]);
  assert.ok(entry);
});

test('audit: shift deletion writes an audit_log entry (Stage 4 §18)', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const user = auth.register({ email: 'a@example.com', password: 'password123' });
  const s = shifts.logShift(user.id, { shift_date: '2026-07-10', cash_tips: 50, card_tips: 0 });
  shifts.deleteShift(user.id, s.id);
  const entry = db.get("SELECT * FROM audit_log WHERE action = 'shift_deleted' AND resource_id = ?", [s.id]);
  assert.ok(entry);
});

test('audit: a failed delete (wrong owner) does NOT write an audit entry - only real state changes are audited', () => {
  const db = freshDb();
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const userA = auth.register({ email: 'a@example.com', password: 'password123' });
  const userB = auth.register({ email: 'b@example.com', password: 'password123' });
  const s = shifts.logShift(userA.id, { shift_date: '2026-07-10', cash_tips: 50, card_tips: 0 });
  shifts.deleteShift(userB.id, s.id); // no-op, wrong owner
  const count = db.get("SELECT COUNT(*) as c FROM audit_log WHERE action = 'shift_deleted'").c;
  assert.equal(count, 0);
});

test('AUDITABLE_ACTIONS matches the exact list from Stage 4 §18', () => {
  assert.deepEqual(AUDITABLE_ACTIONS, [
    'account_created', 'account_deleted', 'password_changed', 'password_reset',
    'recipe_deleted', 'shift_deleted', 'permission_denied', 'data_exported',
  ]);
});
