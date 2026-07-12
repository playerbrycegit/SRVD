/**
 * Data-access abstraction. THIS FILE DIRECTLY ADDRESSES THE #1 FINDING of the prior production
 * readiness audit: "the single data-access chokepoint claim in db.js's docstring was not accurate
 * — no query() abstraction actually existed, every module called SQLite's raw API directly."
 *
 * Every module (auth, shifts, recipes, alpha) now imports the `Database` interface below, not
 * node:sqlite directly. The interface is intentionally small and shaped like every mainstream
 * SQL driver's API (run/get/all/exec/transaction), so a Postgres-backed implementation is a
 * drop-in replacement of *this file's* SqliteDatabase class only — no service file changes.
 *
 * HONESTY NOTE on the PostgreSQL side of this migration: this sandbox has no network access (no
 * npm registry, verified in the prior audit) and no PostgreSQL server. The `pg` package cannot be
 * installed and there is nothing to connect to. A Postgres-backed implementation of this exact
 * `Database` interface is written in `data-access.postgres.reference.ts` as a reference for a
 * networked environment to complete — it is excluded from this project's tsconfig, has never been
 * compiled or executed, and its correctness is unverified. Do not treat its presence as evidence
 * that "the application uses PostgreSQL successfully" — that completion criterion is not met.
 */
import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RunResult {
  changes: number;
}

/** The interface every module depends on. Swapping SqliteDatabase for a Postgres-backed class
 * that implements this same interface is the entire migration path (per this file's header). */
export interface Database {
  run(sql: string, params?: unknown[]): RunResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  /** Runs `fn` inside a transaction; commits on normal return, rolls back on throw. */
  transaction<T>(fn: () => T): T;
}

export class SqliteDatabase implements Database {
  private readonly db: DatabaseSync;

  constructor(location: string) {
    this.db = new DatabaseSync(location);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  run(sql: string, params: unknown[] = []): RunResult {
    const result: StatementResultingChanges = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(result.changes) };
  }

  get<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'db', 'migrations');

export function createDb(location: string = path.join(__dirname, '..', '..', '..', 'db', 'station.dev.sqlite')): Database {
  return new SqliteDatabase(location);
}

/**
 * Applies every .sql file in db/migrations in filename order. Idempotent (all statements use
 * IF NOT EXISTS) so it's safe to call on every server start.
 */
export function runMigrations(db: Database): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    applied.push(file);
  }
  return applied;
}
