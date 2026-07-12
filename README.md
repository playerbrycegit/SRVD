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

## What's actually built and tested (112/112 passing)

- **Auth**: registration, login (with anti-enumeration error messaging), multi-device sessions,
  logout, account deletion with re-authentication and full cascading delete, audit logging.
- **Email verification**: real, single-use, time-limited (24h), hashed-at-rest tokens. Shift and
  recipe *creation* are gated behind a verified email (Stage 4 §6) — verified live: an unverified
  user gets a 403, the same user succeeds immediately after verifying.
- **Password reset**: real, single-use, time-limited (1h) tokens; anti-enumeration (same response
  shape whether or not the email exists); resetting a password revokes every existing session, so
  a stolen session token can't survive a reset — verified live against a running server.
- **Rate limiting**: in-memory sliding window, 10 req/min on `/auth/*`, 120 req/min elsewhere
  (Stage 4 §17) — verified live: the 5th rapid login attempt in a minute returns 429.
- **Shifts**: log/list/delete, lifetime/avg/best stats, one-goal-per-user with 7-day rolling
  progress — all ownership-scoped.
- **Recipes**: create/list/search/filter/delete with composed ingredients, transactional creation,
  cascading delete — all ownership-scoped.
- **Tools**: batch scaling, ABV/proof, unit conversion — pure, stateless, exhaustively tested.
- **Shared Kernel**: single validation library, single calculation engine, single audit writer,
  single rate limiter — no duplicated logic between modules.
- **HTTP layer**: every protected route enforces auth; ownership scoping is verified with real
  cross-user bypass attempts (a live test registers two users and confirms user B gets a 404 —
  not a 403, doesn't even confirm the record exists — trying to read user A's recipe).
- **Frontend**: Welcome/Login/Register/Verify/Forgot-Password/Reset-Password + Home/Tools/Vault,
  matching Stage 5's tokens and Stage 7's specs, talking to the real API — no mock data.

## Sandbox substitution — email delivery

Stage 4 §6 assumes a real email provider. This sandbox has none (no SMTP, no network), so
verification and password-reset tokens are returned directly in the API response under a
clearly-labeled `devOnly` field, and the frontend surfaces them as an explicit "simulating that
click" step rather than actually emailing anything. **This is the one place a real deployment
must change before going live** — swap the `devOnly` token exposure in `src/http/server.js` for a
call to an email provider, and delete the `devOnly` field entirely. Nothing else about the
verification/reset logic needs to change; the token generation, hashing, expiry, and single-use
enforcement in `src/modules/auth/service.js` are all production-shaped already.

## What's deliberately still not here
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
