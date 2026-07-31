# SRVD — Deployment Runbook

**Status: never executed.** No production environment exists (confirmed across multiple audits in
this project's history — no network access in the environment this was built in, no hosting
account provisioned). This runbook is written to be correct and ready, not to imply a deployment
has happened. The first real deployment is this document's first real test.

## Prerequisites (must all be true before starting)
- [ ] A real hosting target is provisioned (Section 11 of the prior phase's report recommended a
      managed PaaS — Railway/Render/Fly.io/similar — over self-managed infrastructure)
- [ ] A real managed PostgreSQL instance exists, and `db/postgres-migrations/all_tables.sql` has
      been run against it **at least once in staging** before it's ever run in production
      (§7 of this phase: "do not run an untested production migration" — still true, still unmet)
- [ ] `Database` interface (`src/shared-kernel/data-access.ts`) has been converted to async and a
      real `pg`-backed implementation replaces `data-access.postgres.reference.ts`'s stub — this
      is real, non-trivial work, not a config change (see that file's own header)
- [ ] A real email provider is wired into `src/shared-kernel/email.ts`, replacing
      `ConsoleEmailService` with a working `ProviderEmailService`
- [ ] All required production env vars are set (`DATABASE_URL`, `SESSION_SECRET`,
      `EMAIL_PROVIDER_API_KEY`, `EMAIL_SENDER_ADDRESS` — `env.ts` refuses to start without them,
      verified live in an earlier phase)
- [ ] CI (`.github/workflows/ci.yml`) has run successfully at least once for real

## Deployment Steps

1. **Confirm release tag** — the commit being deployed is tagged (e.g. `v1.0.0-rc.1`), not an
   arbitrary branch HEAD.
2. **Confirm CI is green** for that exact tagged commit.
3. **Confirm database backup** — a fresh backup exists and its restore has been tested (see
   `docs/runbooks/incident-response.md` — a backup that's never been restored is not verified).
4. **Confirm migration readiness** — any new migration has run successfully against a staging
   clone of production data, not just an empty database.
5. **Apply migrations** against production, as a distinct, logged step — never bundled silently
   into the application deploy.
6. **Deploy the application** (the compiled `dist/` output, per `npm run build`).
7. **Run health check** — `GET /health` returns `{"data":{"status":"ok"}}`.
8. **Run authentication smoke test** — register a real throwaway account, verify, log in, log out.
9. **Run shift smoke test** — log a shift, confirm it appears in history and stats update.
10. **Run recipe smoke test** — create a recipe, confirm it's searchable.
11. **Run calculator reference test** — one batch, one ABV, one conversion, compared against the
    reference values already in `test/calculations.test.js` (26 tests, all currently passing
    against local SQLite — re-verify against the deployed environment specifically).
12. **Verify email delivery** — the smoke-test account's verification email actually arrives.
13. **Verify monitoring** is receiving data from the new deployment.
14. **Verify logs** are structured, correlation-ID-tagged, and free of secrets (spot-check).
15. **Confirm rollback window** — know exactly how to execute `docs/runbooks/rollback.md` before
    declaring the deployment complete, not after something goes wrong.
16. **Announce deployment status** to whatever support/communication channel is live at the time.

## What This Runbook Does Not Cover
Load testing, staged rollout percentages, and incident response are separate documents
(`docs/runbooks/incident-response.md` and the load-testing section of the completion report) —
this file is deployment mechanics only, kept focused per the single-responsibility principle
already applied throughout this codebase's actual source files.
