# STATION — Bartender OS (V1)

The professional operating system for bartenders. This is the approved V1 scope from the Master
Project Blueprint: **Auth, Home, Tools, Vault** — nothing else. Learning, Profile, Checklists,
Journal, Recipe Costing/ABV Engine, Ingredient Library, and Collections were all proposed in later
implementation prompts but never had an approved PRD/schema pass, so they are **not built here** —
see "What's deliberately not here" below.

## Running it

```bash
npm test                 # runs the full test suite (91 tests, node:test, zero dependencies)
npm run server            # starts the API on http://localhost:4000 (persists to db/station.dev.sqlite)
npm run web                # in a second terminal: serves the frontend on http://localhost:8080
```

Open `http://localhost:8080` in a browser. Register an account, log a shift, build a recipe, run a
calculator — everything is wired to the real backend, nothing is mock data.

## Sandbox substitution (read this before assuming it's wrong)

The approved Technical Architecture (Stage 4) specifies PostgreSQL + a Fastify-class framework +
an ORM, all installed via npm. **This sandbox has no network access** — `npm install` returns a 403
from the registry, and there's no Postgres server available. Rather than fake a passing build, this
foundation was built using only Node's built-in modules:

- `node:sqlite` stands in for PostgreSQL. The migration files in `/db/migrations` are plain SQL,
  written to be portable — swapping `src/shared-kernel/db.js` for a real `pg`/Prisma-backed module
  is the entire migration path. No module above that file talks to SQLite directly.
- Raw `node:http` stands in for a framework. `src/http/server.js` is a thin routing layer; all
  business logic lives in `src/modules/*/service.js`, which has zero knowledge of HTTP at all.
- `node:test` is Node's built-in test runner — this one isn't a substitution, it's a legitimate
  long-term choice.
- No ESLint/Prettier/TypeScript — none could be installed. Code follows the Engineering Playbook
  (Stage 9) conventions by hand; running real lint/format/type-check requires an environment with
  npm registry access.

Every test in `/test` actually runs and actually passes in this sandbox — nothing here is a
fabricated result.

## What's actually built and tested (91/91 passing)

- **Auth**: registration, login (with anti-enumeration error messaging), multi-device sessions,
  logout, account deletion with re-authentication and full cascading delete, audit logging.
- **Shifts**: log/list/delete, lifetime/avg/best stats, one-goal-per-user with 7-day rolling
  progress — all ownership-scoped.
- **Recipes**: create/list/search/filter/delete with composed ingredients, transactional creation,
  cascading delete — all ownership-scoped.
- **Tools**: batch scaling, ABV/proof, unit conversion — pure, stateless, exhaustively tested
  (26 tests alone, including zero-servings, 100%-ABV, and round-trip-conversion edge cases).
- **Shared Kernel**: single validation library, single calculation engine, single audit writer —
  no duplicated logic between modules (this was actually caught and fixed once during this build:
  audit-logging started out duplicated inside `auth/service.js` and was refactored into
  `shared-kernel/audit` before this note was written).
- **HTTP layer**: every protected route enforces auth; ownership scoping is verified with real
  cross-user bypass attempts, including one live end-to-end test that registers two users and
  confirms user B gets a 404 (not a 403 — doesn't even confirm the record exists) trying to read
  user A's recipe.
- **Frontend**: Welcome/Login/Register + the Home/Tools/Vault screens, matching Stage 5's design
  tokens and Stage 7's screen specs, talking to the real API — no mock data.

## What's deliberately not here

- **Password reset & email verification**: designed in Stage 4 §6, not implemented. Registration
  currently logs the user in immediately rather than gating on a verification email, since no email
  delivery infrastructure exists in this sandbox. This is a stated simplification, not silent.
- **Onboarding, expanded profile fields (name/country/timezone/photo), Settings beyond nothing**:
  proposed in a later implementation prompt (Stage 12) that contradicted Stage 3's explicit
  "no forced onboarding" decision and Stage 4's approved `users` schema. Flagged, not built,
  pending a real product decision.
- **Checklists, Shift Journal, expanded shift fields (venue/role/tip-outs/ratings)**: proposed in
  Stage 13, never had an approved PRD or schema. Flagged, not built.
- **Ingredient Library, Recipe Costing/ABV/Dilution engines, Collections, Favorites, Recipe
  Versioning**: proposed in Stage 14, explicitly named as V2/out-of-scope in Stage 4 §23. Flagged,
  not built.
- **Calculation registry/saved history/presets/timers/Service Mode**: proposed in Stage 15, same
  situation. Flagged, not built.
- **Linting/formatting/type-checking**: configs would need to be written and packages installed in
  a networked environment — not possible here.
- **Billing/Plus tier**: Stage 10 already identified this as a real gap with no schema anywhere;
  still true here.

## Repository structure

```
/src/modules/{auth,shifts,recipes,presets}   — domain modules, one folder each (Stage 9 §2)
/src/shared-kernel/{validation,calculations,audit,db.js} — single source of truth, used by all modules
/src/http/server.js                           — routing layer only, zero business logic
/db/migrations                                — plain SQL, portable to Postgres
/web                                          — frontend: tokens.css, api-client.js, app.js, index.html
/test                                         — 91 tests, all real, all passing
/bin                                          — server.js (API) and web-server.js (static frontend)
```
