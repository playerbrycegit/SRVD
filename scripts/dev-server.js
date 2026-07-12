'use strict';
const { createDb, runMigrations } = require('../src/shared-kernel/db');
const { createServer } = require('../src/http/server');

const db = createDb(); // persists to db/station.dev.sqlite by default
const applied = runMigrations(db);
console.log(`Applied ${applied.length} migrations.`);

const PORT = process.env.PORT || 4001;
const server = createServer(db);
server.listen(PORT, () => console.log(`STATION API running at http://localhost:${PORT}`));
