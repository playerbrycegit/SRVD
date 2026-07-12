'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../src/shared-kernel/db');
const { createServer } = require('../src/http/server');

async function withServer(fn) {
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

test('E2E: health check responds', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });
});

test('E2E: protected route without a token returns 401', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/shifts`);
    assert.equal(res.status, 401);
  });
});

test('E2E: register -> login -> log a shift -> read it back', async () => {
  await withServer(async (base) => {
    const reg = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bartender@example.com', password: 'password123' }),
    });
    assert.equal(reg.status, 201);

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bartender@example.com', password: 'password123' }),
    });
    assert.equal(login.status, 200);
    const { data: session } = await login.json();

    const logShift = await fetch(`${base}/shifts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ shift_date: '2026-07-11', cash_tips: 120, card_tips: 45 }),
    });
    assert.equal(logShift.status, 201);

    const list = await fetch(`${base}/shifts`, { headers: { Authorization: `Bearer ${session.token}` } });
    const { data: shiftList } = await list.json();
    assert.equal(shiftList.length, 1);
    assert.equal(shiftList[0].cash_tips, 120);
  });
});

test('E2E: batch calculator endpoint returns correct scaled amounts', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: 'password123' }),
    });
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: 'password123' }),
    });
    const { data: session } = await login.json();

    const calc = await fetch(`${base}/tools/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ baseServings: 1, targetServings: 12, ingredients: [{ name: 'Gin', amount: 2 }] }),
    });
    const { data } = await calc.json();
    assert.equal(data[0].scaledAmount, 24);
  });
});

test('E2E OWNERSHIP: user B cannot fetch user A\'s recipe by id over the API, even with a valid token', async () => {
  await withServer(async (base) => {
    async function registerAndLogin(email) {
      await fetch(`${base}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      const login = await fetch(`${base}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' }),
      });
      return (await login.json()).data;
    }
    const userA = await registerAndLogin('a@example.com');
    const userB = await registerAndLogin('b@example.com');

    const created = await fetch(`${base}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userA.token}` },
      body: JSON.stringify({ name: 'Secret Recipe', category: 'Classic', ingredients: [{ ingredient_name: 'Gin' }] }),
    });
    const { data: recipe } = await created.json();

    const bStealAttempt = await fetch(`${base}/recipes/${recipe.id}`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(bStealAttempt.status, 404); // not 403 - Stage 4 §7: doesn't even confirm it exists
  });
});

test('E2E: an expired/garbage token is rejected with 401, not a server error', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/shifts`, { headers: { Authorization: 'Bearer garbage-token-value' } });
    assert.equal(res.status, 401);
  });
});
