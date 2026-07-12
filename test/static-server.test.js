'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStaticServer } = require('../dist/src/http/static-server');

async function withStaticServer(fn) {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('static server: serves index.html at root', async () => {
  await withStaticServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /STATION/);
  });
});

test('static server: serves the design tokens CSS', async () => {
  await withStaticServer(async (base) => {
    const res = await fetch(`${base}/css/tokens.css`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /--gold: #C9A961/);
  });
});

test('static server: serves the shared calculation engine so client-side Tools reuse the real formulas', async () => {
  await withStaticServer(async (base) => {
    const res = await fetch(`${base}/shared-kernel/calculations/index.js`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /scaleBatch/);
    assert.match(body, /STATION_CALC/); // confirms the browser export path is present
  });
});

test('static server: unknown static path returns the SPA fallback (index.html), not a raw 404 for hash routes', async () => {
  await withStaticServer(async (base) => {
    const res = await fetch(`${base}/some/client/route`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /STATION/);
  });
});

test('static server: never leaks filesystem content outside the web directory via path traversal', async () => {
  await withStaticServer(async (base) => {
    // fetch() normalizes simple "../" before the request is even sent, so this hits the guard
    // with an encoded traversal sequence the browser/client would not pre-normalize away.
    const res = await fetch(`${base}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd`);
    const body = await res.text();
    assert.doesNotMatch(body, /root:.*:0:0:/); // the actual /etc/passwd content, if it leaked
  });
});
