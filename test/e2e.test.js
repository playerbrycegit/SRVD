'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../src/shared-kernel/db');
const { createServer } = require('../src/http/server');
const { clearAll } = require('../src/http/rate-limit');

async function withServer(fn) {
  clearAll(); // rate-limit buckets are module-level state; reset between tests so they don't bleed across
  const db = createDb(':memory:');
  runMigrations(db);
  const server = createServer(db);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(base, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
async function get(base, path, token) {
  const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
}

/** Full register->verify->login flow, matching what a real client does now that verification is gated. */
async function registerVerifyLogin(base, email, password = 'password123') {
  const reg = await post(base, '/auth/register', { email, password });
  const { verificationToken } = reg.json.devOnly;
  await post(base, '/auth/verify-email', { token: verificationToken });
  const login = await post(base, '/auth/login', { email, password });
  return login.json.data;
}

test('E2E: health check responds', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});

test('E2E: protected route without a token returns 401', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/shifts');
    assert.equal(res.status, 401);
  });
});

test('E2E: register -> verify -> login -> log a shift -> read it back', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'bartender@example.com');
    const logShift = await post(base, '/shifts', { shift_date: '2026-07-11', cash_tips: 120, card_tips: 45 }, session.token);
    assert.equal(logShift.status, 201);
    const list = await get(base, '/shifts', session.token);
    assert.equal(list.json.data.length, 1);
    assert.equal(list.json.data[0].cash_tips, 120);
  });
});

test('E2E VERIFICATION GATE: an unverified user cannot log a shift', async () => {
  await withServer(async (base) => {
    const reg = await post(base, '/auth/register', { email: 'unverified@example.com', password: 'password123' });
    const login = await post(base, '/auth/login', { email: 'unverified@example.com', password: 'password123' });
    const attempt = await post(base, '/shifts', { shift_date: '2026-07-11', cash_tips: 50, card_tips: 0 }, login.json.data.token);
    assert.equal(attempt.status, 403);
  });
});

test('E2E VERIFICATION GATE: an unverified user cannot create a recipe', async () => {
  await withServer(async (base) => {
    await post(base, '/auth/register', { email: 'unverified2@example.com', password: 'password123' });
    const login = await post(base, '/auth/login', { email: 'unverified2@example.com', password: 'password123' });
    const attempt = await post(base, '/recipes', { name: 'X', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] }, login.json.data.token);
    assert.equal(attempt.status, 403);
  });
});

test('E2E VERIFICATION GATE: a bogus verification token is rejected', async () => {
  await withServer(async (base) => {
    const res = await post(base, '/auth/verify-email', { token: 'not-a-real-token' });
    assert.equal(res.status, 400);
  });
});

test('E2E VERIFICATION GATE: a verification token cannot be reused', async () => {
  await withServer(async (base) => {
    const reg = await post(base, '/auth/register', { email: 'reuse@example.com', password: 'password123' });
    const { verificationToken } = reg.json.devOnly;
    const first = await post(base, '/auth/verify-email', { token: verificationToken });
    assert.equal(first.status, 200);
    const second = await post(base, '/auth/verify-email', { token: verificationToken });
    assert.equal(second.status, 400);
  });
});

test('E2E PASSWORD RESET: full flow — request, reset, old password no longer works, new one does', async () => {
  await withServer(async (base) => {
    await registerVerifyLogin(base, 'reset@example.com', 'oldpassword1');
    const req = await post(base, '/auth/request-password-reset', { email: 'reset@example.com' });
    assert.equal(req.status, 200);
    const resetToken = req.json.devOnly.resetToken;
    assert.ok(resetToken);

    const reset = await post(base, '/auth/reset-password', { token: resetToken, newPassword: 'newpassword1' });
    assert.equal(reset.status, 200);

    const oldLogin = await post(base, '/auth/login', { email: 'reset@example.com', password: 'oldpassword1' });
    assert.equal(oldLogin.status, 400);
    const newLogin = await post(base, '/auth/login', { email: 'reset@example.com', password: 'newpassword1' });
    assert.equal(newLogin.status, 200);
  });
});

test('E2E PASSWORD RESET: requesting a reset for a nonexistent email returns the same shape, no token', async () => {
  await withServer(async (base) => {
    const res = await post(base, '/auth/request-password-reset', { email: 'ghost@example.com' });
    assert.equal(res.status, 200);
    assert.equal(res.json.devOnly.resetToken, null);
  });
});

test('E2E PASSWORD RESET: resetting revokes existing sessions (a stolen token cannot survive a reset)', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'revoke@example.com', 'oldpassword1');
    // the pre-reset session should work right now
    const before = await get(base, '/shifts', session.token);
    assert.equal(before.status, 200);

    const req = await post(base, '/auth/request-password-reset', { email: 'revoke@example.com' });
    await post(base, '/auth/reset-password', { token: req.json.devOnly.resetToken, newPassword: 'newpassword1' });

    const after = await get(base, '/shifts', session.token);
    assert.equal(after.status, 401); // old session token is dead
  });
});

test('E2E RATE LIMIT: auth endpoints reject after exceeding the limit', async () => {
  await withServer(async (base) => {
    let last;
    for (let i = 0; i < 12; i++) {
      last = await post(base, '/auth/login', { email: 'x@example.com', password: 'wrong' });
    }
    assert.equal(last.status, 429);
  });
});

test('E2E: batch calculator endpoint returns correct scaled amounts', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'a@example.com');
    const calc = await post(base, '/tools/batch', { baseServings: 1, targetServings: 12, ingredients: [{ name: 'Gin', amount: 2 }] }, session.token);
    assert.equal(calc.json.data[0].scaledAmount, 24);
  });
});

test('E2E OWNERSHIP: user B cannot fetch user A\'s recipe by id over the API, even with a valid token', async () => {
  await withServer(async (base) => {
    const userA = await registerVerifyLogin(base, 'a@example.com');
    const userB = await registerVerifyLogin(base, 'b@example.com');

    const created = await post(base, '/recipes', { name: 'Secret Recipe', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] }, userA.token);
    const recipeId = created.json.data.id;

    const bStealAttempt = await get(base, `/recipes/${recipeId}`, userB.token);
    assert.equal(bStealAttempt.status, 404); // not 403 - Stage 4 §7: doesn't even confirm it exists
  });
});

test('E2E: an expired/garbage token is rejected with 401, not a server error', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/shifts', 'garbage-token-value');
    assert.equal(res.status, 401);
  });
});
