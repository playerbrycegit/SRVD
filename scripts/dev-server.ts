import { createDb, runMigrations } from '../src/shared-kernel/data-access';
import { createServer } from '../src/http/server';
import { loadConfig, describeConfigForLogging, EnvironmentValidationError } from '../src/shared-kernel/env';
import { ConsoleEmailService, ProviderEmailService, type EmailService } from '../src/shared-kernel/email';

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

// Real provider in production (requires EMAIL_PROVIDER_API_KEY / EMAIL_SENDER_ADDRESS, already
// enforced present by loadConfig's production validation); console logging everywhere else.
const emailApiKey = process.env.EMAIL_PROVIDER_API_KEY;
const emailSender = process.env.EMAIL_SENDER_ADDRESS;
const emailService: EmailService = config.nodeEnv === 'production' && emailApiKey && emailSender
  ? new ProviderEmailService(emailApiKey, emailSender)
  : new ConsoleEmailService(config.allowDevTokenExposure);

const db = createDb(); // defaults to db/srvd.dev.sqlite (persistent, not :memory:)
const applied = runMigrations(db);
// eslint-disable-next-line no-console
console.log(`[srvd] ${applied.length} migrations applied`);

const server = createServer(db, config, emailService, config.appUrl);
server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[srvd] API listening on http://localhost:${config.port}`);
});
