/**
 * SRVD HTTP server. All protected routes pass through the same session/ownership chokepoint.
 * Development token exposure is controlled by config.allowDevTokenExposure and remains disabled
 * structurally in production by env.ts.
 */
import * as http from 'node:http';
import { URL } from 'node:url';
import { AuthService } from '../modules/auth/service';
import { ShiftsService } from '../modules/shifts/service';
import { RecipesService } from '../modules/recipes/service';
import { AlphaService } from '../modules/alpha/service';
import { SettingsService } from '../modules/settings/service';
import { ConnectService } from '../modules/connect/service';
import { ValidationError } from '../shared-kernel/validation';
import { CalculationError, scaleBatch, calculateAbv, convertUnit } from '../shared-kernel/calculations';
import { writeAudit } from '../shared-kernel/audit';
import { ConsoleAnalytics, trackSafely } from '../shared-kernel/analytics';
import { isRateLimited, AUTH_LIMIT, STANDARD_LIMIT, EXPORT_LIMIT } from './rate-limit';
import { buildVerificationEmail, buildPasswordResetEmail, buildPasswordChangedEmail, type EmailService } from '../shared-kernel/email';
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

export function createServer(
  db: Database,
  config: Pick<AppConfig, 'allowDevTokenExposure'>,
  email?: EmailService,
  appUrl: string = 'http://localhost:4002'
): http.Server {
  const auth = new AuthService(db);
  const shifts = new ShiftsService(db);
  const recipes = new RecipesService(db);
  const alpha = new AlphaService(db);
  const settings = new SettingsService(db);
  const connect = new ConnectService(db);
  const analytics = new ConsoleAnalytics();

  function devOnly(payload: Record<string, unknown>): Record<string, unknown> | undefined {
    return config.allowDevTokenExposure ? payload : undefined;
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const clientIp = req.socket.remoteAddress ?? 'unknown';

    const isAuthRoute = url.pathname.startsWith('/auth/');
    const isExportRoute = url.pathname === '/settings/export';
    const limit = isAuthRoute ? AUTH_LIMIT : isExportRoute ? EXPORT_LIMIT : STANDARD_LIMIT;
    const limitKey = `${clientIp}:${isAuthRoute ? 'auth' : isExportRoute ? 'export' : 'standard'}`;
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
        if (email) {
          const verificationUrl = `${appUrl}/#/verify?token=${encodeURIComponent(verificationToken)}`;
          void email.send(buildVerificationEmail(result.email, verificationUrl)).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[email] verification send failed', err);
          });
        }
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
        if (email && result.token) {
          const resetUrl = `${appUrl}/#/reset-password?token=${encodeURIComponent(result.token)}`;
          void email.send(buildPasswordResetEmail(body.email as string, resetUrl)).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[email] reset send failed', err);
          });
        }
        return sendJson(res, 200, { data: { requested: true }, devOnly: devOnly({ resetToken: result.token }) });
      }
      if (req.method === 'POST' && url.pathname === '/auth/reset-password') {
        const body = await readJsonBody(req);
        const result = auth.resetPassword({ token: body.token as string, newPassword: body.newPassword as string });
        if (email && result.email) {
          void email.send(buildPasswordChangedEmail(result.email)).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[email] password-changed notification failed', err);
          });
        }
        return sendJson(res, 200, { data: { reset: result.reset } });
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

      // ---------- Authentication chokepoint ----------
      const userId = auth.verifySession(bearer);
      const protectedRoute = !url.pathname.startsWith('/auth/');
      if (protectedRoute && !userId) {
        writeAudit(db, { userId: null, action: 'permission_denied', metadata: { path: url.pathname } });
        return sendError(res, 401, 'Authentication required', null);
      }
      const authedUserId = userId as string;

      if (req.method === 'POST' && url.pathname === '/auth/delete-account') {
        const body = await readJsonBody(req);
        auth.deleteAccount({ userId: authedUserId, password: body.password as string });
        return sendJson(res, 200, { data: { deleted: true } });
      }

      // ---------- Settings ----------
      if (req.method === 'GET' && url.pathname === '/settings') {
        return sendJson(res, 200, { data: settings.getSettings(authedUserId) });
      }
      if (req.method === 'PATCH' && url.pathname === '/settings') {
        const body = await readJsonBody(req);
        return sendJson(res, 200, { data: settings.updateSettings(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/settings/sessions') {
        const currentSessionId = auth.getSessionId(bearer);
        return sendJson(res, 200, { data: settings.listSessions(authedUserId, currentSessionId) });
      }
      if (req.method === 'DELETE' && /^\/settings\/sessions\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3] as string;
        const ok = settings.revokeSession(authedUserId, id);
        return ok ? sendJson(res, 200, { data: { revoked: true } }) : sendError(res, 404, 'Session not found', null);
      }
      if (req.method === 'POST' && url.pathname === '/settings/sessions/revoke-all') {
        const currentSessionId = auth.getSessionId(bearer);
        const count = settings.revokeAllSessions(authedUserId, currentSessionId);
        return sendJson(res, 200, { data: { revokedCount: count } });
      }
      if (req.method === 'GET' && url.pathname === '/settings/export') {
        return sendJson(res, 200, { data: settings.exportData(authedUserId) });
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
      if (req.method === 'PATCH' && /^\/shifts\/[^/]+$/.test(url.pathname)) {
        if (!auth.isEmailVerified(authedUserId)) return sendError(res, 403, 'Verify your email before editing a shift', null);
        const id = url.pathname.split('/')[2] as string;
        const body = await readJsonBody(req);
        const updated = shifts.updateShift(authedUserId, id, body);
        if (!updated) return sendError(res, 404, 'Shift not found', null);
        trackSafely(analytics, { name: 'shift_edited', userId: authedUserId, timestamp: Date.now(), properties: {} });
        return sendJson(res, 200, { data: updated });
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
      if (req.method === 'PATCH' && /^\/recipes\/[^/]+$/.test(url.pathname)) {
        if (!auth.isEmailVerified(authedUserId)) return sendError(res, 403, 'Verify your email before editing a recipe', null);
        const id = url.pathname.split('/')[2] as string;
        const body = await readJsonBody(req);
        const updated = recipes.updateRecipe(authedUserId, id, body);
        if (!updated) return sendError(res, 404, 'Recipe not found', null);
        trackSafely(analytics, {
          name: 'recipe_edited', userId: authedUserId, timestamp: Date.now(),
          properties: { recipeCategory: updated.category, fieldCount: updated.ingredients.length },
        });
        return sendJson(res, 200, { data: updated });
      }

      // ---------- SERVD Connect ----------
      if (req.method === 'POST' && url.pathname === '/connect/venues') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: connect.createVenue(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/connect/venues') {
        return sendJson(res, 200, { data: connect.listVenues(authedUserId) });
      }
      if (req.method === 'POST' && url.pathname === '/connect/guests') {
        const body = await readJsonBody(req);
        const guest = connect.createGuest(authedUserId, body);
        trackSafely(analytics, { name: 'connect_guest_created', userId: authedUserId, timestamp: Date.now(), properties: {} });
        return sendJson(res, 201, { data: guest });
      }
      if (req.method === 'GET' && url.pathname === '/connect/guests') {
        const search = url.searchParams.get('search') ?? '';
        const includeArchived = url.searchParams.get('includeArchived') === 'true';
        return sendJson(res, 200, { data: connect.listGuests(authedUserId, { search, includeArchived }) });
      }
      if (req.method === 'GET' && /^\/connect\/guests\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3] as string;
        const guest = connect.getGuest(authedUserId, id);
        return guest ? sendJson(res, 200, { data: guest }) : sendError(res, 404, 'Guest not found', null);
      }
      if (req.method === 'PATCH' && /^\/connect\/guests\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3] as string;
        const body = await readJsonBody(req);
        const guest = connect.updateGuest(authedUserId, id, body);
        return guest ? sendJson(res, 200, { data: guest }) : sendError(res, 404, 'Guest not found', null);
      }
      if (req.method === 'DELETE' && /^\/connect\/guests\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3] as string;
        const archived = connect.archiveGuest(authedUserId, id);
        return archived ? sendJson(res, 200, { data: { archived: true } }) : sendError(res, 404, 'Guest not found', null);
      }
      if (req.method === 'POST' && /^\/connect\/guests\/[^/]+\/visits$/.test(url.pathname)) {
        const guestId = url.pathname.split('/')[3] as string;
        const body = await readJsonBody(req);
        const visit = connect.logVisit(authedUserId, guestId, body);
        trackSafely(analytics, { name: 'connect_visit_logged', userId: authedUserId, timestamp: Date.now(), properties: {} });
        return sendJson(res, 201, { data: visit });
      }
      if (req.method === 'GET' && /^\/connect\/guests\/[^/]+\/visits$/.test(url.pathname)) {
        const guestId = url.pathname.split('/')[3] as string;
        return sendJson(res, 200, { data: connect.listVisits(authedUserId, guestId) });
      }
      if (req.method === 'POST' && url.pathname === '/connect/lists') {
        const body = await readJsonBody(req);
        return sendJson(res, 201, { data: connect.createList(authedUserId, body) });
      }
      if (req.method === 'GET' && url.pathname === '/connect/lists') {
        return sendJson(res, 200, { data: connect.listLists(authedUserId) });
      }
      if (req.method === 'POST' && /^\/connect\/lists\/[^/]+\/guests\/[^/]+$/.test(url.pathname)) {
        const [, , , listId, , guestId] = url.pathname.split('/');
        const added = connect.addGuestToList(authedUserId, listId as string, guestId as string);
        return added ? sendJson(res, 200, { data: { added: true } }) : sendError(res, 404, 'List or guest not found', null);
      }
      if (req.method === 'GET' && /^\/connect\/lists\/[^/]+\/guests$/.test(url.pathname)) {
        const listId = url.pathname.split('/')[3] as string;
        return sendJson(res, 200, { data: connect.listGuestsInList(authedUserId, listId) });
      }
      if (req.method === 'POST' && /^\/connect\/guests\/[^/]+\/consent$/.test(url.pathname)) {
        const guestId = url.pathname.split('/')[3] as string;
        const body = await readJsonBody(req);
        connect.setConsent(authedUserId, guestId, body);
        return sendJson(res, 200, { data: { updated: true } });
      }
      if (req.method === 'POST' && /^\/connect\/guests\/[^/]+\/suppress$/.test(url.pathname)) {
        const guestId = url.pathname.split('/')[3] as string;
        const body = await readJsonBody(req);
        connect.suppress(authedUserId, guestId, body.channel, typeof body.reason === 'string' ? body.reason : 'manual');
        return sendJson(res, 200, { data: { suppressed: true } });
      }
      if (req.method === 'POST' && url.pathname === '/connect/messages/preview') {
        const body = await readJsonBody(req);
        const guestIds = Array.isArray(body.guestIds) ? body.guestIds.filter((v): v is string => typeof v === 'string') : [];
        const results = connect.previewRecipients(
          authedUserId,
          guestIds,
          body.channel,
          typeof body.consentType === 'string' ? body.consentType : 'general_updates'
        );
        const eligible = results.filter((r) => r.eligible).length;
        return sendJson(res, 200, { data: { selected: results.length, eligible, excluded: results.length - eligible, recipients: results } });
      }

      // ---------- Tools ----------
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
      // eslint-disable-next-line no-console
      console.error(err);
      return sendError(res, 500, 'Something went wrong — try again', null);
    }
  });
}
