# VIGIA safety constitution

VIGIA is built around evidence, uncertainty, attributable decisions and bounded authority.

## Non-negotiable rules

1. A risk score is not a detected physical hazard.
2. A public occurrence report is not automatically a confirmed ignition.
3. Missing evidence is not negative evidence.
4. Annual imagery is historical context, never proof of current conditions.
5. Every current observation exposes source, acquisition time, age, resolution, quality and limitations.
6. A physical hazard requires accepted attributable evidence.
7. Incident escalation requires independent support or authorized accepted evidence.
8. Null, epoch-like, impossible or future timestamps fail closed.
9. Remediation completion is not closure; independent re-observation is required.
10. Consequence capability is gated by truth stage and freshness.
11. Screening geometry is labelled unvalidated unless produced by an approved provider.
12. Every material human transition is authorized and audit logged.
13. Missing or unavailable sources remain visibly unavailable.
14. Official civil-protection instructions always supersede VIGIA.

## Explicit non-authorities

VIGIA does not autonomously:

- declare an emergency;
- dispatch emergency resources;
- issue evacuation instructions;
- tell a resident that a property is safe;
- verify a hazard from model output alone;
- promote a public report to verified;
- close remediation without proof;
- represent an unvalidated ellipse as a fire forecast.

## Truth stages

Incident:

```text
reported → corroborated → verified
    └──────────────→ rejected
```

Prevention:

```text
inspection priority → evidence request → accepted evidence
                                      → verified hazard or rejected hypothesis
```

Risk reduction:

```text
verified hazard → assigned action → completion proof
                → independent re-observation → verified outcome → closed
```

## Evidence contract

An attributable package contains:

- organization/workspace/territory;
- actor and role;
- target and request;
- capture time;
- coordinate and stated accuracy;
- observations and note;
- attachment metadata;
- source/device provenance;
- checksum;
- supervisor decision and rationale.

A UI button cannot bypass this contract.

## Consequence gate

- **Reported or stale:** operational consequence screen locked.
- **Corroborated/current:** provisional scenario allowed with explicit limitations.
- **Verified/current:** validated provider may produce operational decision support.
- **Unvalidated internal provider:** always labelled screening only.

## User-facing language

Preferred:

- inspection priority;
- needs evidence;
- public report;
- independently supported;
- operator verified;
- current observation unavailable;
- provisional scenario;
- recommended next action.

Disallowed without certification and evidence:

- guaranteed detection;
- real-time truth;
- exact arrival time;
- official alert;
- autonomous command;
- safe to remain.
