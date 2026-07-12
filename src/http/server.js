'use strict';
/**
 * HTTP server. SUBSTITUTION NOTICE: Stage 4 §2 specifies a Fastify-class framework. This sandbox
 * cannot install one (no network). This uses Node's built-in `http` module directly. Route
 * structure, auth middleware placement, and the response envelope match Stage 9 §6 exactly, so
 * porting to a real framework later is a mechanical swap of the routing layer, not a rewrite of
 * business logic (which lives entirely in the module services, never in this file).
 */
const http = require('node:http');
const { URL } = require('node:url');
const { AuthService } = require('../modules/auth/service');
const { ShiftsService } = require('../modules/shifts/service');
const { RecipesService } = require('../modules/recipes/service');
const { ValidationError } = require('../shared-kernel/validation');
const { CalculationError, scaleBatch, calculateAbv, convertUnit } = require('../shared-kernel/calculations');
const { writeAudit } = require('../shared-kernel/audit');

// Stage 9 §6: consistent error envelope, `field` only present for attributable errors.
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}
function sendError(res, status, message, field = null) {
  sendJson(res, status, { error: { message, field } });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Malformed JSON body', null);
  }
}

function createServer(db) {
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const recipes = new RecipesService(db);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    try {
      // ---------- Auth (no token required) ----------
      if (req.method === 'POST' && url.pathname === '/auth/register') {
        const body = await readJsonBody(req);
        const result = auth.register(body);
        return sendJson(res, 201, { data: result });
      }
      if (req.method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJsonBody(req);
        const result = auth.login(body);
        return sendJson(res, 200, { data: result });
      }
      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        auth.logout(bearer);
        return sendJson(res, 200, { data: { loggedOut: true } });
      }
      if (url.pathname === '/health') {
        return sendJson(res, 200, { data: { status: 'ok' } });
      }

      // ---------- Everything below requires a valid session (Stage 9 §6/§8 chokepoint) ----------
      const userId = auth.verifySession(bearer);
      const protectedRoute = !url.pathname.startsWith('/auth/');
      if (protectedRoute && !userId) {
        writeAudit(db, { userId: null, action: 'permission_denied', metadata: { path: url.pathname } });
        return sendError(res, 401, 'Authentication required', null);
      }

      if (req.method === 'POST' && url.pathname === '/auth/delete-account') {
        const body = await readJsonBody(req);
        auth.deleteAccount({ userId, password: body.password });
        return sendJson(res, 200, { data: { deleted: true } });
      }

      // ---------- Shifts ----------
      if (req.method === 'POST' && url.pathname === '/shifts') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: shifts.logShift(userId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/shifts') {
        return sendJson(res, 200, { data: shifts.listShifts(userId) });
      }
      if (req.method === 'GET' && url.pathname === '/shifts/stats') {
        return sendJson(res, 200, { data: shifts.getStats(userId) });
      }
      if (req.method === 'DELETE' && /^\/shifts\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2];
        const ok = shifts.deleteShift(userId, id);
        return ok ? sendJson(res, 200, { data: { deleted: true } }) : sendError(res, 404, 'Shift not found', null);
      }
      if (req.method === 'POST' && url.pathname === '/goals') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: shifts.setGoal(userId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/goals') {
        return sendJson(res, 200, { data: shifts.getGoalProgress(userId) });
      }

      // ---------- Recipes ----------
      if (req.method === 'POST' && url.pathname === '/recipes') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: recipes.createRecipe(userId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/recipes') {
        const search = url.searchParams.get('search') || '';
        const category = url.searchParams.get('category') || null;
        return sendJson(res, 200, { data: recipes.listRecipes(userId, { search, category }) });
      }
      if (req.method === 'GET' && /^\/recipes\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2];
        const recipe = recipes.getRecipe(userId, id);
        return recipe ? sendJson(res, 200, { data: recipe }) : sendError(res, 404, 'Recipe not found', null);
      }
      if (req.method === 'DELETE' && /^\/recipes\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2];
        const ok = recipes.deleteRecipe(userId, id);
        return ok ? sendJson(res, 200, { data: { deleted: true } }) : sendError(res, 404, 'Recipe not found', null);
      }

      // ---------- Tools (stateless, Shared Kernel calc engine, Stage 4 §16) ----------
      if (req.method === 'POST' && url.pathname === '/tools/batch') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: scaleBatch(body) });
      }
      if (req.method === 'POST' && url.pathname === '/tools/abv') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: calculateAbv(body) });
      }
      if (req.method === 'POST' && url.pathname === '/tools/convert') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: { result: convertUnit(body) } });
      }

      return sendError(res, 404, 'Not found', null);
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 400, err.message, err.field);
      if (err instanceof CalculationError) return sendError(res, 400, err.message, null);
      // Stage 9 §9: server errors never leak detail to the client.
      console.error(err); // eslint-disable-line no-console
      return sendError(res, 500, 'Something went wrong — try again', null);
    }
  });
}

module.exports = { createServer };
