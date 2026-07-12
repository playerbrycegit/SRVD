# STATION — Rollback & Incident Response Runbook

**Status: never executed** — same honesty note as `deployment.md`. Written to be correct and
usable the first time it's actually needed, not to imply it's been rehearsed against real
infrastructure.

## Rollback Conditions
Roll back when any of the following is true:
- Authentication is unavailable
- Data writes are failing
- Cross-user data access occurs (this is the single most damaging class of bug this schema's
  ownership-scoping was specifically designed to make structurally impossible — if it happens
  anyway, that's a signal the deployed code diverged from what was tested, and rollback is not
  optional)
- Core calculations are producing incorrect results (batch/ABV/conversion)
- A migration has corrupted data
- Error rate is severely elevated
- A critical email flow is broken with no workaround
- Production cannot recover quickly through normal means

## Rollback Procedure
1. **Application rollback:** redeploy the previous known-good tagged release. Every deployment
   (per `deployment.md`) retains its tag, so "previous good" is always identifiable.
2. **Database rollback:** only if the triggering issue is migration-related. Every migration must
   have a tested down-migration available *before* it was ever applied to production (per
   `deployment.md` step 4) — rollback is not the moment to discover one doesn't exist.
3. **Migration reversal:** run the down-migration, verify row counts and constraints match
   pre-migration expectations, not just "the command exited 0."
4. **Feature disabling:** if the issue is isolated to one route/feature (e.g., the export
   endpoint) and a full rollback is riskier than leaving the rest of the app running, disable that
   specific route rather than rolling back everything — a real judgment call to make at the time,
   not a rule that always favors one approach.
5. **Communication:** notify whatever support channel exists at the time, honestly and plainly —
   what happened, what's affected, what's being done. No vague "we're investigating" without a
   concrete next update time.
6. **Verification after rollback:** re-run the exact smoke tests from `deployment.md` steps 7–11
   against the rolled-back state before declaring the incident resolved.

**Never roll back a destructive database migration without a tested plan** — this is a hard rule
from the original prompt series, restated here because it's the single easiest rule to break under
incident pressure.

## Incident Severity

**Severity 1** — major outage, data exposure, data corruption, authentication failure affecting
most users, destructive migration failure.

**Severity 2** — major feature unavailable, significant email failure, severe performance
degradation, high-impact calculation defect.

**Severity 3** — limited feature degradation, minor performance issue, non-critical UI failure.

## Incident Response Steps
1. **Detect** — via monitoring/alerts (once real monitoring exists) or a support report.
2. **Classify** — Severity 1/2/3, using the definitions above, not gut feeling under pressure.
3. **Assign an owner** — one person driving the response, not an ambiguous group.
4. **Contain** — stop the bleeding (feature-disable or rollback) before root-causing.
5. **Communicate** — per the rollback procedure's communication step.
6. **Resolve** — the actual fix, following this project's standing bug-fix rules (reproduce, find
   root cause, add a regression test, smallest reliable fix — never patch a symptom).
7. **Verify** — smoke tests, specifically re-checking the exact failure mode that caused the
   incident, not just "seems fine now."
8. **Document** — what happened, timeline, root cause, fix.
9. **Add regression protection** — a test that would have caught this before it shipped.
10. **Post-incident review** — honest, blameless, focused on what the process should catch next
    time, matching this project's overall commitment to naming real gaps rather than smoothing
    over them.

## Database Recovery
A backup is not verified until a restore has actually been tested (this project's own standing
rule, restated in every relevant phase). Before this document's first real use:
- [ ] Confirm automated backup schedule is active
- [ ] Confirm backup retention period
- [ ] Confirm backup encryption
- [ ] **Actually perform a restore into a non-production environment** and confirm the restored
      data is correct — this step has never been done, because no backup exists yet, because no
      database exists yet, per every prior phase's honest reporting

## Email Provider Failure
Once a real provider is wired in (see `deployment.md` prerequisites): monitor provider-reported
delivery failures, have a documented bounce-handling policy, and know the provider's status-page
URL before an incident, not during one. Nothing here can be more specific until a real provider is
chosen — writing fake provider-specific steps now would be worse than leaving this section general.
