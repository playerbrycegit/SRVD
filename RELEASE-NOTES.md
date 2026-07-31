# SRVD — Release Notes

## v1.0.0-beta.1 — Closed Beta (July 31, 2026)

First beta release. Transitions the product from internal alpha (`0.2.0-alpha`) to a closed beta
under the **SRVD** name.

### Highlights

- **Rebrand to SRVD** across the entire codebase — UI, transactional email copy, page title,
  storage keys, database filename, docs, and package metadata. No prior-name references remain.
- **Single-origin production server** — the JSON API and the web client are now served from one
  port, eliminating CORS and any hardcoded API URL. Deployable to Railway/Render out of the box.
- **SQLite-on-volume persistence** for the beta — the database file lives on a mounted volume
  (path via `DATABASE_URL`) and survives redeploys.
- **Railway deployment config** with a `/health` check and fail-fast production env validation.
- **Executable lint** — the lint toolchain is now real (ESLint 9 flat config, TypeScript-aware)
  and enforced as a CI gate.

### Feature scope (carried from V1 / V1.1)

- Auth: registration, email verification gate, login/logout, password reset with session
  revocation, account deletion.
- Shifts: create, list, edit, delete, stats; weekly earnings goals.
- Recipe vault: create, list, search by name/category, view, edit (transactional ingredient
  replacement), delete.
- Bar tools: batch scaling, ABV/proof, unit conversion (shared calculation engine reused
  client-side).
- Settings: preferences, session management, data export.
- Alpha/beta operations: invitations, feedback submission + listing.

### Verification (as of this release)

- 172/172 automated tests passing. TypeScript typecheck: 0 errors. Lint: 0 problems.
- Production server boot verified end-to-end over HTTP (health, static, API, SPA fallback,
  DB persistence).

### Known limitations

- **Transactional email is unverified against the live provider** — code-complete but never sent a
  real message. Must be verified before inviting users (verification + password reset depend on it).
- **Analytics covers only `shift_edited` and `recipe_edited`** — the two events approved in the V1.1
  decision package. Broader analytics (registration, login, creation, tools, search, settings,
  feedback) is intentionally **not** instrumented and requires an explicit scope decision.
- **`node:sqlite` is an experimental Node feature** (emits a runtime warning).
- **Recipe-edit UI edits only the first ingredient row** (backend replaces all ingredients
  correctly).
- **No structured error monitoring** wired (Railway logs only).
- **Formal accessibility audit, device-matrix responsive QA, and real-browser web-vitals not yet
  run.**
- **PostgreSQL path exists but is unexecuted** — post-beta scaling item.

### Not in this release

- No Version 1.2 features. No payment flow.

See `BETA-LAUNCH-REPORT.md` for the full evidence-based readiness assessment and conditions.
