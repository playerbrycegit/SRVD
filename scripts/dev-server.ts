import { createDb, runMigrations } from '../src/shared-kernel/data-access';
import { createServer } from '../src/http/server';
import { loadConfig, describeConfigForLogging, EnvironmentValidationError } from '../src/shared-kernel/env';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof EnvironmentValidationError) {
    // eslint-disable-next-line no-console
    console.error(`[station] Refusing to start: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

// eslint-disable-next-line no-console
console.log('[station] Config loaded:', describeConfigForLogging(config));

const db = createDb(); // defaults to db/station.dev.sqlite (persistent, not :memory:)
const applied = runMigrations(db);
// eslint-disable-next-line no-console
console.log(`[station] ${applied.length} migrations applied`);

const server = createServer(db, config);
server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[station] API listening on http://localhost:${config.port}`);
});
