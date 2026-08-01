# SRVD — Deployment Package

**Version:** 1.0.0-beta.1
**Branch:** master
**Latest commit:** see `git log --oneline -1`
**Final status:** READY FOR GITHUB → READY FOR RAILWAY DEPLOYMENT → READY FOR CLOSED BETA (sequential gates — see §13)

This is the single document you need to take SRVD from the zip file to a live production app with real users. Every command is copy-pasteable. Every "verify" step has an expected result.

---

## 1. Repository status

| Item | Status |
|---|---|
| Build | ✅ clean |
| TypeScript typecheck | ✅ 0 errors |
| ESLint | ✅ 0 problems |
| Tests | ✅ 172/172 passing |
| Version | 1.0.0-beta.1 |
| Runtime dependencies | 0 (Node built-ins only) |
| Dev dependencies | 4 (typescript, @types/node, eslint, typescript-eslint) |
| Stale artifacts | removed (.eslintrc.json, .prettierrc.json, scenario-check.sh, completion-report.md) |
| Pre-commit hook | ✅ builds before testing; works from clean checkout |
| Secrets in repo | ✅ none (verified by grep scan) |

---

## 2. Push to GitHub

```bash
# From the unzipped station/ directory
cd station

# Point at your repo (replace with your actual remote if different)
git remote set-url origin https://github.com/playerbrycegit/SRVD.git
# — or if no remote exists —
git remote add origin https://github.com/playerbrycegit/SRVD.git

# Push (you'll authenticate with your GitHub PAT)
git push -u origin master

# Tag the beta release
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

**Verify:** `https://github.com/playerbrycegit/SRVD` shows the full source tree, not just a README.

---

## 3. Deploy to Railway

### 3a. Create the service

