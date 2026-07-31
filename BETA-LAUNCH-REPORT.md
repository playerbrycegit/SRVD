# SRVD — Beta Launch Report

**Product:** SRVD — the operating system for bartenders
**Version:** 1.0.0-beta.1
**Report date:** July 31, 2026
**Scope of this verdict:** Closed beta (small invited cohort). Not a public/open launch.
**Final verdict:** **APPROVED WITH MINOR CONDITIONS** (conditions listed in §17 — all bounded, most already de-risked)

A note on how to read this report: every "verified" claim below was produced by actually running the code in this environment (build, typecheck, lint, the full test suite, and a real production boot with HTTP smoke tests) on this date — not inferred from commit messages. Where something was **not** executed (live email delivery, formal accessibility and responsive audits, real-browser web-vitals), this report says so plainly rather than inventing a result. That honesty is the point: a launch decision is only as good as the evidence under it.

---

## 1. Executive summary

The SRVD codebase is in genuinely strong shape and is verified beta-ready at the code level: it builds clean, passes strict TypeScript typechecking with zero errors, passes lint with zero problems, and passes all 172 automated tests. In this session the app was rebranded end-to-end from its prior name (STATION) to **SRVD**, a single-origin production entrypoint was built and verified (API and web client served from one port with the database on a persistent volume), a Railway deployment configuration with a health check was added, and the lint toolchain was made real and turned into a CI gate.

What stands between this and real bartenders is **not code** — it is a short, bounded list of infrastructure and verification steps that require the founder's own accounts and credentials, and that have not yet been executed in a live environment. The most important of these is a single live email round-trip: the transactional email service is code-complete but has never sent a real message, and account verification and password reset both depend on it. Real users should not be invited until that one test passes.

Recommended path: complete the conditions in §17 (most are a few minutes each), then invite a small closed cohort.

---

## 2. Architecture status — VERIFIED

- **Runtime:** Node.js ≥ 22.5 (tested on 22.22). TypeScript, strict mode, compiled via `tsc` to `dist/`.
- **External runtime dependencies:** **zero.** The app uses only Node built-ins (`node:sqlite`, `node:http`, `node:test`). Dev dependencies are limited to `typescript`, `@types/node`, `eslint`, `typescript-eslint`. This is a real, verified fact (`dependencies: {}` in `package.json`), and it materially reduces supply-chain risk and deploy complexity.
- **Serving model (new this session, verified):** A single production entrypoint (`scripts/prod-server.ts`) composes the existing JSON API and static web client behind **one** listener on `$PORT`. Same-origin means no CORS configuration and no hardcoded API URL — the frontend calls the API with relative paths. This was confirmed by booting the server and successfully hitting `/health`, `/`, static assets, the compiled shared-kernel, `POST /auth/register`, and the SPA fallback, all on the same port.
- **Frontend:** Vanilla HTML/CSS/JS with a hash-based router. No framework, no bundler. Total payload ≈ 56 KB.
- **Shared calculation kernel:** The same compiled calculation code (batch scaling, ABV/proof, unit conversion) is served to the browser so client-side tools reuse the exact server formulas — verified served at `/shared-kernel/...`.

---

## 3. Security status — VERIFIED BY CODE INSPECTION + TESTS

Measures confirmed present in the code and, where noted, exercised by the test suite:

