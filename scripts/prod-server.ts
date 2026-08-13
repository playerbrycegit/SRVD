/**
 * SRVD production entrypoint.
 *
 * Serves the JSON API and static web client from one port. For the controlled beta, SQLite is
 * supported when DATABASE_URL points to a persistent mounted file and the app runs as one process.
 * PostgreSQL remains a separate scale-up migration and must not be implied by this entrypoint.
 */
import * as http from 'node:http';
import * as path from 'node:path';
import { createDb, runMigrations } from '../src/shared-kernel/data-access';
import { createServer } from '../src/http/server';
import { createStaticServer } from '../src/http/static-server';
import { loadConfig, describeConfigForLogging, EnvironmentValidationError } from '../src/shared-kernel/env';
import { ConsoleEmailService, ProviderEmailService, type EmailService } from '../src/shared-kernel/email';

/** API route prefixes. Anything matching these is handled by the API; everything else is static. */
const API_PREFIXES = ['/health', '/auth', '/shifts', '/goals', '/recipes', '/tools', '/settings', '/alpha', '/connect'];

function isApiPath(rawUrl: string | undefined): boolean {
  const p = (rawUrl ?? '/').split('?')[0] ?? '/';
  return API_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

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

const sqlitePath = resolveSqlitePath(config.databaseUrl as string);
// eslint-disable-next-line no-console
console.log(`[srvd] SQLite beta database path: ${sqlitePath}`);

const db = createDb(sqlitePath);
const applied = runMigrations(db);
// eslint-disable-next-line no-console
console.log(`[srvd] ${applied.length} migrations applied`);

const emailApiKey = process.env.EMAIL_PROVIDER_API_KEY;
const emailSender = process.env.EMAIL_SENDER_ADDRESS;
const emailService: EmailService = config.nodeEnv === 'production' && emailApiKey && emailSender
  ? new ProviderEmailService(emailApiKey, emailSender)
  : new ConsoleEmailService(config.allowDevTokenExposure);

const apiServer = createServer(db, config, emailService, config.appUrl);
const staticServer = createStaticServer();
const apiHandler = apiServer.listeners('request')[0] as http.RequestListener;
const staticHandler = staticServer.listeners('request')[0] as http.RequestListener;

const combined = http.createServer((req, res) => {
  if (isApiPath(req.url)) apiHandler(req, res);
  else staticHandler(req, res);
});

combined.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[srvd] production server listening on :${config.port} (API + web, single origin)`);
});
