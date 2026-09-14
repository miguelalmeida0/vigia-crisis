# VIGIA operator validation task script

Run tasks in order without coaching. The moderator may restate the goal but must not name the control.

## Preconditions

- Backend 4177 and FieldNet 4188 expose the certified release identity.
- Operator Console 4190 is the repo-owned `apps/operator-console` build.
- Current canonical Portugal events and the Castelo de Vide observation pair are available.
- The session starts at Overview with browser storage reset only when the study protocol calls for it.

## Tasks

| ID | Operator goal | Required observable outcome |
|---|---|---|
| T1 | Establish the current national situation | States whether defensible current physical fire evidence exists, what needs attention, which source is degraded, the key evidence gap, and what is unknown. |
| T2 | Inspect three Portugal events | Selects three canonical events and notices changing identity, coordinates, map context, evidence, NOW, NEXT, and WHY. |
| T3 | Resume work after navigation | Selects an incident, visits Respond and Evidence, returns to Detect, and confirms the same event remains active. |
| T4 | Assess a PREVENT finding | Opens Castelo de Vide, identifies both observation IDs/times, compares at approximately 20% and 80%, drags the divider, and states what changed, where, stability, missing evidence, and measurement requirement. |
| T5 | Prepare a response view | Distinguishes physical sensing from command readiness and identifies unavailable or not-configured command integrations without inferring exercise state. |
| T6 | Explain source health | Distinguishes provider health, stale data, configuration/auth/ingest failure, and a healthy provider returning no qualifying observation. |
| T7 | Hand off the shift | Identifies active alerts, evidence follow-up, source issues, measurement work, selected incident, and information not linked to command. |
| T8 | Recover from degraded imagery / FieldNet state | Interprets the returned FieldNet state, then continues after one map tile and one evidence preview fail; retains incident identity, NOW/NEXT/WHY, metadata, source state, and command truth. |
| T9 | Save a preference | Changes an accessibility or display setting, saves, refreshes, and verifies persistence. |
| T10 | Complete by keyboard | Opens/closes the event drawer and an operational dialog, follows visible focus, and returns focus to the invoking control. |

## Moderator capture

For each task record completion (`independent`, `assisted`, `failed`), elapsed time, first click, wrong turns, backtracks, interpretation errors, and participant confidence from 1–5. Note whether an error could cause delayed action, false escalation, missed evidence, or false certainty.

Do not convert an unexecuted task into a failure. Mark it `not executed` with the reason.
