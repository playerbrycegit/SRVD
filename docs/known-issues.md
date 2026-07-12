# STATION — Known Issues

**Status:** No alpha has run yet, so every item below comes from internal review (the production
readiness audit and this document's own scenario validation), not from participant reports. This
list should be updated with real participant-reported issues once a real alpha actually begins —
do not backfill fabricated participant reports into this list.

| Issue | Affected feature | Workaround | Status |
|---|---|---|---|
| No way to edit a saved shift | Shift workflow | Delete and re-log the shift | Confirmed absent, tracked for V1.1 |
| No way to edit a saved recipe | Recipe Vault | Delete and re-create the recipe | Confirmed absent, tracked for V1.1 |
| No Settings screen (time zone, currency, units) | Settings | None — all shift dates/amounts assume the values used at signup | Confirmed absent, blocks true release-candidate status per the release criteria in this program |
| No data export | Settings | None | Confirmed absent, blocks release-candidate status |
| Verification/password-reset links aren't emailed | Auth | None — this is a sandbox limitation, not something a real alpha participant should ever see (must be resolved before real deployment) | Documented sandbox substitution, not a bug to report |
| Invite creation has no admin-role check | Alpha operations | Restrict who has an authenticated account able to call it until real role-based access exists | Confirmed gap, low risk pre-launch (no production deployment exists yet) |
| No production deployment exists | Everything | N/A | **Blocks any real alpha from starting at all** — see the production readiness audit |

This document intentionally contains no severity ratings that imply engineering priority beyond
what's already written above — priority for real participant-reported issues should go through the
Bug Triage Framework (P0–P3), not be inferred from this list's row order.