- **Password security:** scrypt hashing (Node `crypto`), no plaintext storage.
- **Authentication / sessions:** bearer-token sessions; a single authorization chokepoint gates every non-auth route (verified in `server.ts`); password reset **revokes existing sessions**.
- **Email verification gate:** unverified accounts are blocked from gated actions (tested).
- **Rate limiting:** applied to auth-sensitive routes, with a dedicated stricter tier for data export (tested).
- **Ownership checks:** shifts/recipes/settings are scoped to the authenticated user (tested).
- **Input validation:** centralized validation layer, portable and framework-independent (tested).
- **Production fail-fast:** the server refuses to start in production without `DATABASE_URL`, `SESSION_SECRET`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_SENDER_ADDRESS` (verified — it exits with a clear message).
- **Dev-token exposure structurally disabled in production:** no environment variable can turn it back on in prod (by construction in `env.ts`).
- **Secure cookies in production:** `cookieSecureMode` is forced on when `NODE_ENV=production` (verified in boot config output).
- **Analytics redaction:** events run through an allowlist-based redaction layer so sensitive fields are never captured (tested).
- **Static path-traversal protection:** the static server rejects paths escaping the web root (tested).
- **No committed secrets:** full scan of `src/`, `web/`, `scripts/`, and configs found no hardcoded credentials. The only match was a demo password inside a local-only seed script.

**Not a code finding, but a live gap:** CSRF is not separately implemented; the app uses bearer tokens in the `Authorization` header (not cookie-based session auth for API calls), which sidesteps classic CSRF for the API. This is acceptable for the beta but should be re-reviewed if any cookie-based state-changing endpoints are added later.

---

## 4. Database status — VERIFIED (SQLite path)

- **11 SQLite migrations**, applied cleanly and idempotently on boot (verified: "11 migrations applied" on a fresh volume file).
- Schema covers users, sessions, shifts, goals, recipes, recipe ingredients, calculator presets, audit log, verification tokens, alpha invitations, feedback submissions.
- **Persistence strategy for beta:** SQLite file lives on a mounted volume, its path supplied via `DATABASE_URL` (a `file:` prefix is tolerated). Verified the DB file is created and written at the configured path.
- **PostgreSQL migrations exist** and are paired one-to-one with the SQLite set, but have **never been executed** against a real Postgres server. Postgres is the documented post-beta scaling path (it requires converting the data-access layer to async first — see `src/shared-kernel/data-access.postgres.reference.ts`). This is deliberately deferred; it is not required for the closed beta.

---

## 5. Performance benchmarks — PARTIAL (honest)

Real, measured this session:

- **Frontend payload ≈ 56 KB total** (index.html 771 B, app.js ≈ 32 KB, api-client.js ≈ 3.3 KB, tokens.css ≈ 3.6 KB), plus ≈ 31 KB compiled shared kernel. No framework, no bundler, so there is effectively no JS build weight beyond the app's own code.
- **Local API latency:** `/health` responded in ≈ 1 ms locally across repeated calls (server overhead only; not representative of production network latency).
- **Zero runtime dependencies** → minimal cold-start and install footprint.

**Not yet measured (requires the deployed URL, honestly outstanding):** real-browser Largest Contentful Paint, Time to Interactive, and a Lighthouse pass. These cannot be produced credibly from a sandbox and were not faked. Given the tiny payload and lack of a framework, expectations are good, but this should be run against the live URL post-deploy.

---

## 6. Accessibility summary — NOT AUDITED THIS PASS (honest)

A formal WCAG audit (screen-reader pass, contrast measurement, full keyboard traversal, ARIA review) was **not** performed. From code inspection, forms use explicit `<label for=...>` associations and the markup is semantic HTML, which is a good starting point. A closed beta can proceed without a completed formal audit, but this is listed as a recommended (non-blocking for closed beta) follow-up and a **required** item before any public launch.

---

## 7. Responsive QA results — NOT PERFORMED THIS PASS (honest)

Device-matrix responsive testing (small/standard/large phones, tablet, desktop) was **not** performed — it requires real browsers/devices unavailable here. This is an outstanding verification item. For a small closed cohort it is a recommended manual check at deploy time rather than a hard code gate; it is required before public launch.

---

## 8. Production deployment checklist

| Step | State |
|---|---|
| Production build succeeds | ✅ verified |
| Single-origin server (API + web on `$PORT`) | ✅ verified locally |
| `/health` endpoint returns 200 | ✅ verified |
| Railway config with health check present | ✅ added (`railway.json`) |
| Fail-fast on missing prod env vars | ✅ verified |
| SQLite on persistent volume | ✅ verified locally; volume must be provisioned on Railway (founder step) |
| Real `DATABASE_URL` / `SESSION_SECRET` set | ⏳ founder step |
| Real Resend API key + verified sender | ⏳ founder step |
| Live email round-trip confirmed | ⏳ **founder step — hard gate** |
| Actual deploy from clean environment | ⏳ founder step (verified reproducible locally) |
| Error monitoring wired | ⚠️ Railway logs only; structured monitoring recommended |

---

## 9. Test summary — VERIFIED

- **172 / 172 tests passing.** Typecheck: 0 errors. Lint: 0 problems.
- Suites: auth, shifts, recipes, calculations, settings, alpha operations, analytics, audit, rate-limit, validation, static-server, and a full end-to-end suite (including V1.1 edit-shift / edit-recipe flows).
- A pre-commit hook runs the full suite, so commits cannot land with failing tests (observed live).
- The rebrand was proven non-breaking: after renaming, 3 static-server tests failed because they asserted the old brand string; the assertions were updated to the new brand (intent preserved, nothing weakened) and the suite returned to 172/172.

---

## 10. Known limitations

1. **Transactional email has never actually sent.** The Resend-backed service is code-complete (native `fetch`, no SDK) and wired into registration, password reset, and password-changed flows, but is unverified against the live Resend API. **This is the top risk** — see §12.
2. **`node:sqlite` is an experimental Node feature** and emits a runtime warning. It is functional and tested, but "experimental" means the API could change in a future Node release. Pinning the Node version (≥ 22.5) mitigates this.
3. **Recipe edit UI shows/edits only the first ingredient row** — a documented V1.1 frontend limitation (the backend correctly replaces all ingredients transactionally). Cosmetic/UX, not data-integrity.
4. **No structured error-monitoring service** (e.g. Sentry) is wired. Railway's log stream is the current fallback — minimally adequate for a small cohort, not ideal.
5. **Formal accessibility and responsive audits not yet run** (§6, §7).
6. **Real-browser web-vitals not yet measured** (§5).
7. **PostgreSQL path unexecuted** — intentional; beta runs on SQLite (§4).
8. Any additional items in `docs/known-issues.md` carry forward.

---

## 11. Recommended beta cohort size

**15–40 invited users.** Rationale: the beta runs on single-instance SQLite (one writer), which is more than sufficient for a small closed cohort but is not horizontally scalable. This range gives real usage signal while staying well inside the architecture's comfort zone. Scale beyond this only after the PostgreSQL migration.

---

## 12. Launch risks

1. **Email delivery fails or misconfigures at launch (highest).** Verification and password-reset emails are load-bearing; if they don't send, every new user is locked out and the beta stalls on day one.
2. **Volume not persisted / misconfigured** → data loss on redeploy.
3. **Missing/incorrect production env var** → server refuses to start (fail-fast is protective, but it will block a deploy until fixed).
4. **Unmonitored runtime errors** slip by because only log-stream monitoring exists.
5. **Unaudited responsive/a11y issues** surface for some users on some devices.

---

## 13. Risk mitigations

1. **Email:** perform one live end-to-end registration against a real Resend key + verified sender **before** inviting anyone. This is a hard gate (§17). Keep the cohort small so any residual email issue is contained.
2. **Volume:** provision the Railway volume, set `DATABASE_URL` to a path on it, and confirm persistence by registering a user, redeploying, and confirming the user still exists.
3. **Env vars:** use `.env.example` as the checklist; the fail-fast behavior will catch omissions immediately at boot.
4. **Monitoring:** at minimum watch Railway logs during launch day; wiring a structured error monitor is a recommended fast-follow.
5. **Responsive/a11y:** do a manual pass across a phone, tablet, and desktop at deploy time; schedule the formal audits before public launch.

---

## 14. Rollback procedure

Documented in `docs/runbooks/rollback-and-incident-response.md` (carried forward, written for exactly this deployment shape). Summary: Railway keeps prior deployments — roll back to the last-good deployment from the Railway dashboard; the volume (and its SQLite data) persists across the rollback. Because migrations are additive and idempotent, a rollback of application code does not require a schema rollback for the beta scope.

---

## 15. Version number

**1.0.0-beta.1** (bumped this session from `0.2.0-alpha`, reflecting the transition from internal alpha to closed beta).

---

## 16. Git commit / tag

- Latest commit on `master`: the beta-prep commit containing the SRVD rebrand, production entrypoint, Railway config, and executable lint gate (plus this report and the version bump).
- **Recommended tag:** `v1.0.0-beta.1`, applied at the commit you deploy from.
- The repository has **not been pushed** yet — this is intentional. The authenticated `git push` and tag are yours to run so your GitHub token never passes through anything but your own machine.

---

## 17. Deployment readiness assessment & final verdict

### Verdict: APPROVED WITH MINOR CONDITIONS (closed beta)

The codebase is verified beta-ready. SRVD is cleared to proceed to deployment now, and cleared to **invite real users only after** each condition below is verified. The conditions are bounded and mostly de-risked; one is a hard gate.

**Conditions to clear before inviting users:**

1. **[HARD GATE] Live email round-trip.** With a real Resend API key and verified sender set, register a test account against the deployed app and confirm the verification email actually arrives and its link works. Do not invite anyone until this passes.
2. **Deploy from clean environment and confirm `/health` is green** on the live URL (reproducible locally; needs your Railway account + the final push).
3. **Provision the persistent volume and confirm persistence** across a redeploy (register → redeploy → user still present).
4. **Set all production env vars** per `.env.example` (`DATABASE_URL`, `SESSION_SECRET`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_SENDER_ADDRESS`, `APP_URL`, `NODE_ENV=production`).

**Recommended fast-follows (not blocking a small closed cohort):**

- Wire a structured error monitor (Sentry or equivalent).
- Manual responsive pass (phone/tablet/desktop) and an accessibility spot-check.
- Run Lighthouse against the live URL and record real web-vitals.

**Required before any public / open launch (beyond closed beta):**

- Complete formal WCAG audit and full device-matrix responsive QA.
- Execute the PostgreSQL migration for horizontal scalability.

---

*Evidence basis: build, typecheck, lint, and the full 172-test suite were executed on the report date; the production server was booted with production-like configuration and smoke-tested over HTTP. Items marked "not performed" or "not measured" were deliberately not fabricated.*
