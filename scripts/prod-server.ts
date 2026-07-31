/**
 * SRVD production entrypoint.
 *
 * Serves BOTH the JSON API and the static web client from a SINGLE port (Railway/Render
 * give a service exactly one $PORT). Same-origin means no CORS and no hardcoded API URL —
 * the frontend talks to the API with relative paths (see web/js/api-client.js).
 *
 * Database: SQLite file whose path comes from DATABASE_URL. On Railway this must point at a
 * MOUNTED VOLUME (e.g. /data/srvd.sqlite) so the file survives redeploys — the app directory
 * itself is ephemeral. A `file:` prefix is tolerated and stripped.
 *
 * This file is deployment plumbing only. It adds no product features and changes no behavior
 * of the API or the client — it composes the two existing servers that the test suite already
 * covers (172/172).
 */
import * as http from 'node:http';
import * as path from 'node:path';
import { createDb, runMigrations } from '../src/shared-kernel/data-access';
import { createServer } from '../src/http/server';
import { createStaticServer } from '../src/http/static-server';
import { loadConfig, describeConfigForLogging, EnvironmentValidationError } from '../src/shared-kernel/env';
import { ConsoleEmailService, ProviderEmailService, type EmailService } from '../src/shared-kernel/email';

/** API route prefixes. Anything matching these is handled by the API; everything else is static. */
const API_PREFIXES = ['/health', '/auth', '/shifts', '/goals', '/recipes', '/tools', '/settings', '/alpha'];

function isApiPath(rawUrl: string | undefined): boolean {
  const p = (rawUrl ?? '/').split('?')[0] ?? '/';
  return API_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

/** DATABASE_URL carries the SQLite file path for the beta (SQLite-on-volume strategy). */
function resolveSqlitePath(databaseUrl: string): string {
  const stripped = databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
  return path.isAbsolute(stripped) ? stripped : path.resolve(stripped);
}

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof EnvironmentValidationError) {
    // eslint-disable-next-line no-console
    console.error(`[srvd] Refusing to start: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

// eslint-disable-next-line no-console
console.log('[srvd] Config loaded:', describeConfigForLogging(config));

// config.databaseUrl is guaranteed non-null in production by loadConfig's validation.
const sqlitePath = resolveSqlitePath(config.databaseUrl as string);
// eslint-disable-next-line no-console
console.log(`[srvd] SQLite path: ${sqlitePath}`);

const db = createDb(sqlitePath);
const applied = runMigrations(db);
// eslint-disable-next-line no-console
console.log(`[srvd] ${applied.length} migrations applied`);

const emailApiKey = process.env.EMAIL_PROVIDER_API_KEY;
const emailSender = process.env.EMAIL_SENDER_ADDRESS;
const emailService: EmailService = config.nodeEnv === 'production' && emailApiKey && emailSender
  ? new ProviderEmailService(emailApiKey, emailSender)
  : new ConsoleEmailService(config.allowDevTokenExposure);

// Build the two existing servers but do NOT let them bind ports — we only borrow their
// request handlers and compose them behind one listener.
const apiServer = createServer(db, config, emailService, config.appUrl);
const staticServer = createStaticServer();
const apiHandler = apiServer.listeners('request')[0] as http.RequestListener;
const staticHandler = staticServer.listeners('request')[0] as http.RequestListener;

const combined = http.createServer((req, res) => {
  if (isApiPath(req.url)) {
    apiHandler(req, res);
  } else {
    staticHandler(req, res);
  }
});

combined.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[srvd] production server listening on :${config.port} (API + web, single origin)`);
});
