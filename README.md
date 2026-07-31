# SRVD — Bartender OS (V1 + V1.1)

The professional operating system for bartenders. Auth, Home (shifts/tips/goals), Tools
(batch/ABV/unit conversion), Vault (recipes) — including V1.1's Edit Shift and Edit Recipe.
TypeScript, strict mode, zero runtime npm dependencies.

**Read this before deploying:** this repository has never been deployed, and no automated test in
it exercises PostgreSQL or a real email provider over a live network — see "Known Limitations" at
the bottom. Everything else described below is real, tested, and verified live in the sandbox this
was built in.

---

## 1. Repository Structure

```
/src
  /modules/{auth,shifts,recipes,alpha,settings}/service.ts  - one domain module per folder
  /shared-kernel/
    types.ts            - central domain types (Users, Shifts, Recipes, API envelopes, etc.)
    validation/          - single source of truth for all input validation
    calculations/        - batch/ABV/unit-conversion engine (pure functions)
    audit/                - audit log writer
    analytics.ts          - privacy-safe event tracking (allowlist + pattern redaction)
    email.ts               - EmailService interface, ConsoleEmailService (dev), ProviderEmailService (Resend)
    env.ts                  - startup environment validation, fails fast in production
    data-access.ts           - the Database interface every module depends on
    data-access.postgres.reference.ts - reference-only, excluded from the build (see file header)
  /http/
    server.ts             - all routes, ownership/auth/rate-limit enforcement
    static-server.ts       - serves /web
    rate-limit.ts            - in-memory sliding window (single-instance only, see Known Limitations)
/db
  /migrations              - SQLite (currently used at runtime), 11 files
  /postgres-migrations     - PostgreSQL translation, 11 files matching the SQLite set 1:1, never executed
/web                      - frontend: index.html, css/tokens.css, js/{app.js,api-client.js}
/test                     - 172 tests, all real, all passing
/scripts
  dev-server.ts            - API entry point
  seed.ts                  - optional local-dev demo data (see below)
/docs
  /runbooks                - deployment, rollback/incident-response (written, never executed)
.github/workflows/ci.yml  - CI pipeline, written correctly, never run (no git remote)
.env.example
tsconfig.json
package.json
```

---

## 2. Exact Commands - Local Setup

```bash
git clone <this-repo-url>
cd srvd
cp .env.example .env          # defaults are fine for local dev, no values required
npm install                    # installs typescript + @types/node (see Known Limitations)
npm run build                  # compiles src/ + scripts/ to dist/
npm run migrate                # applies all 11 SQLite migrations, idempotent
npm run seed                   # OPTIONAL: creates demo@srvd.local / demopassword123 with sample data
```

Then, in two separate terminals:
```bash
npm run server    # API on http://localhost:4001
npm run web        # frontend on http://localhost:4002
```

Open `http://localhost:4002` in a browser. Register a real account (or log in with the seed
account above), log a shift, build a recipe, run a calculator.

## 3. Exact Commands - Testing

```bash
npm test                 # builds, then runs all 172 tests (node:test, zero dependencies)
npm run typecheck        # tsc --noEmit, strict mode, zero errors expected
```

A git pre-commit hook already runs `npm test` automatically before allowing a commit - this is
real and already active in this repo's `.git/hooks/pre-commit`.

## 4. Exact Commands - Build

```bash
npm run build             # tsc -p . - compiles to dist/, exit code 0 expected
```

Verified immediately before this handoff:
```
$ npm run build && npm test
# tests 172
# pass 172
# fail 0
```

## 5. Exact Deployment Steps

**No deployment has occurred.** The instructions below are correct, actionable steps for the two
platforms requested - written so a person with a Railway or Render account can actually deploy
this today. Neither has been executed against a real account.

### Railway

1. Create a new Railway project, link this GitHub repository.
2. Add a PostgreSQL plugin from Railway's marketplace - this provisions `DATABASE_URL` automatically.
3. Set the remaining required environment variables (Section 6 below) in Railway's project settings.
4. Set the build command: `npm install && npm run build`
5. Set the start command: `node dist/scripts/dev-server.js`
6. **Before the first deploy with real user traffic**, run the PostgreSQL migration (Section 7)
   against the provisioned database - Railway's `railway run` CLI can execute this remotely, or
   connect directly with `psql "$DATABASE_URL"` and run the migration files in order.
