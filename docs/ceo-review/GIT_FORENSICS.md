# Git forensics

## Executive finding

Git does **not** contain delivered commits for either recent engineering program. It contains one initial baseline commit and one large dirty working tree. Therefore exact Agent 1 and Agent 2 commit ranges do not exist. The current engineering artifact can only be reviewed as the delivered working tree over the baseline, with time-window and documentation evidence used for bounded attribution.

Any report that presents invented Agent 1 or Agent 2 SHAs would be false.

## Commands and immutable facts

```text
git branch --show-current   -> master
git rev-parse HEAD          -> c6e28bd237b577e4a7901f291fe43aef239957ad
git log --all               -> one commit
git reflog                  -> one initial commit entry
git stash list              -> empty
git branch -avv             -> master only
```

The only commit is:

```text
c6e28bd  baseline: VIGIA v10 physical intelligence core
author/commit time: 2026-08-09 18:22:57 +0100
```

There is no `AGENTS.md` in the working tree or baseline commit.

Before reviewer artifacts were added, the status snapshot contained 103 modified tracked files, 45 deleted tracked files, and 40 collapsed untracked status entries. The tracked delta was:

```text
148 files changed, 837 insertions(+), 1415 deletions(-)
```

Untracked directories expand to many individual files; Git reported 102 untracked file paths after reviewer screenshots were added. The counts in this document distinguish the pre-review engineering snapshot from reviewer output under `docs/ceo-review/`.

## State reconstruction

| State | Git identity | Evidence | Confidence |
|---|---|---|---|
| Pre-agent baseline | `c6e28bd237b577e4a7901f291fe43aef239957ad` | Only commit; timestamp precedes every audit/recovery/reality file | High |
| Agent 1 checkpoint | No commit or stash | `docs/audit/*` at 19:37–19:42; recovery code/tests continue 19:51–22:27 | High for time window; medium for individual path attribution; no exact checkpoint recoverable |
| Agent 2 / Reality Cutover | No commit or stash | Cutover-related changes begin at 23:02; reality docs and acquisition work continue through 23:55 | High for time window; medium for paths overwritten in both programs |
| Current delivered state | `c6e28bd` + dirty working tree | Current filesystem, all tests/runtime behavior, and engineering docs | High |

## Pre-agent baseline

The baseline is the initial commit at 18:22:57 WEST. Agent 1's own audit documents describe its material defects: a runtime-switchable fixture universe, client-selected fake actors, seeded work/outcomes, corrupted audit-chain behavior, non-idempotent field sync, silent persistence failure, no managed scientific runtime, no physical event evidence, fabricated probability/information-gain language, and synthetic browser validation.

The baseline can be inspected exactly with `git show c6e28bd`. It is the only clean state in Git, but it is not the product the user asked to review because all claimed completed engineering exists only outside it.

## Agent 1 window

File modification chronology is internally coherent:

- 19:37:08 — `docs/audit/CAPABILITY_TRUTH_AUDIT.md`
- 19:38:55 — `docs/audit/RUNTIME_TRACE.md`
- 19:40:42 — `docs/audit/BROKEN_CLAIMS.md`
- 19:42:29 — `docs/audit/P0_RECOVERY_PLAN.md`
- 19:51–20:15 — accepted-evidence, field idempotency, operational events, security, evidence-request work
- 20:27–20:57 — observation opportunities, EvidenceNeed, persistence failures, fusion, geometry, scientific runtime, consequence/outcome semantics
- 21:24–21:46 — event identity feedback, source failure, evidence envelopes, observation opportunities, authorization
- 22:27:27 — `public-read-redaction.test.mjs`, the last clear pre-cutover modification

This establishes a reliable Agent 1 program window, but **not** a reconstructable Agent 1 tree. Later changes overwrite several of the same files, including event tracking, persistence, request context, UI, and composition.

## Agent 2 / Reality Cutover window

The second cluster begins after a 35-minute gap:

- 23:02 — physical observation and fire tracker changes
- 23:03–23:06 — production server, identity/state, fixture removal, readiness, live source graph
- 23:07–23:13 — hidden product surfaces, served UI, reality/authorization tests
- 23:24–23:34 — production browser/smoke/replay gates and public read-only UI
- 23:36–23:42 — raw fetch support, production config/routes, FIRMS and acquisition layer
- 23:45–23:55 — reality/recovery documentation and final acquisition/service wiring

The program self-identifies its boundary: `docs/recovery/CHANGESET.md:3` states, “This worktree already contained a large uncommitted P0 recovery changeset at cutover start.” `docs/reality/PRODUCTION_CUTOVER.md:5` also records `master / c6e28bd with an existing uncommitted recovery changeset`.

These are claims, but they align with independent filesystem chronology and code semantics.

## Dirty target classification

| Class | Paths/examples | Treatment |
|---|---|---|
| UNCOMMITTED ENGINEERING WORK | 148 tracked changes plus new acquisition, readiness, EvidenceNeed, production-integrity, tests, and docs | Included as the delivered artifact; not represented by HEAD |
| POST-DELIVERY PRODUCTION CHANGE | None separable from the completed programs | Cannot be isolated; no later commit/checkpoint exists |
| RUNTIME ARTIFACT | `data/runtime/*`, `.tmp/ceo-review-runtime/*` where present/ignored | Excluded from product source judgment; used only as runtime evidence |
| LOCAL ENVIRONMENT | `.venv/`, `node_modules/`, caches | Excluded from delivered source; used to execute checks |
| GENERATED OUTPUT | Python `__pycache__`, temporary browser/runtime files | Excluded from capability claims |
| REVIEWER DIAGNOSTIC | `docs/ceo-review/*`, `.tmp/ceo-review-runtime/*` | Created by this audit; not attributed to either agent |

## Review target decision

The instruction says to prefer the latest clean delivered checkpoint. No such checkpoint exists after the baseline. Reviewing only `c6e28bd` would discard both finished programs and judge the wrong artifact. This audit therefore reviews:

```text
TARGET = c6e28bd + the complete pre-review dirty working tree
```

The target is the latest delivered filesystem state, **not a reproducible Git revision**. This is itself a release-engineering failure: the application cannot be built, compared, rolled back, or attested from a commit SHA.

## What Git can and cannot prove

Git proves:

- the exact baseline;
- that all subsequent engineering is uncommitted;
- the complete cumulative tracked delta;
- that no clean agent checkpoint, branch, stash, tag, or reflog entry exists;
- which fixture assets/modules were deleted or moved out of production paths;
- which new modules and tests are currently untracked.

Git cannot prove:

- exact file ownership between Agent 1 and Agent 2;
- the precise Agent 1 intermediate content;
- whether a later agent modified an earlier agent's file;
- a clean deployable revision for the current product.

## Release-control conclusion

The engineering state is technically auditable but not release-auditable. A serious emergency product must require each bounded program to end in a signed, tested commit or release tag with build provenance. Here, even the successful no-fiction gates are results over an uncommitted filesystem whose exact contents are not named by `HEAD`.
