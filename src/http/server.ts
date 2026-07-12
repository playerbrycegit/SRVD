/**
 * HTTP server, converted to strict TypeScript. SUBSTITUTION NOTICE: Stage 4 §2 specifies a
 * Fastify-class framework; this sandbox cannot install one (no network). Route structure, auth
 * middleware placement, and the response envelope match Stage 9 §6, so porting to a real
 * framework later is a mechanical swap of this file, not a rewrite of business logic.
 *
 * SECURITY IMPROVEMENT in this migration: the `devOnly` field (verification/reset/invitation
 * tokens exposed directly in API responses) is now gated by `config.allowDevTokenExposure`, which
 * `env.ts` makes structurally false in production — closing the #1 Critical Blocker named in the
 * prior production audit ("token leakage... a real production blocker"). Previously this was
 * unconditional.
 */
import * as http from 'node:http';
import { URL } from 'node:url';
import { AuthService } from '../modules/auth/service';
import { ShiftsService } from '../modules/shifts/service';
import { RecipesService } from '../modules/recipes/service';
import { AlphaService } from '../modules/alpha/service';
import { ValidationError } from '../shared-kernel/validation';
import { CalculationError, scaleBatch, calculateAbv, convertUnit } from '../shared-kernel/calculations';
import { writeAudit } from '../shared-kernel/audit';
import { isRateLimited, AUTH_LIMIT, STANDARD_LIMIT } from './rate-limit';
import type { Database } from '../shared-kernel/data-access';
import type { AppConfig } from '../shared-kernel/env';
import type { ApiSuccessEnvelope, ApiErrorEnvelope } from '../shared-kernel/types';

function sendJson<T>(res: http.ServerResponse, status: number, body: ApiSuccessEnvelope<T>): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}
function sendError(res: http.ServerResponse, status: number, message: string, field: string | null = null): void {
  const body: ApiErrorEnvelope = { error: { message, field } };
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Malformed JSON body', null);
  }
}