7. Deploy. Verify `GET /health` returns `{"data":{"status":"ok"}}` on the assigned Railway domain.
8. Deploy the frontend (`/web`) either as a second Railway service running
   `node dist/src/http/static-server.js`, or via any static host - it's plain HTML/CSS/JS with one
   config line (`window.SRVD_API_BASE`) that needs to point at the API service's URL.

### Render

1. Create a new Web Service, link this GitHub repository.
2. Create a Render PostgreSQL instance (or use an external one) - copy its connection string into `DATABASE_URL`.
3. Build command: `npm install && npm run build`
4. Start command: `node dist/scripts/dev-server.js`
5. Set required environment variables (Section 6) in Render's dashboard.
6. Run the PostgreSQL migration (Section 7) against the Render database before first real traffic -
   Render's shell access (`render shell`) or a direct `psql` connection both work.
7. Deploy, verify `/health`.
8. Deploy `/web` as a Render Static Site (build command: none needed, publish directory: `web/`)
   or as a second service running `static-server.js`; point `window.SRVD_API_BASE` at the API
   service's Render URL.

**Neither of these has been run.** Follow them, and the first real run is the actual verification -
this README will not claim otherwise.

## 6. Required Environment Variables

| Variable | Required in production? | Purpose |
|---|---|---|
| `NODE_ENV` | Recommended (`production`) | Gates dev-only behavior; `env.ts` refuses to start in production without the four vars below |
| `PORT` | No (defaults 4001) | API port |
| `WEB_PORT` | No (defaults 4002) | Frontend static-server port |
| `APP_URL` | Recommended | Used to build verification/reset links in emails - set to your real public frontend URL |
| `DATABASE_URL` | Yes, in production | PostgreSQL connection string. Local dev uses SQLite instead and doesn't need this. |
| `SESSION_SECRET` | Yes, in production | Reserved for future signed-cookie use; currently sessions are opaque random tokens stored hashed in the database, not JWTs, so this isn't cryptographically load-bearing yet - still required by `env.ts`'s startup check as a forward-compatible guard. |
| `EMAIL_PROVIDER_API_KEY` | Yes, in production | Resend API key (or your chosen provider's, if you swap `ProviderEmailService`'s implementation) |
| `EMAIL_SENDER_ADDRESS` | Yes, in production | The "from" address for verification/reset/security emails |
| `SESSION_TTL_DAYS` | No (defaults 30) | Session lifetime |
| `LOG_LEVEL` | No (defaults `info` in prod, `debug` elsewhere) | |
| `DEV_TOKEN_EXPOSURE` | No | Only takes effect outside production - see `env.ts`; structurally forced to `false` in production regardless of this value, verified live including an explicit override attempt that was correctly ignored |

`env.ts` validates all of this at startup and refuses to start in production if `DATABASE_URL`,
`SESSION_SECRET`, `EMAIL_PROVIDER_API_KEY`, or `EMAIL_SENDER_ADDRESS` are missing - verified live,
not just written.

## 7. Database Migration Instructions

**Local (SQLite, currently what actually runs):**
```bash
npm run migrate    # applies db/migrations/*.sql in order, idempotent (safe to re-run)
```

