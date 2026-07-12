'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEmail, validatePassword, validateShift, validateGoal, validateRecipe, ValidationError,
} = require('../dist/src/shared-kernel/validation');

test('email: valid email passes and is normalized to lowercase', () => {
  assert.equal(validateEmail('Bartender@Example.com'), 'bartender@example.com');
});

test('email: missing @ is rejected', () => {
  assert.throws(() => validateEmail('not-an-email'), ValidationError);
});

test('password: under 8 chars is rejected', () => {
  assert.throws(() => validatePassword('short'), ValidationError);
});

test('password: 8+ chars passes', () => {
  assert.equal(validatePassword('longenough'), 'longenough');
});

test('shift: zero tips on both fields is rejected (Stage 4 §9 business rule)', () => {
  assert.throws(() => validateShift({ shift_date: '2026-07-11', cash_tips: 0, card_tips: 0 }), /at least one tip/);
});

test('shift: cash-only tip passes', () => {
  const out = validateShift({ shift_date: '2026-07-11', cash_tips: 50, card_tips: 0 });
  assert.equal(out.cash_tips, 50);
});

test('shift: negative tips rejected', () => {
  assert.throws(() => validateShift({ shift_date: '2026-07-11', cash_tips: -5, card_tips: 0 }), ValidationError);
});

test('shift: hours out of 0-24 range rejected', () => {
  assert.throws(() => validateShift({ shift_date: '2026-07-11', cash_tips: 10, card_tips: 0, hours: 25 }), ValidationError);
});

test('shift: malformed date rejected', () => {
  assert.throws(() => validateShift({ shift_date: 'not-a-date', cash_tips: 10, card_tips: 0 }), ValidationError);
});

test('goal: zero target rejected', () => {
  assert.throws(() => validateGoal({ target_amount: 0 }), ValidationError);
});

test('goal: positive target passes', () => {
  assert.equal(validateGoal({ target_amount: 1200 }).target_amount, 1200);
});

test('recipe: empty name rejected', () => {
  assert.throws(() => validateRecipe({ name: '', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] }), /needs a name/);
});

test('recipe: invalid category rejected', () => {
  assert.throws(() => validateRecipe({ name: 'X', category: 'NotACategory', ingredients: [{ ingredient_name: 'Gin' }] }), ValidationError);
});

test('recipe: zero valid ingredients rejected', () => {
  assert.throws(() => validateRecipe({ name: 'X', category: 'Classic', ingredients: [] }), /at least one ingredient/);
});

test('recipe: ingredient rows with blank names are filtered out, not counted', () => {
  assert.throws(() => validateRecipe({
    name: 'X', category: 'Classic', ingredients: [{ ingredient_name: '   ' }, { ingredient_name: '' }],
  }), /at least one ingredient/);
});

test('recipe: valid recipe preserves ingredient sort_order', () => {
  const out = validateRecipe({
    name: 'Black Wolf', category: 'Shaken',
    ingredients: [{ ingredient_name: 'Bourbon', amount: '2', unit: 'oz' }, { ingredient_name: 'Blackberry', amount: '0.75', unit: 'oz' }],
  });
  assert.equal(out.ingredients[0].sort_order, 0);
  assert.equal(out.ingredients[1].sort_order, 1);
  assert.equal(out.ingredients[0].ingredient_name, 'Bourbon');
});
