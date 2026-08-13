'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb, runMigrations } = require('../dist/src/shared-kernel/data-access');
const { createServer } = require('../dist/src/http/server');
const { clearAll } = require('../dist/src/http/rate-limit');

async function withServer(fn) {
  clearAll();
  const db = createDb(':memory:');
  runMigrations(db);
  const server = createServer(db, { allowDevTokenExposure: true });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function request(base, method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

async function post(base, path, body, token) { return request(base, 'POST', path, body, token); }
async function get(base, path, token) { return request(base, 'GET', path, undefined, token); }

async function registerVerifyLogin(base, email) {
  const reg = await post(base, '/auth/register', { email, password: 'password123' });
  await post(base, '/auth/verify-email', { token: reg.json.devOnly.verificationToken });
  const login = await post(base, '/auth/login', { email, password: 'password123' });
  return login.json.data;
}

test('CONNECT E2E: create venue -> guest -> visit -> list', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'connect-flow@example.com');
    const venue = await post(base, '/connect/venues', { name: 'Marora Lounge', city: 'Houston' }, session.token);
    assert.equal(venue.status, 201);

    const guest = await post(base, '/connect/guests', {
      firstName: 'Jordan', lastName: 'Miles', firstMetVenueId: venue.json.data.id, isRegular: true,
    }, session.token);
    assert.equal(guest.status, 201);

    const visit = await post(base, `/connect/guests/${guest.json.data.id}/visits`, {
      venueId: venue.json.data.id, drinks: 'Old Fashioned', occasion: 'Promotion',
    }, session.token);
    assert.equal(visit.status, 201);

    const list = await post(base, '/connect/lists', { name: 'Regulars' }, session.token);
    assert.equal(list.status, 201);
    const add = await post(base, `/connect/lists/${list.json.data.id}/guests/${guest.json.data.id}`, {}, session.token);
    assert.equal(add.status, 200);

    const members = await get(base, `/connect/lists/${list.json.data.id}/guests`, session.token);
    assert.equal(members.status, 200);
    assert.equal(members.json.data.length, 1);
    assert.equal(members.json.data[0].display_name, 'Jordan Miles');
  });
});

test('CONNECT E2E OWNERSHIP: bartender B cannot read bartender A guest', async () => {
  await withServer(async (base) => {
    const a = await registerVerifyLogin(base, 'connect-owner-a@example.com');
    const b = await registerVerifyLogin(base, 'connect-owner-b@example.com');
    const guest = await post(base, '/connect/guests', { displayName: 'Private Regular' }, a.token);
    const steal = await get(base, `/connect/guests/${guest.json.data.id}`, b.token);
    assert.equal(steal.status, 404);
  });
});

test('CONNECT E2E CONSENT: preview excludes guest before explicit consent', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'connect-consent@example.com');
    const guest = await post(base, '/connect/guests', { displayName: 'Morgan', email: 'morgan@example.com' }, session.token);
    const preview = await post(base, '/connect/messages/preview', { guestIds: [guest.json.data.id], channel: 'email' }, session.token);
    assert.equal(preview.status, 200);
    assert.equal(preview.json.data.eligible, 0);
    assert.equal(preview.json.data.recipients[0].status, 'no_consent');
  });
});

test('CONNECT E2E CONSENT: grant allows preview, revoke suppresses future preview', async () => {
  await withServer(async (base) => {
    const session = await registerVerifyLogin(base, 'connect-revoke@example.com');
    const guest = await post(base, '/connect/guests', { displayName: 'Morgan', email: 'morgan@example.com' }, session.token);
    const guestId = guest.json.data.id;

    const grant = await post(base, `/connect/guests/${guestId}/consent`, {
      channel: 'email', consentType: 'general_updates', status: 'granted', source: 'guest_signup',
    }, session.token);
    assert.equal(grant.status, 200);

    const allowed = await post(base, '/connect/messages/preview', { guestIds: [guestId], channel: 'email' }, session.token);
    assert.equal(allowed.json.data.eligible, 1);
    assert.equal(allowed.json.data.recipients[0].status, 'eligible');

    const revoke = await post(base, `/connect/guests/${guestId}/consent`, {
      channel: 'email', consentType: 'general_updates', status: 'revoked', source: 'guest_unsubscribe',
    }, session.token);
    assert.equal(revoke.status, 200);

    const blocked = await post(base, '/connect/messages/preview', { guestIds: [guestId], channel: 'email' }, session.token);
    assert.equal(blocked.json.data.eligible, 0);
    assert.equal(blocked.json.data.recipients[0].status, 'suppressed');
  });
});

test('CONNECT E2E AUTH: unauthenticated access is rejected', async () => {
  await withServer(async (base) => {
    const res = await get(base, '/connect/guests');
    assert.equal(res.status, 401);
  });
});
