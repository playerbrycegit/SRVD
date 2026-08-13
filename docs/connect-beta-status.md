# SERVD Connect — Beta Implementation Status

## Implemented

- Guests, venues, visits
- Favorite / Regular / VIP status
- Guest search
- Manual lists and smart lists
- Consent records
- Suppression / unsubscribe enforcement
- Recipient eligibility preview
- List-based message recipient selection
- Email personalization
- One-click unsubscribe
- Per-recipient delivery records
- Email kill switch
- Conservative beta campaign limits
- Connect data export
- Docker packaging
- GitHub Actions quality gate

## Safe defaults

- `CONNECT_EMAIL_SEND_ENABLED=false`
- SMS unavailable
- No cold-contact import
- No implicit consent
- Suppression takes precedence over consent
- One app instance for SQLite beta

## Must be verified in a real deployment before Connect email is enabled

- verified sender/domain
- real registration email
- real reset email
- controlled Connect delivery
- public unsubscribe link
- post-unsubscribe recipient exclusion
- persistent SQLite disk
- automated backup and restore procedure
- browser/mobile/accessibility smoke testing

## Deferred

- PostgreSQL runtime
- SMS
- scheduled campaigns
- recipient-timezone quiet hours
- QR/self-follow signup
- push notifications
- multi-instance rate limiting
