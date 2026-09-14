---
name: full-output
description: Enforces complete production deliverables and prohibits placeholders, omitted files, partial route implementation, fake completion claims, and “continue later” output. Use for full files, multi-route releases, exhaustive audits, handoffs, and any task where partial output is a failure.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Full Output

A partial production deliverable is broken.

## Forbidden patterns

Never substitute required work with:

- `// ...`;
- `// rest of code`;
- `TODO` placeholders;
- “implement similarly”;
- “repeat for the remaining routes”;
- “for brevity”;
- omitted states, breakpoints, or controls;
- fake screenshots or stale artifacts;
- a completion claim followed by a list of fixable implementation omissions.

## Required behavior

- Deliver every requested route/component/file.
- If context limits force a split, finish at a safe boundary and label exact continuation state.
- Preserve a machine-readable manifest of completed and outstanding items.
- Do not mark an item complete until its verification evidence exists.
- Distinguish software work remaining from external provider/credential prerequisites.
