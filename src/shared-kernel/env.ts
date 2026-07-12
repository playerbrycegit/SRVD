/**
 * Centralized environment configuration. Source: this migration's §3. Validates at startup,
 * fails fast, never logs secret values, and is the single place that decides whether dev-only
 * behavior (exposing verification/reset tokens directly in API responses) is permitted at all.
 */

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  nodeEnv: NodeEnv;
  appUrl: string;
  port: number;
  webPort: number;
  databaseUrl: string | null; // null in the current SQLite-backed sandbox; required once Postgres is wired in
  sessionTtlDays: number;
  /** True only outside production — gates the devOnly response field entirely. This is the one
   * flag that must be impossible to accidentally enable in production (§3, §14's explicit
   * completion criterion "development-token exposure is impossible in production"). */
  allowDevTokenExposure: boolean;
  cookieSecureMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class EnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentValidationError';
  }
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  const value = raw ?? 'development';
  if (value !== 'development' && value !== 'test' && value !== 'production') {
    throw new EnvironmentValidationError(`Invalid NODE_ENV: "${value}" — must be development, test, or production`);
  }
  return value;
}

function parsePort(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new EnvironmentValidationError(`Invalid ${label}: "${raw}" — must be a valid port number`);
  }
  return parsed;
}

/**
 * Loads and validates configuration from process.env. Throws EnvironmentValidationError with a
 * specific, actionable message on any problem — never falls back silently on something that
 * matters (§3: "fail fast on missing production variables").
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const port = parsePort(env.PORT, 4001, 'PORT');
  const webPort = parsePort(env.WEB_PORT, 4002, 'WEB_PORT');
  const appUrl = env.APP_URL ?? `http://localhost:${webPort}`;
  const sessionTtlDays = env.SESSION_TTL_DAYS ? Number(env.SESSION_TTL_DAYS) : 30;
  if (!Number.isFinite(sessionTtlDays) || sessionTtlDays <= 0) {
    throw new EnvironmentValidationError(`Invalid SESSION_TTL_DAYS: "${env.SESSION_TTL_DAYS}"`);
  }

  const databaseUrl = env.DATABASE_URL ?? null;

  // §3's central safety rule: dev-token exposure must be structurally impossible in production,
  // not just "off by default." In production, this is always false, full stop — no env var can
  // override it back on. In development/test, it defaults on (matching current sandbox behavior)
  // but can be explicitly disabled via DEV_TOKEN_EXPOSURE=false for a closer-to-prod local test.
  const allowDevTokenExposure = nodeEnv === 'production'
    ? false
    : env.DEV_TOKEN_EXPOSURE !== 'false';

  if (nodeEnv === 'production') {
    const missing: string[] = [];
    if (!databaseUrl) missing.push('DATABASE_URL');
    if (!env.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!env.EMAIL_PROVIDER_API_KEY) missing.push('EMAIL_PROVIDER_API_KEY');
    if (!env.EMAIL_SENDER_ADDRESS) missing.push('EMAIL_SENDER_ADDRESS');
    if (missing.length > 0) {
      throw new EnvironmentValidationError(
        `Missing required production environment variables: ${missing.join(', ')}. ` +
        'Refusing to start — see .env.example for what each one is for.'
      );
    }
  }

  const cookieSecureMode = nodeEnv === 'production';
  const logLevel = (env.LOG_LEVEL as AppConfig['logLevel'] | undefined) ?? (nodeEnv === 'production' ? 'info' : 'debug');
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new EnvironmentValidationError(`Invalid LOG_LEVEL: "${logLevel}"`);
  }

  return {
    nodeEnv, appUrl, port, webPort, databaseUrl, sessionTtlDays,
    allowDevTokenExposure, cookieSecureMode, logLevel,
  };
}

/** Logs the loaded config at startup with every secret-shaped value redacted — never the raw value. */
export function describeConfigForLogging(config: AppConfig): Record<string, unknown> {
  return {
    nodeEnv: config.nodeEnv,
    appUrl: config.appUrl,
    port: config.port,
    webPort: config.webPort,
    databaseUrl: config.databaseUrl ? '[SET]' : '[NOT SET — using local SQLite]',
    sessionTtlDays: config.sessionTtlDays,
    allowDevTokenExposure: config.allowDevTokenExposure,
    cookieSecureMode: config.cookieSecureMode,
    logLevel: config.logLevel,
  };
}
