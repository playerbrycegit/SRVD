# SRVD — Beta Admin Checklist

Operational checklist for running the closed beta. Owner: founder/admin. Version target: `v1.0.0-beta.1`.
Items marked **[hard gate]** must pass before real users are invited.

## Before launch

- [ ] Push the repo to GitHub and tag `v1.0.0-beta.1` at the deploy commit.
- [ ] Provision the Railway service and attach a **persistent volume** (e.g. mounted at `/data`).
- [ ] Set production env vars (see `.env.example`): `NODE_ENV=production`, `PORT` (Railway sets this), `APP_URL` (your public URL), `DATABASE_URL=file:/data/srvd.sqlite`, `SESSION_SECRET` (long random), `EMAIL_PROVIDER_API_KEY`, `EMAIL_SENDER_ADDRESS`.
- [ ] Deploy the production build. Confirm the build succeeds from a clean environment.
- [ ] **[hard gate]** Verify `/health` returns `{ "data": { "status": "ok" } }` at the live URL.
- [ ] Confirm migrations ran (startup log shows "11 migrations applied").
- [ ] **[hard gate]** Verify email end-to-end: register a real test account against the live Resend key + verified sender, confirm the verification email arrives, and confirm the link verifies the account. Repeat for a password-reset email.
- [ ] Test authentication: register → verify → login → logout on the live URL.
- [ ] Confirm the persistent volume survives a redeploy: create a user, redeploy, confirm the user still exists.
- [ ] Payments: N/A for this beta (no payment flow implemented).
- [ ] Analytics: confirm `shift_edited` / `recipe_edited` log lines appear (these are the only two approved events — see Known Limitations in the launch report).
- [ ] Monitoring: confirm Railway log stream is accessible. (Structured error monitoring is a recommended fast-follow, not yet wired.)
- [ ] Verify TLS/SSL is active on the production domain (Railway provides this).

## Launch day

- [ ] Enable/generate beta invitations for the cohort (via the alpha invitation flow).
- [ ] Watch the Railway log stream continuously.
- [ ] Verify the first few real onboardings complete (register → verify → first shift/recipe).
- [ ] Verify registrations are persisting (spot-check via the export or DB).
- [ ] Monitor the support inbox / feedback channel.

## First 24 hours

- [ ] Review errors in the log stream; trace any 5xx to root cause.
- [ ] Review analytics log lines for the two instrumented events.
- [ ] Review incoming feedback (see the Beta Feedback Process doc).
- [ ] Respond to every user who reports an issue.
- [ ] Patch **critical issues only** (P0/P1). Defer everything else.

## First week

- [ ] Measure retention (returning users across days 1–7).
- [ ] Track which features get used (shifts, recipes, tools, goals, settings).
- [ ] Review and triage all support/feedback requests to P0–P3.
- [ ] Prioritize fixes by priority × frequency.
- [ ] Record candidate Version 1.2 opportunities in a backlog — do not build them during the beta.
