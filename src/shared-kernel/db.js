'use strict';
/**
 * Database connection + migration runner.
 *
 * SUBSTITUTION NOTICE: Stage 4 §2 specifies PostgreSQL with a schema-first ORM. This sandbox has
 * no network access (verified: npm registry returns 403; no Postgres server available), so this
 * foundation uses Node's built-in `node:sqlite` module instead. The migration files in /db/migrations
 * are plain SQL, written to be trivially portable to Postgres (documented per-statement where a
 * Postgres equivalent differs, e.g. INTEGER-epoch-ms timestamps vs Postgres TIMESTAMP).
 *
 * Swapping this file for a real `pg`/Prisma-backed implementation is the entire migration path —
 * no module above this layer (auth, shifts, recipes) talks to SQLite directly; they only call the
 * functions exported from `query()` below, matching the "single data-access chokepoint" rule
 * (Stage 9 §2/§6).
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

/**
 * @param {string} [location] ':memory:' for tests, a file path for local dev persistence.
 */
function createDb(location = path.join(__dirname, '..', '..', 'db', 'station.dev.sqlite')) {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/**
 * Applies every .sql file in db/migrations in filename order. Idempotent (all statements use
 * IF NOT EXISTS) so it's safe to call on every server start, matching Stage 4 §21's migration
 * philosophy even though a real up/down migration tool is a Phase-7-hardening addition, not built here.
 */
function runMigrations(db) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    applied.push(file);
  }
  return applied;
}

module.exports = { createDb, runMigrations };
