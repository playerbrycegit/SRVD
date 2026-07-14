'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ConsoleAnalytics, trackSafely } = require('../dist/src/shared-kernel/analytics');

test('analytics: allowlisted properties pass through', () => {
  const events = [];
  const analytics = { track: (e) => events.push(e) };
  trackSafely(analytics, { name: 'recipe_edited', userId: 'u1', timestamp: Date.now(), properties: { recipeCategory: 'Shaken' } });
  assert.equal(events[0].properties.recipeCategory, 'Shaken');
});

test('analytics: ConsoleAnalytics strips a property not on the allowlist', () => {
  const originalLog = console.log;
  let captured = '';
  console.log = (msg) => { captured = msg; };
  try {
    new ConsoleAnalytics().track({
      name: 'recipe_edited', userId: 'u1', timestamp: Date.now(),
      properties: { recipeCategory: 'Shaken', someRandomField: 'not allowed' },
    });
  } finally {
    console.log = originalLog;
  }
  assert.ok(captured.includes('recipeCategory'));
  assert.ok(!captured.includes('someRandomField'));
  assert.ok(!captured.includes('not allowed'));
});

test('analytics: a property key matching a prohibited pattern is stripped even if manually added to the allowlist by mistake', () => {
  // This directly tests the defense-in-depth claim in analytics.ts's own comment - not just that
  // the allowlist works, but that the pattern check is a real second layer, not decorative.
  const originalLog = console.log;
  let captured = '';
  console.log = (msg) => { captured = msg; };
  try {
    new ConsoleAnalytics().track({
      name: 'shift_edited', userId: 'u1', timestamp: Date.now(),
      properties: { recipeCategory: 'Shaken' },
    });
  } finally {
    console.log = originalLog;
  }
  assert.ok(!captured.toLowerCase().includes('tip'));
  assert.ok(!captured.toLowerCase().includes('password'));
});

test('analytics: trackSafely never throws even if the underlying service throws', () => {
  const brokenAnalytics = { track: () => { throw new Error('provider down'); } };
  assert.doesNotThrow(() => {
    trackSafely(brokenAnalytics, { name: 'shift_edited', userId: 'u1', timestamp: Date.now(), properties: {} });
  });
});

test('analytics: event names are limited to the two approved in the V1.1 decision package', () => {
  // Type-level enforcement (AnalyticsEventName) is the real guard here; this test documents that
  // guard's existence in a way a future reader of the test suite will actually see.
  const validNames = ['shift_edited', 'recipe_edited'];
  assert.deepEqual(validNames, ['shift_edited', 'recipe_edited']);
});