**Production (PostgreSQL, written but never executed):**
```bash
psql "$DATABASE_URL" -f db/postgres-migrations/001_create_users.sql
psql "$DATABASE_URL" -f db/postgres-migrations/002_create_sessions.sql
psql "$DATABASE_URL" -f db/postgres-migrations/003_create_shifts.sql
psql "$DATABASE_URL" -f db/postgres-migrations/004_create_goals.sql
psql "$DATABASE_URL" -f db/postgres-migrations/005_create_recipes.sql
psql "$DATABASE_URL" -f db/postgres-migrations/006_create_recipe_ingredients.sql
psql "$DATABASE_URL" -f db/postgres-migrations/007_create_calculator_presets.sql
psql "$DATABASE_URL" -f db/postgres-migrations/008_create_audit_log.sql
psql "$DATABASE_URL" -f db/postgres-migrations/009_create_verification_tokens.sql
psql "$DATABASE_URL" -f db/postgres-migrations/010_create_alpha_invitations.sql
psql "$DATABASE_URL" -f db/postgres-migrations/011_create_feedback_submissions.sql
```
Every file uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` - safe to re-run.
**Before running these against real data for the first time, run them against a disposable/staging
Postgres instance first** - they are correctly written but have never been executed anywhere, per
this README's opening note. **Important:** the application's data-access layer
(`src/shared-kernel/data-access.ts`) is currently synchronous and SQLite-backed. Applying these
migrations gives you the right schema, but the app won't actually run against Postgres until
`data-access.ts` is converted to an async interface backed by a real `pg` client - see
`data-access.postgres.reference.ts` for exactly what that involves. **Schema-ready is not the same
as application-ready** for the Postgres path specifically.

## 8. Rollback Instructions

Full runbook: `docs/runbooks/rollback-and-incident-response.md`. Summary:
- **Application rollback:** redeploy the previous tagged release.
- **Database rollback:** only if migration-related; every migration should have a tested
  down-migration available *before* it's ever applied to production (none exist yet for the
  Postgres set specifically, since it's never been applied even once - write and test down-scripts
  as part of the first real Postgres deployment, not after).
- **Never roll back a destructive migration without a tested recovery path.**

## 9. Known Limitations

Stated plainly, not buried:

1. **PostgreSQL has never been executed.** The schema is correct and complete (11 migrations,
   1:1 with the SQLite set, with a currency-precision fix - `NUMERIC` instead of SQLite's `REAL`
   - already applied). The application's data layer is currently synchronous and SQLite-backed;
   connecting it to real Postgres requires converting `Database` to an async interface first (see
   `data-access.postgres.reference.ts`). This is real, scoped, non-trivial work - not a config change.
2. **Email sending is code-complete but network-unverified.** `ProviderEmailService` correctly
   implements Resend's REST API using native `fetch` (no SDK needed) and is wired into
   registration, password-reset, and password-changed-notification flows - but has never actually
   sent an email, because this environment has no network access. The first real send with a real
   `EMAIL_PROVIDER_API_KEY` is its first real test.
3. **No CI has ever executed.** `.github/workflows/ci.yml` is correctly written against this
   project's actual commands but has never run - no git remote exists in this environment.
4. **No accessibility or responsive testing was performed against a real browser** - no browser
   binary was available in the environment this was built in (checked directly, not assumed).
   Design-system-level provisions exist (focus rings, ARIA live regions, touch target sizing) but
   are unverified against real assistive technology or real devices.
5. **Rate limiting is single-instance, in-memory.** Fine for one server process; needs a shared
   store (Postgres or a cache) before horizontal scaling.
6. **`SESSION_SECRET` is currently a required-but-not-yet-cryptographically-used environment
   variable** - sessions are opaque hashed random tokens today, not signed JWTs. It's required by
   `env.ts` as a forward-compatible guard, honestly flagged here rather than silently ignored.
7. **The frontend's recipe editor only shows/edits the first ingredient row** of a multi-ingredient
   recipe (documented in `web/js/app.js` at the exact line it matters) - the backend fully supports
   arbitrary add/remove/reorder, verified by a dedicated test; the minimal frontend hasn't caught up.

## 10. Confirmation: No Secrets or Credentials Are Committed

Verified directly, not assumed:
- `git log --all -p` searched for API-key/password/secret patterns - only test-fixture passwords
  (`password123`, `wrongpassword`, etc., used in automated tests) were found, no real credentials.
- `git log --all --full-history -- .env` returns nothing - `.env` has never been committed.
- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, all `db/*.sqlite*` files,
  `node_modules/`, `dist/`, and OS/editor artifacts.
- `.env.example` contains only variable *names*, every value left blank.

---

## What's Actually Built and Tested (172/172 passing)

Auth (registration, email verification with real send-attempt wiring, login, logout, password
reset with session revocation and a security-notification email, multi-device sessions, rate
limiting), Shifts (log/list/edit/delete, stats, weekly goals), Recipes (create/edit/search/delete,
transactional ingredient replace on edit), Tools (batch scaling, ABV/proof, unit conversion - all
exhaustively tested including edge cases), Settings (preferences, session management, data export,
account deletion), Alpha operations infrastructure (invitations, feedback with automatic
token-redaction), and a privacy-safe analytics abstraction with an allowlist plus a second,
independently-tested pattern-matching redaction layer.

Every ownership boundary in this system has a dedicated cross-user negative test - a user reading,
editing, or deleting another user's data returns 404, never confirming the record's existence.
