# STATION — Bartender OS

Professional operating system for bartenders. V1 scope per the Master Project Blueprint: **Auth,
Home, Tools, Vault.** Nothing else — see `docs/scope-note.md` for what was deliberately excluded
and why.

## Status

Foundation + Phase-1 vertical slice (Auth, Home, Tools, Vault) complete and tested. See
`docs/completion-report.md` for the full, honest account of what works, what was verified how,
and what remains.

## Environment substitution notice

This was built in a sandbox with **no network access** (npm registry returns 403; no Postgres
server available). Per Stage 9's "never fabricate completed work" rule, here's exactly what that
means and what's a drop-in replacement later:

| Stage 4 §2 approved choice | Built here instead | Swap path |
|---|---|---|
| PostgreSQL | `node:sqlite` (Node's built-in, real SQL, real constraints) | Replace `src/shared-kernel/db.js` with a `pg`/Prisma-backed version. Migration SQL in `db/migrations/*.sql` is written to be portable; no module above `db.js` talks to SQLite directly. |
| Fastify-class framework | Node's built-in `http` module | Replace `src/http/server.js`'s routing with the framework; every route handler's actual logic already lives in the module services, not in this file. |
| Zod-class validation | Hand-written validation (`src/shared-kernel/validation`) | Functionally equivalent; swap is optional. |
| ESLint / Prettier / TypeScript | Config files written (`.eslintrc.json`, `.prettierrc.json`) but **not runnable here** | `npm install` these in a networked environment; the config already encodes Stage 9's standards. |

Everything else — module boundaries, schema, business rules, API shape, calculation formulas — is
built exactly to the Stage 4/9 spec, with zero external dependencies, so it runs today.

## Running it locally (in a normal environment with Node 22+)

```bash
npm test              # runs the real test suite (91 tests as of this build)
npm run migrate       # applies db/migrations/*.sql to a local SQLite file
npm run dev:api       # starts the API on :4001
npm run dev:web       # starts the static web app on :4002, in a second terminal
```

Then open `http://localhost:4002`. The web app talks to the API at `http://localhost:4001` by
default (override via `window.STATION_API_BASE` before `api-client.js` loads, or edit `.env`).

## Repository structure

See `docs/repo-tree.md` for the full annotated tree, or run `find . -type f -not -path './.git/*'`.

## What's deliberately not here

Onboarding, expanded user profile fields, checklists, shift journal, the Mixologist Lab's
ingredient library/costing/versioning, and the Tools calculation-registry/presets/timers system
were all proposed in later implementation-phase prompts but not built — they expand V1 scope well
beyond the approved Master Blueprint without their own PRD/schema/design pass. See the
conversation history (Stages 12–15) for the specific, itemized conflicts. If any of that is
wanted, it needs its own short planning pass first, the same way every other pillar in this
project got one.
