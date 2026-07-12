'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRateLimited, clearAll } = require('../src/http/rate-limit');

test('rate-limit: allows requests under the threshold', () => {
  clearAll();
  for (let i = 0; i < 5; i++) {
    assert.equal(isRateLimited('key-a', { maxRequests: 5, windowMs: 60_000 }), false);
  }
});

test('rate-limit: blocks the request that exceeds the threshold', () => {
  clearAll();
  const opts = { maxRequests: 3, windowMs: 60_000 };
  assert.equal(isRateLimited('key-b', opts), false);
  assert.equal(isRateLimited('key-b', opts), false);
  assert.equal(isRateLimited('key-b', opts), false);
  assert.equal(isRateLimited('key-b', opts), true); // 4th request in the window
});

test('rate-limit: different keys are tracked independently', () => {
  clearAll();
  const opts = { maxRequests: 1, windowMs: 60_000 };
  assert.equal(isRateLimited('user-x', opts), false);
  assert.equal(isRateLimited('user-y', opts), false); // separate bucket, not blocked by user-x's usage
});

test('rate-limit: requests outside the window are not counted', () => {
  clearAll();
  const opts = { maxRequests: 1, windowMs: 10 }; // 10ms window, tiny on purpose
  assert.equal(isRateLimited('key-c', opts), false);
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(isRateLimited('key-c', opts), false); // window has passed, allowed again
      resolve();
    }, 20);
  });
});
