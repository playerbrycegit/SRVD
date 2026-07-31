# SRVD — Bug Triage Framework

## Priority Definitions

**P0 — Release Blocking:** auth unavailable, data exposure, cross-user access, data corruption,
major calculation failure, production outage.

**P1 — Critical Workflow Failure:** cannot start/end a shift, tips don't persist, recipes can't be
saved, password reset fails, data export exposes incorrect data.

**P2 — Significant Degradation:** unreliable search, major mobile layout break, incorrect empty
state, slow primary workflow, non-critical accessibility blocker.

**P3 — Minor Issue:** visual inconsistency, wording issue, small alignment problem, low-impact edge case.

*A participant's self-selected severity is a signal, not a final priority — every submission is
reviewed and assigned P0–P3 by whoever triages it, per the program's own rule against treating
user-selected severity as final without review.*

## Required Fields Per Tracked Defect

| Field | Notes |
|---|---|
| Identifier | Stable ID, e.g. `SRVD-001` |
| Summary | One line |
| Priority | P0–P3 (assigned during triage, not copied from submitted severity) |
| Severity | As submitted by the reporter, kept separately from Priority |
| Affected feature | e.g. "Shift logging", "Batch calculator" |
| Reproduction status | Reproduced / Could not reproduce / Reproducing |
| Environment | Browser, OS, device type |
| Owner | Who's fixing it |
| Status | Open / In progress / Fixed / Verified / Won't fix |
| Root cause | Filled in once diagnosed — not left blank once "Fixed" |
| Fix version | e.g. `0.1.1` |
| Regression test | Link/reference to the added or updated test (per the program's bug-fix rules, every confirmed defect gets one) |
| Verification result | Confirmed fixed in the environment it was reported in, not just "should be fixed" |

## Bug-Fix Rules (restated as a checklist)

- [ ] Reproduced
- [ ] Root cause identified (not just the symptom)
- [ ] A failing test was added or an existing test updated to cover it
- [ ] Smallest reliable fix made
- [ ] Relevant tests pass
- [ ] Full regression suite passes
- [ ] Verified in the environment it was reported in
- [ ] Never closed solely because it couldn't be reproduced once
- [ ] No test was weakened to make the fix look successful

## Current Register

**Empty.** No participant-reported defects exist yet because no alpha has run. Do not populate this
table with invented entries — the first real row here should come from a real participant report.

| ID | Summary | Priority | Status |
|---|---|---|---|
| — | — | — | — |
