# Operator usability check

Use the running authenticated console, first on a desktop and then on a phone. Start with the selected incident shown in the final screenshots. Use the current, degraded and no-information test cases separately when exercising deterministic coverage. Test cases never enter production source storage.

Start timing when the incident first viewport has finished loading. Ask one question at a time. Record the tester's words, seconds to answer, navigation steps, correctness and any mistaken certainty. Reset to the incident first viewport between questions. A scroll counts as a navigation step; a drawer open counts as one. Do not coach.

| Question | Correct interpretation | Seconds | Steps | Correct | Mistaken certainty |
|---|---|---|---|---|---|
| What is the wind at/near the incident? | Read the displayed km/h and direction; distinguish regional station context from local fire conditions. | | | | |
| When was it measured? | Read measurement age, not the console refresh time. | | | | |
| How far away is the station? | Read the named station and distance above the conditions strip. | | | | |
| When was the latest thermal detection? | Read the fire activity answer; absence of a matching record means unknown, not no fire. | | | | |
| Is that an exact fire location? | No: it is an observation point/pixel, not a fire front or perimeter. “Why this?” preserves sensor/footprint details. | | | | |
| Is there an applicable official warning? | Use the incident's area-matched answer. A national warning count is not local applicability. | | | | |
| What meaningful thing changed most recently? | Use What changed. Untimed computation updates are excluded; numeric history is not an escalated alert. | | | | |
| What information is missing? | Ask Vigia “What don't we know?”; read distinct gust, local observation, perimeter, access, warning and AQ gaps. | | | | |
| What should be investigated next? | Read next investigation with its reason. It is information-collection guidance, not permission to travel or dispatch. | | | | |

Acceptance target: correct first-viewport answers to the incident questions in about ten seconds, with no false claim of safety, official status or local weather. Time-to-answer needs a human participant; browser automation only measures retrieval and interaction latency.

## Performed checks

The agent reviews actual rendered route screenshots and checks the drawer/Ask interactions, clocks, station distance, map wind consistency, keyboard closure, viewports and overflow. Results live beside the screenshots in `reality-first/qa.json` and in the final handoff. Human timing cells above remain blank until a tester participates; no fabricated participant results are reported.
