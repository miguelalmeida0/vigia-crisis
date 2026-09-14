# VIGIA external operator evaluation protocol

This protocol is ready for real participants. It must never be populated with simulated sessions.

Start the evaluation environment with `npm run operator:start`. Prepare the immutable study kit with `npm run operator-eval:prepare`. For each participant, run:

`npm run operator-eval:run -- --participant=PSEUDONYM --perspective=ROLE --practitioner=true --release-id=RELEASE_ID`

The runner displays consent, forbids direct identifiers, hashes the supplied pseudonym with a study-local salt, times all ten tasks, records the environment outcome, and applies the dangerous-misinterpretation rubric. It emits a receipt for withdrawal/audit. Score accumulated real sessions with:

`npm run operator-eval:score -- --results=data/runtime/evidence-war-room/operator-study-results.json`

Passing requires ten real sessions, five emergency practitioners, three operational perspectives, at least 90% critical-task completion, zero dangerous misinterpretations, median top-incident time under 45 seconds, median explanation time under 75 seconds, median handoff time under 240 seconds, clarity/trust of at least 4/5, complete traces, consent, and deidentification.
