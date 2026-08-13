# SRVD Closed-Beta Readiness Report

## Status

**Code status: APPROVED WITH DEPLOYMENT CONDITIONS**

The current feature branch has implemented the core SRVD Connect beta workflow and has active CI. It is not yet a live beta because no real hosting environment, persistent database volume, live sender domain, or real-browser QA has been verified.

## Implemented beta product

### Core

- Auth and email-verification gating
- Password reset/session revocation
- Shifts, tips, stats, weekly goals
- Recipe Vault
- Batch, ABV/proof, and unit conversion tools
- Settings, data export, account deletion
- Beta invitation/feedback infrastructure

### Connect

- Bartender-owned guest profiles
- Venue records
- Visit tracking
- Favorites / Regulars / VIPs
- Manual and smart lists
- Explicit email consent
- Suppression/unsubscribe
- Recipient eligibility preview
- List-driven email selection
- Personalized per-recipient emails
- One-click unsubscribe
- Conservative send limits
- Kill switch
- Connect data export

## Automated verification

GitHub Actions currently gates:

- `npm ci`
- production dependency audit (`npm audit --omit=dev --audit-level=high`)
- strict TypeScript
- ESLint
- complete Node test suite
- Docker image build

The branch has had successful CI runs after the Connect service/API/messaging implementation. Always use the latest PR check as the merge source of truth.

## Security / privacy controls

- Every bartender-owned Connect query is scoped by `user_id`.
- Cross-user guest access is covered by negative tests.
- Contact information does not imply message consent.
- Sending rechecks consent and suppression at send time.
- Revocation creates suppression.
- Suppression cannot be bypassed by granting consent again through the current flow.
- Recipients are emailed individually; addresses are never exposed as a group.
- One-click unsubscribe tokens are random, single-use, expiring, and stored hashed.
- Email sending is disabled unless `CONNECT_EMAIL_SEND_ENABLED=true`.
- Maximum 25 selected guests per campaign.
- Maximum 3 sent/sending email campaigns per bartender per rolling 24 hours.
- Analytics events do not include guest names, email, phone, message content, notes, exact tips, or recipe content.

## Deployment conditions before inviting users

1. Choose a host that supports a persistent disk/volume for the SQLite beta database.
2. Deploy one app instance only.
3. Mount persistent storage and set `DATABASE_URL` to the persistent SQLite path.
4. Configure and verify automated backups.
5. Set a real `APP_URL`.
6. Configure a verified transactional-email sender/domain.
7. Verify registration email delivery.
8. Verify password-reset delivery.
9. Keep `CONNECT_EMAIL_SEND_ENABLED=false` initially.
10. Send a controlled Connect test email after all other email flows work.
11. Open the unsubscribe link from that real email and verify it works on the public domain.
12. Confirm the same guest is excluded from subsequent recipient preview.
13. Only then consider enabling Connect email for the limited beta cohort.
14. Perform manual QA on small phone, standard phone, tablet, and desktop.
15. Perform keyboard/focus/screen-reader smoke testing on the critical flows.

## Database position

The working runtime remains SQLite. PostgreSQL migration files exist but the application data layer is still synchronous. PostgreSQL must not be presented as working until the async runtime migration and real Postgres test suite are complete.

For the closed beta, SQLite is acceptable only with:

- one app instance;
- persistent disk;
- backups;
- conservative cohort size;
- no horizontal scaling.

## Email position

The application includes a Resend-compatible provider implementation using native fetch, but a live provider/API-key/domain path has not been verified from a deployed environment.

Connect email sending should remain off by default. SMS is not implemented.

## Known beta limitations

- No PostgreSQL runtime
- Single-instance in-memory rate limiting
- SMS disabled
- Immediate email only; no scheduling
- No recipient-timezone quiet-hour engine
- No guest QR/self-follow signup
- Manual real-browser/device accessibility testing still outstanding
- Recipe editor UI has pre-existing multi-ingredient limitations

## Rollback

The Connect email capability can be disabled independently by setting:

```text
CONNECT_EMAIL_SEND_ENABLED=false
```

If the wider Connect experience must be rolled back before merge, close the feature PR and retain `main`. After merge/deployment, application rollback should use the previous known-good commit/tag while preserving the persistent database backup.

## Final recommendation

**APPROVED WITH DEPLOYMENT CONDITIONS FOR A SMALL CLOSED BETA.**

Do not invite the wider bartender cohort until the deployment, persistent storage, backups, live email, public unsubscribe, and manual browser/mobile checks above are complete.
