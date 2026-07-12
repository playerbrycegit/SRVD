'use strict';
/** Starts the STATION API server against a persistent local SQLite file (dev substitute for Postgres). */
const { createDb, runMigrations } = require('../src/shared-kernel/db');
const { createServer } = require('../src/http/server');

const PORT = process.env.PORT || 4000;
const db = createDb(); // defaults to db/station.dev.sqlite (persistent, not :memory:)
const applied = runMigrations(db);
console.log(`[station] ${applied.length} migrations applied`);

const server = createServer(db);
server.listen(PORT, () => console.log(`[station] API listening on http://localhost:${PORT}`));