1. Go to [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** → select `SRVD`.
2. Railway detects `railway.json` automatically. The build command is `npm run build`, the start command is `npm start` (`npm run build && node dist/scripts/prod-server.js`).

### 3b. Attach a persistent volume

1. In the service settings → **Volumes** → **Add Volume**.
2. Mount path: `/data`
3. This is where the SQLite database lives. Without it, data is lost on every redeploy.

### 3c. Set environment variables

In the service **Variables** tab, set every variable below. Copy-paste the values column and fill in your actual secrets.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `file:/data/srvd.sqlite` |
| `SESSION_SECRET` | *(generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)* |
| `EMAIL_PROVIDER_API_KEY` | *(your Resend API key)* |
| `EMAIL_SENDER_ADDRESS` | *(your verified sender, e.g. `noreply@yourdomain.com`)* |
| `APP_URL` | *(your Railway public URL, e.g. `https://srvd-production.up.railway.app`)* |

`PORT` is set automatically by Railway — do not set it manually.

### 3d. Deploy

Railway auto-deploys on push. If you need to trigger manually: **Deployments** → **Deploy**.

### 3e. Verify deployment

```
# Health check (replace with your actual Railway URL)
curl https://YOUR-APP.up.railway.app/health
# Expected: {"data":{"status":"ok"}}

# Frontend loads
curl -s https://YOUR-APP.up.railway.app/ | grep -o '<title>[^<]*</title>'
# Expected: <title>SRVD — Bartender OS</title>
```

### 3f. Verify persistence

1. Register a test account via the live URL.
2. In Railway: **Deployments** → **Redeploy**.
3. After the redeploy completes, log in with the same account.
4. If login succeeds, the volume is working. If it fails, the volume mount is misconfigured.

---

## 4. Email setup (Resend)

### 4a. Account setup

1. Create a [Resend](https://resend.com) account if you don't have one.
2. **Domains** → add your sending domain → configure SPF, DKIM, and DMARC DNS records as Resend instructs.
3. Copy your API key → set it as `EMAIL_PROVIDER_API_KEY` in Railway.
4. Set `EMAIL_SENDER_ADDRESS` to an address on your verified domain.

### 4b. Verify email works (HARD GATE)

1. Register a new account on the live URL using a real email address you control.
2. Check your inbox for the verification email from SRVD.
3. Click the verification link — confirm it marks the account as verified.
4. Trigger a password reset — confirm the reset email arrives and the link works.

**Do not invite beta users until both emails are confirmed working.**

### 4c. What SRVD sends

| Email | Trigger | Subject |
|---|---|---|
| Verification | Registration | "Verify your SRVD account" |
| Password reset | Reset request | "Reset your SRVD password" |
| Password changed | Successful reset | "Your SRVD password was changed" |

### 4d. If email fails

- Check Resend dashboard for delivery logs / bounces.
- Confirm `EMAIL_SENDER_ADDRESS` matches the verified domain exactly.
- Confirm `EMAIL_PROVIDER_API_KEY` is the correct key (not a restricted key without send permission).
- The email service uses native `fetch` against `https://api.resend.com/emails` — confirm Railway's egress allows this (it should by default).

---

## 5. Database

### Current strategy: SQLite on a Railway volume

- The database file lives at the path specified by `DATABASE_URL` (e.g. `/data/srvd.sqlite`).
- Migrations run automatically on server boot — no manual migration step.
- 11 migrations create the full schema: users, sessions, shifts, goals, recipes, recipe_ingredients, calculator_presets, audit_log, verification_tokens, alpha_invitations, feedback_submissions.

### Backup

```bash
# SSH into Railway or use railway run:
cp /data/srvd.sqlite /data/srvd-backup-$(date +%Y%m%d).sqlite
```

For automated backups, set up a cron service on Railway that copies the file to cloud storage (S3/GCS) on a schedule. This is a recommended fast-follow, not a beta blocker.

### Rollback

To roll back to a previous state:
1. Stop the service (or scale to 0).
2. Replace `/data/srvd.sqlite` with a backup copy.
3. Restart the service.

Migrations are additive and idempotent — rolling back application code does not require schema changes for the beta scope.

### Post-beta: PostgreSQL migration

Paired Postgres migrations exist in `db/postgres-migrations/`. The migration requires converting the data-access layer to async (see `src/shared-kernel/data-access.postgres.reference.ts`). This is a scaling item, not a beta item.

---

## 6. Build & start commands

| Action | Command |
|---|---|
| Install dependencies | `npm install` |
| Build (TypeScript → dist/) | `npm run build` |
| Run tests | `npm test` |
| Typecheck only | `npm run typecheck` |
| Lint | `npm run lint` |
| Start (production) | `npm start` |
| Start (dev, API only) | `npm run dev` |
| Start (dev, static server) | `npm run web` |
| Seed demo data (dev only) | `npm run seed` |

### Production start (`npm start`)

Runs `npm run build && node dist/scripts/prod-server.js`. This:
1. Compiles TypeScript to `dist/`.
2. Boots the combined server (API + web client on one port).
3. Applies any pending migrations.
4. Validates all required env vars are present (fails fast if not).

---

## 7. Health check

- **Endpoint:** `GET /health`
- **Expected response:** `{ "data": { "status": "ok" } }` with HTTP 200.
- **Auth required:** No.
- **Railway config:** `railway.json` sets `healthcheckPath: "/health"` with a 100ms timeout.

---

## 8. Security summary

| Measure | Status |
|---|---|
| Password hashing | scrypt (Node crypto) |
| Session model | Bearer tokens, single authorization chokepoint |
| Password reset revokes sessions | ✅ tested |
| Email verification gate | ✅ tested |
| Rate limiting (auth routes) | ✅ tested |
| Rate limiting (data export, stricter) | ✅ tested |
| Ownership enforcement (shifts/recipes/settings/sessions) | ✅ tested |
| Input validation (centralized) | ✅ tested |
| Anti-enumeration (login/reset) | ✅ tested (same error for wrong email vs wrong password) |
| Dev-token exposure blocked in prod | ✅ structural (not configurable) |
| Static path traversal protection | ✅ tested |
| Analytics PII redaction | ✅ allowlist + prohibited patterns, tested |
| Audit log | ✅ for deletions and data export |
| No committed secrets | ✅ verified by scan |

**Remaining risks (non-blocking for closed beta):**
- No CSRF token (mitigated: API uses bearer auth in headers, not cookies).
- No structured error monitoring (Railway logs only).
- No Content-Security-Policy or other security headers beyond what Node's `http` provides by default.

---

## 9. Beta readiness checklist (scaled)

### Deployment
- [ ] Code pushed to GitHub (`SRVD` repo)
- [ ] Tagged `v1.0.0-beta.1`
- [ ] Railway service created, connected to repo
- [ ] Persistent volume mounted at `/data`
- [ ] All env vars set (see §3c)
- [ ] Deploy succeeds; `/health` returns 200

### Domain
- [ ] Railway public URL is live (custom domain optional for beta)
- [ ] `APP_URL` env var matches the public URL exactly
- [ ] TLS active (Railway provides this automatically)

### Database
- [ ] Migrations applied (startup log: "11 migrations applied")
- [ ] Persistence verified across a redeploy (§3f)

### Email (HARD GATE)
- [ ] Resend account created, domain verified (SPF/DKIM/DMARC)
- [ ] `EMAIL_PROVIDER_API_KEY` and `EMAIL_SENDER_ADDRESS` set
- [ ] Verification email sends and the link works
- [ ] Password-reset email sends and the link works

### Authentication
- [ ] Register → verify → login → logout works on live URL
- [ ] Password reset end-to-end works on live URL

### Monitoring
- [ ] Railway log stream accessible and reviewed
- [ ] (Recommended) Structured error monitor wired (e.g. Sentry)

### Analytics
- [ ] `shift_edited` and `recipe_edited` events appear in logs when triggered

### Feedback
- [ ] `/alpha/feedback` endpoint accessible (tested via the app)
- [ ] Triage process documented (see `docs/BETA-FEEDBACK-PROCESS.md`)

### Backups
- [ ] Manual backup taken after confirming persistence
- [ ] (Recommended) Automated backup schedule configured

### Rollback
- [ ] Rollback plan reviewed (see §5 above and `docs/runbooks/rollback-and-incident-response.md`)

### First user
- [ ] Send one beta invitation
- [ ] Watch the full onboarding in the log stream (register → verify email → login → first action)
- [ ] Confirm no errors

### First five users
- [ ] Invite 4 more
- [ ] Monitor for 24 hours
- [ ] Review any feedback submissions
- [ ] Fix P0/P1 only; defer everything else

### First twenty-five users
- [ ] Expand invitations in batches of 5–10
- [ ] Continue monitoring; watch for concurrency or performance patterns
- [ ] Take a backup before each batch
- [ ] Review analytics log lines and feature usage patterns
- [ ] Record Version 1.2 candidates — do not build them

---

## 10. Known limitations

### Production blockers
None. All release criteria from the Beta Launch Report are met at the code level. The remaining gates are infrastructure verification steps (email, deploy, persistence) that require the founder's accounts.

### Minor issues (non-blocking for closed beta)
1. **Recipe-edit UI shows/edits only the first ingredient row.** Backend handles all ingredients correctly; this is a frontend cosmetic limitation.
2. **Analytics covers only 2 of 8 possible events** (`shift_edited`, `recipe_edited`). Broader instrumentation requires an explicit scope decision.
3. **No structured error monitoring.** Railway logs are the current fallback.
4. **`node:sqlite` emits an "experimental" runtime warning.** Functional but flagged by Node. Pin Node ≥ 22.5.
5. **No security headers** (CSP, HSTS, X-Frame-Options). Recommended fast-follow.

### Future improvements (not Version 1.2 features, just operational)
- Automated backups to cloud storage.
- Structured error monitoring (Sentry or equivalent).
- Security headers middleware.
- Full WCAG accessibility audit.
- Device-matrix responsive QA.
- Real-browser Lighthouse pass.

### Version 1.2 ideas (recorded, NOT in scope)
- Learning Academy
- Profile page
- Checklists
- Shift Journal
- Ingredient Library
- Recipe Costing
- Collections
- Billing / payments
- Broader analytics instrumentation
- PostgreSQL migration

---

## 11. Rollback plan

1. **Application rollback:** Railway keeps prior deployments. Roll back from the Railway dashboard → Deployments → select a previous successful deploy.
2. **Database rollback:** Replace the SQLite file on the volume with a backup copy (see §5).
3. **Full rollback:** scale the Railway service to 0, restore the database backup, then redeploy the last-known-good commit.

Migrations are additive — a code rollback within the beta scope does not require a schema rollback.

---

## 13. Final status

### Gate 1: READY FOR GITHUB ✅

Evidence: repo is complete (package.json, lock file, tsconfig, 248-line README, deploy docs, env template, 12 test files, railway.json, release notes, launch report, API reference, admin checklist, feedback process). No secrets committed. `.gitignore` covers node_modules, dist, .env, sqlite files, OS/editor artifacts. Pre-commit hook builds and tests from a clean state. Version tagged `1.0.0-beta.1`.

### Gate 2: READY FOR RAILWAY DEPLOYMENT ✅

Evidence: `railway.json` present with health check. Production entrypoint (`prod-server.ts`) verified — boots, serves API + web on one port, applies migrations, validates env vars fail-fast. `.env.example` documents every variable with purpose, default, example, and security classification. Deployment guide (this document §3) provides copy-pasteable steps.

### Gate 3: READY FOR CLOSED BETA — conditional on infrastructure verification

Evidence: 172/172 tests, build clean, typecheck clean, lint clean, security review documented, rollback plan documented, feedback system built and documented. The code is beta-ready. The **conditions** (unchanged from the Beta Launch Report) are:

1. **[HARD GATE]** Live email round-trip verified (register → verification email arrives → link works; password reset → email arrives → link works).
2. Deploy from clean environment with `/health` green.
3. Persistent volume confirmed across a redeploy.
4. All production env vars set per §3c.

Once those four pass, the status upgrades to **READY FOR CLOSED BETA** with no further code changes needed.
