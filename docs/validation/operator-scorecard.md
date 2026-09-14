# VIGIA operator validation scorecard

This scorecard is blank by design. Populate it only from observed sessions.

## Session record

| Field | Value |
|---|---|
| Participant code | |
| Role / operating context | |
| Experience band | |
| Release identity | |
| Frontend version | |
| Date / moderator | |

## Task results

| Task | Completion | Time | First click correct? | Wrong turns | Confidence 1–5 | Safety-relevant misunderstanding |
|---|---|---:|---|---:|---:|---|
| T1 Overview | Not executed | | | | | |
| T2 Detect | Not executed | | | | | |
| T3 Continuity | Not executed | | | | | |
| T4 PREVENT | Not executed | | | | | |
| T5 Respond | Not executed | | | | | |
| T6 Source Health | Not executed | | | | | |
| T7 Handoff | Not executed | | | | | |
| T8 Degraded imagery | Not executed | | | | | |
| T9 Settings | Not executed | | | | | |
| T10 Keyboard | Not executed | | | | | |

Completion values are `independent`, `assisted`, `failed`, or `not executed`.

## Interpretation checks

Score each as `correct`, `partly correct`, `incorrect`, or `not observed`:

- Current physical evidence versus public report
- Healthy provider versus positive observation
- Stale versus unavailable versus not configured
- Observation versus inference versus operator input
- Missing measurement versus numeric zero
- Event identity continuity
- Command state versus physical sensing
- Degraded image versus missing structured evidence

## Severity

- **P0:** Could create false certainty, hide a current threat, misidentify the incident, invent command readiness, or erase operational state.
- **P1:** Blocks or materially slows a core task without an immediate safe workaround.
- **P2:** Causes avoidable hesitation, clutter, or accessibility friction.
- **P3:** Cosmetic or low-frequency issue with no operational consequence.

## Session decision

Record the participant’s highest-severity issue, the task with the longest hesitation, one adoption blocker, and one capability they would rely on.

| Session measure | Score / note |
|---|---|
| Trust rating (1–5) | |
| Workflow-fit rating (1–5) | |
| Current-situation comprehension time | |
| Incident-selection time | |
| Evidence-explanation time | |
| Error / confusion count | |
| Integration blockers | |

Do not compute a pilot-wide conclusion until all planned sessions are complete and P0 observations have been individually reviewed.
