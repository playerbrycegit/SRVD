# SRVD — Beta Feedback Process

This documents the end-to-end process for collecting and acting on beta feedback. It builds on two
things already in the codebase — do not rebuild them:

- **Collection:** the `POST /alpha/feedback` endpoint (see API Reference). Feedback is validated,
  token-redacted for safety, and stored in `feedback_submissions`. `GET /alpha/feedback` lists it
  for the admin.
- **Triage:** the P0–P3 model in `docs/bug-triage-framework.md`.

## What we collect

Every submission is tagged with a category:

- **Bug** — something is broken or behaves incorrectly.
- **Feature request** — something the user wants that doesn't exist.
- **Usability concern** — it works but is confusing or awkward.
- **Performance** — slowness or lag.
- **Accessibility** — barriers for keyboard/screen-reader/contrast/motion needs.
- **General satisfaction** — overall sentiment, praise, NPS-style signal.

## Two-axis categorization: severity × frequency

The prompt's requirement is to categorize by **severity and frequency**. We keep these as two
independent axes and prioritize on their combination.

**Severity (priority, assigned during triage — not copied from the reporter's self-rating):**

- **P0 — Release blocking:** auth unavailable, data exposure, cross-user access, data corruption.
- **P1 — Critical workflow failure:** cannot start/end a shift, tips don't persist, recipes can't be saved.
- **P2 — Degraded:** broken non-critical state, slow primary workflow, non-critical a11y blocker.
- **P3 — Minor:** visual inconsistency, wording, small alignment, low-impact edge case.

> A participant's self-selected severity is a **signal, not a verdict** — every submission is
> re-assigned P0–P3 by whoever triages it. (This rule is inherited from the triage framework.)

**Frequency:** how many distinct users report the same underlying issue within a rolling window.

- **F1** — 1 report
- **F2** — 2–3 reports
- **F3** — 4+ reports (a pattern)

## Prioritization

Rank by **priority first, frequency second**. A P0 at F1 still outranks a P2 at F3. Within the same
priority, higher frequency wins. During the beta, act on **P0/P1 immediately**; batch P2/P3 into a
post-beta backlog.

| | F1 | F2 | F3 |
|---|---|---|---|
| **P0** | fix now | fix now | fix now |
| **P1** | fix now | fix now | fix now |
| **P2** | backlog | backlog | expedite |
| **P3** | backlog | backlog | backlog |

## Weekly loop

1. Pull all new submissions (`GET /alpha/feedback`).
2. De-duplicate — group reports of the same underlying issue and set a frequency band.
3. Assign each group a P0–P3 priority.
4. Fix P0/P1; log P2/P3 to the backlog and, where relevant, to Version 1.2 candidates.
5. Close the loop with reporters where possible.

## Privacy

Feedback submissions are token-redacted on the way in (a safeguard already in the feedback service).
Do not paste raw feedback containing personal data into external tools; keep it inside the admin flow.