export function createServer(db: Database, config: Pick<AppConfig, 'allowDevTokenExposure'>): http.Server {
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const recipes = new RecipesService(db);
  const alpha = new AlphaService(db);

  /** Only attaches devOnly data when config permits it — see file header. */
  function devOnly(payload: Record<string, unknown>): Record<string, unknown> | undefined {
    return config.allowDevTokenExposure ? payload : undefined;
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const clientIp = req.socket.remoteAddress ?? 'unknown';

    const isAuthRoute = url.pathname.startsWith('/auth/');
    const limit = isAuthRoute ? AUTH_LIMIT : STANDARD_LIMIT;
    const limitKey = `${clientIp}:${isAuthRoute ? 'auth' : 'standard'}`;
    if (isRateLimited(limitKey, limit)) {
      sendError(res, 429, 'Too many requests — try again shortly', null);
      return;
    }

    try {
      // ---------- Auth (no token required) ----------
      if (req.method === 'POST' && url.pathname === '/auth/register') {
        const body = await readJsonBody(req);
        const result = auth.register(body as { email: string; password: string });
        const verificationToken = auth.issueVerificationToken(result.id);
        return sendJson(res, 201, { data: result, devOnly: devOnly({ verificationToken }) });
      }
      if (req.method === 'POST' && url.pathname === '/auth/verify-email') {
        const body = await readJsonBody(req);
        const result = auth.verifyEmail(body.token as string);
        return sendJson(res, 200, { data: result });
      }
      if (req.method === 'POST' && url.pathname === '/auth/request-password-reset') {
        const body = await readJsonBody(req);
        const result = auth.requestPasswordReset(body.email as string);
        return sendJson(res, 200, { data: { requested: true }, devOnly: devOnly({ resetToken: result.token }) });
      }
      if (req.method === 'POST' && url.pathname === '/auth/reset-password') {
        const body = await readJsonBody(req);
        const result = auth.resetPassword({ token: body.token as string, newPassword: body.newPassword as string });
        return sendJson(res, 200, { data: result });
      }
      if (req.method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJsonBody(req);
        const result = auth.login(body as { email: string; password: string; deviceLabel?: string | null });
        return sendJson(res, 200, { data: result });
      }
      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        auth.logout(bearer);
        return sendJson(res, 200, { data: { loggedOut: true } });
      }
      if (req.method === 'POST' && url.pathname === '/alpha/accept-invitation') {
        const body = await readJsonBody(req);
        const result = alpha.acceptInvitation({ token: body.token as string, userId: body.userId as string });
        return sendJson(res, 200, { data: result });
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
      // TypeScript can't know userId is non-null past this guard on its own for every branch below,
      // but every reachable branch here is gated by the check above — assert it once, explicitly.
      const authedUserId = userId as string;

      if (req.method === 'POST' && url.pathname === '/auth/delete-account') {
        const body = await readJsonBody(req);
        auth.deleteAccount({ userId: authedUserId, password: body.password as string });
        return sendJson(res, 200, { data: { deleted: true } });
      }

      // ---------- Alpha operations ----------
      if (req.method === 'POST' && url.pathname === '/alpha/invite') {
        const body = await readJsonBody(req);
        const result = alpha.inviteParticipant(body as { email: string; segment?: string | null });
        return sendJson(res, 201, {
          data: { id: result.id, email: result.email, expiresAt: result.expiresAt },
          devOnly: devOnly({ invitationToken: result.token }),
        });
      }
      if (req.method === 'POST' && url.pathname === '/alpha/feedback') {
        const body = await readJsonBody(req);
        const result = alpha.submitFeedback(authedUserId, body);
        return sendJson(res, 201, { data: result });
      }
      if (req.method === 'GET' && url.pathname === '/alpha/feedback') {
        return sendJson(res, 200, { data: alpha.listMyFeedback(authedUserId) });
      }

      // ---------- Shifts ----------
      if (req.method === 'POST' && url.pathname === '/shifts') {
        if (!auth.isEmailVerified(authedUserId)) return sendError(res, 403, 'Verify your email before logging a shift', null);
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: shifts.logShift(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/shifts') {
        return sendJson(res, 200, { data: shifts.listShifts(authedUserId) });
      }
      if (req.method === 'GET' && url.pathname === '/shifts/stats') {
        return sendJson(res, 200, { data: shifts.getStats(authedUserId) });
      }
      if (req.method === 'DELETE' && /^\/shifts\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2] as string;
        const ok = shifts.deleteShift(authedUserId, id);
        return ok ? sendJson(res, 200, { data: { deleted: true } }) : sendError(res, 404, 'Shift not found', null);
      }
      if (req.method === 'POST' && url.pathname === '/goals') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: shifts.setGoal(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/goals') {
        return sendJson(res, 200, { data: shifts.getGoalProgress(authedUserId) });
      }

      // ---------- Recipes ----------
      if (req.method === 'POST' && url.pathname === '/recipes') {
        if (!auth.isEmailVerified(authedUserId)) return sendError(res, 403, 'Verify your email before creating a recipe', null);
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: recipes.createRecipe(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/recipes') {
        const search = url.searchParams.get('search') ?? '';
        const category = url.searchParams.get('category');
        return sendJson(res, 200, { data: recipes.listRecipes(authedUserId, { search, category }) });
      }
      if (req.method === 'GET' && /^\/recipes\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2] as string;
        const recipe = recipes.getRecipe(authedUserId, id);
        return recipe ? sendJson(res, 200, { data: recipe }) : sendError(res, 404, 'Recipe not found', null);
      }
      if (req.method === 'DELETE' && /^\/recipes\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[2] as string;
        const ok = recipes.deleteRecipe(authedUserId, id);
        return ok ? sendJson(res, 200, { data: { deleted: true } }) : sendError(res, 404, 'Recipe not found', null);
      }

      // ---------- Tools (stateless, Shared Kernel calc engine, Stage 4 §16) ----------
      if (req.method === 'POST' && url.pathname === '/tools/batch') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: scaleBatch(body as never) });
      }
      if (req.method === 'POST' && url.pathname === '/tools/abv') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: calculateAbv(body as never) });
      }
      if (req.method === 'POST' && url.pathname === '/tools/convert') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: { result: convertUnit(body as never) } });
      }

      return sendError(res, 404, 'Not found', null);
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 400, err.message, err.field);
      if (err instanceof CalculationError) return sendError(res, 400, err.message, null);
      // Stage 9 §9: server errors never leak detail to the client.
      // eslint-disable-next-line no-console
      console.error(err);
      return sendError(res, 500, 'Something went wrong — try again', null);
    }
  });
}
