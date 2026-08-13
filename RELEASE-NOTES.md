# SRVD Beta Release Notes

## 1.0.0-beta.1 + Connect Preview

This branch prepares SRVD for a controlled bartender beta with the existing core product plus the first production-safety slice of **SRVD Connect**.

### Core SRVD

- Secure account registration, email verification, login/logout, password reset, and session management
- Shift/tip logging, editing, history, statistics, and weekly goals
- Recipe Vault with create/edit/search/delete
- Batch scaling, ABV/proof, and unit conversion tools
- Settings, personal-data export, account deletion
- Alpha invitation and feedback infrastructure

### New: SRVD Connect

- Bartender-owned venues
- Private guest profiles
- Favorite, Regular, and VIP status
- Guest search
- Visit history and quick visit logging
- Manual guest lists
- Smart Favorites, Regulars, and recent-visitor lists
- Explicit email consent recording
- Suppression and unsubscribe enforcement
- Consent-aware recipient preview
- List-based recipient selection in the message composer
- Personalized email templates using `{{first_name}}` and `{{display_name}}`
- Email campaign kill switch: `CONNECT_EMAIL_SEND_ENABLED=false` by default
- Maximum 25 selected guests per beta email campaign
- Maximum 3 sent/sending beta email campaigns per bartender per rolling 24 hours
- Separate per-recipient email delivery; no group-address exposure
- One-click unsubscribe links using opaque tokens stored hashed at rest
- Connect guest/list/visit/consent/message metadata included in personal-data export

### Safety behavior

A contact method by itself is **not** consent. A guest remains ineligible until explicit permission is recorded. Revocation creates a suppression entry; later consent changes cannot silently bypass suppression. Archived guests and invalid contacts are excluded.

### Deployment

The branch includes a vendor-neutral Docker image and active GitHub Actions CI. The current beta runtime remains SQLite and therefore requires a single application instance plus persistent disk storage and backups.

### Not enabled / not complete

- SMS messaging
- PostgreSQL runtime
- Guest QR/self-follow signup
- Scheduled messaging
- Recipient-timezone quiet hours
- Multi-instance deployment
- Live provider/domain delivery verification
- Real-browser accessibility/device QA

Connect email sending must remain disabled until the deployed sender domain, delivery flow, and public unsubscribe path are verified manually.
