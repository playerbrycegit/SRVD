'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scaleBatch, calculateAbv, convertUnit, CalculationError } = require('../src/shared-kernel/calculations');

// ---------- Batch scaling ----------
test('batch: scales up correctly', () => {
  const out = scaleBatch({ baseServings: 1, targetServings: 12, ingredients: [{ name: 'Gin', amount: 2, unit: 'oz' }] });
  assert.equal(out[0].scaledAmount, 24);
});

test('batch: scales down (fractional) correctly', () => {
  const out = scaleBatch({ baseServings: 4, targetServings: 1, ingredients: [{ name: 'Lime', amount: 1, unit: 'oz' }] });
  assert.equal(out[0].scaledAmount, 0.25);
});

test('batch: rounds to 2 decimal places', () => {
  const out = scaleBatch({ baseServings: 3, targetServings: 1, ingredients: [{ name: 'Bitters', amount: 1, unit: 'dash' }] });
  assert.equal(out[0].scaledAmount, 0.33);
});

test('batch: zero base servings throws (division by zero guarded)', () => {
  assert.throws(() => scaleBatch({ baseServings: 0, targetServings: 12, ingredients: [{ amount: 1 }] }), CalculationError);
});

test('batch: negative target servings throws', () => {
  assert.throws(() => scaleBatch({ baseServings: 1, targetServings: -5, ingredients: [{ amount: 1 }] }), CalculationError);
});

test('batch: empty ingredient list throws "add at least one ingredient"', () => {
  assert.throws(() => scaleBatch({ baseServings: 1, targetServings: 12, ingredients: [] }), /at least one ingredient/);
});

test('batch: invalid single row is skipped with a per-row error, not a full failure', () => {
  const out = scaleBatch({
    baseServings: 1, targetServings: 2,
    ingredients: [{ name: 'Good', amount: 1 }, { name: 'Bad', amount: 'not-a-number' }],
  });
  assert.equal(out[0].scaledAmount, 2);
  assert.equal(out[0].error, null);
  assert.equal(out[1].scaledAmount, null);
  assert.match(out[1].error, /Invalid amount/);
});

test('batch: negative ingredient amount is treated as an invalid row', () => {
  const out = scaleBatch({ baseServings: 1, targetServings: 2, ingredients: [{ name: 'X', amount: -1 }] });
  assert.equal(out[0].scaledAmount, null);
});

// ---------- ABV / Proof ----------
test('abv: single spirit, no dilution', () => {
  const out = calculateAbv({ ingredients: [{ name: 'Whiskey', volumeOz: 2, abvPercent: 40 }], dilution: 0 });
  assert.equal(out.finalAbvPercent, 40);
  assert.equal(out.proof, 80);
  assert.equal(out.totalVolumeOz, 2);
});

test('abv: multiple ingredients combine correctly', () => {
  // 2oz @ 40% + 1oz @ 0% (mixer) = 0.8oz alcohol / 3oz total = 26.7%
  const out = calculateAbv({ ingredients: [{ volumeOz: 2, abvPercent: 40 }, { volumeOz: 1, abvPercent: 0 }] });
  assert.equal(out.finalAbvPercent, 26.7);
});

test('abv: dilution lowers final ABV', () => {
  const out = calculateAbv({ ingredients: [{ volumeOz: 2, abvPercent: 40 }], dilution: 2 });
  assert.equal(out.finalAbvPercent, 20);
  assert.equal(out.totalVolumeOz, 4);
});

test('abv: 100% ABV edge case (edge of valid range)', () => {
  const out = calculateAbv({ ingredients: [{ volumeOz: 1, abvPercent: 100 }] });
  assert.equal(out.finalAbvPercent, 100);
  assert.equal(out.proof, 200);
});

test('abv: 0% ABV (e.g. mixer only) edge case', () => {
  const out = calculateAbv({ ingredients: [{ volumeOz: 1, abvPercent: 0 }] });
  assert.equal(out.finalAbvPercent, 0);
});

test('abv: ABV above 100 is rejected', () => {
  assert.throws(() => calculateAbv({ ingredients: [{ volumeOz: 1, abvPercent: 101 }] }), CalculationError);
});

test('abv: negative ABV is rejected', () => {
  assert.throws(() => calculateAbv({ ingredients: [{ volumeOz: 1, abvPercent: -1 }] }), CalculationError);
});

test('abv: negative volume is rejected', () => {
  assert.throws(() => calculateAbv({ ingredients: [{ volumeOz: -1, abvPercent: 40 }] }), CalculationError);
});

test('abv: negative dilution is rejected', () => {
  assert.throws(() => calculateAbv({ ingredients: [{ volumeOz: 1, abvPercent: 40 }], dilution: -1 }), CalculationError);
});

test('abv: empty ingredient list throws', () => {
  assert.throws(() => calculateAbv({ ingredients: [] }), /at least one ingredient/);
});

test('abv: zero total volume (all-zero edge case) does not divide by zero', () => {
  const out = calculateAbv({ ingredients: [{ volumeOz: 0, abvPercent: 40 }], dilution: 0 });
  assert.equal(out.finalAbvPercent, 0); // guarded, not NaN/Infinity
  assert.ok(Number.isFinite(out.finalAbvPercent));
});

// ---------- Unit conversion ----------
test('convert: oz to ml matches known constant', () => {
  assert.equal(convertUnit({ amount: 1, fromUnit: 'oz', toUnit: 'ml' }), 29.574);
});

test('convert: round-trip oz->ml->oz returns to (approximately) the original value', () => {
  const ml = convertUnit({ amount: 2, fromUnit: 'oz', toUnit: 'ml' });
  const backToOz = convertUnit({ amount: ml, fromUnit: 'ml', toUnit: 'oz' });
  assert.ok(Math.abs(backToOz - 2) < 0.001);
});

test('convert: same unit to same unit returns the same value', () => {
  assert.equal(convertUnit({ amount: 5, fromUnit: 'oz', toUnit: 'oz' }), 5);
});

test('convert: zero amount converts to zero', () => {
  assert.equal(convertUnit({ amount: 0, fromUnit: 'oz', toUnit: 'ml' }), 0);
});

test('convert: negative amount is rejected', () => {
  assert.throws(() => convertUnit({ amount: -1, fromUnit: 'oz', toUnit: 'ml' }), CalculationError);
});

test('convert: unknown unit is rejected', () => {
  assert.throws(() => convertUnit({ amount: 1, fromUnit: 'gallon', toUnit: 'ml' }), /Unknown unit/);
});

test('convert: liter conversions are correct', () => {
  assert.equal(convertUnit({ amount: 1, fromUnit: 'l', toUnit: 'ml' }), 1000);
});
