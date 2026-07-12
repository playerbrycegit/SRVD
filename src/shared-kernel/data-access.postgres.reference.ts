/**
 * ============================================================================
 * REFERENCE ONLY — NOT PART OF THE BUILD. NEVER COMPILED. NEVER EXECUTED.
 * ============================================================================
 *
 * This file is explicitly excluded from tsconfig.json's `include`. It exists to show what a
 * PostgreSQL-backed implementation of the `Database` interface (data-access.ts) looks like, for
 * whoever completes this migration in an environment with npm registry access and a real Postgres
 * server — neither of which exists in the sandbox this was written in.
 *
 * To make this real:
 * 1. `npm install pg @types/pg`
 * 2. Remove this file's exclusion from tsconfig.json
 * 3. Delete the hand-written `pg` ambient type stubs below (real @types/pg replaces them)
 * 4. Point `DATABASE_URL` at a real Postgres instance (see .env.example)
 * 5. Run the migrations in db/migrations/*.sql against it — they're written in Postgres-compatible
 *    syntax already, but have never been executed against a real Postgres server, so treat the
 *    first real run as a genuine test, not a formality.
 * 6. Fix the currency column type: SQLite's REAL is a float. The Postgres migrations should use
 *    NUMERIC for cash_tips/card_tips/target_amount — this was flagged as a real, live gap in the
 *    prior production audit (Stage 4 §8 says never store money as floating point; SQLite's REAL
 *    does exactly that today). Do not port the REAL type as-is.
 *
 * Minimal ambient types below stand in for `pg`'s real API shape (Pool, PoolClient, QueryResult)
 * so this file can at least be read with correct-looking types — they are NOT the real `pg`
 * package's types and have not been checked against it.
 */

// ---- Hand-written stand-ins for `pg`'s API shape (NOT the real @types/pg) ----
interface PgQueryResult<T> { rows: T[]; rowCount: number | null }
interface PgPoolClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<PgQueryResult<T>>;
  release(): void;
}
interface PgPool {
  connect(): Promise<PgPoolClient>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<PgQueryResult<T>>;
  end(): Promise<void>;
}
// In a real environment: `import { Pool } from 'pg';`
declare function createPgPool(connectionString: string): PgPool;

import type { Database, RunResult } from './data-access';

/**
 * Postgres implementation of the same `Database` interface every module already depends on.
 * NOTE: this interface's methods are synchronous (matching SQLite's synchronous API), but `pg` is
 * fully async. A real Postgres migration likely needs to change `Database` to an async interface
 * (every method returning a Promise) and update every call site to `await` — this is a real,
 * non-trivial ripple effect this reference file surfaces but does not solve. Flagging it here
 * rather than papering over it with a fake synchronous wrapper around an async client.
 */
export class PostgresDatabase implements Database {
  private readonly pool: PgPool;

  constructor(connectionString: string) {
    this.pool = createPgPool(connectionString);
  }

  // UNVERIFIED — see file header. Also note the interface mismatch documented above: this
  // synchronous method signature cannot actually be satisfied by pg's async client without
  // either a blocking hack (unacceptable) or changing `Database` to an async interface (the
  // real fix, not done here since it's a ripple-effect change out of scope for a reference file).
  run(_sql: string, _params: unknown[] = []): RunResult {
    throw new Error('PostgresDatabase.run: synchronous interface cannot be satisfied by the async pg client — see file header. Database interface needs to become async before this can work.');
  }

  get<T = unknown>(_sql: string, _params: unknown[] = []): T | undefined {
    throw new Error('PostgresDatabase.get: same async/sync mismatch as run() — see file header.');
  }

  all<T = unknown>(_sql: string, _params: unknown[] = []): T[] {
    throw new Error('PostgresDatabase.all: same async/sync mismatch as run() — see file header.');
  }

  exec(_sql: string): void {
    throw new Error('PostgresDatabase.exec: same async/sync mismatch as run() — see file header.');
  }

  transaction<T>(_fn: () => T): T {
    throw new Error('PostgresDatabase.transaction: pg transactions are BEGIN/COMMIT over an async client connection, not a synchronous wrapper — see file header.');
  }
}

/**
 * ============================================================================
 * The honest summary: swapping to Postgres is not just "implement this class." The `Database`
 * interface itself needs to become async first (a change every one of the ~4 module service files
 * would need to absorb, per the prior audit's migration-risk finding), and only then does a real
 * pg-backed implementation of it become possible to write correctly. This file's throw-on-call
 * stubs exist to make that limitation explicit and impossible to miss, not to pretend the
 * migration is closer to done than it is.
 * ============================================================================
 */
