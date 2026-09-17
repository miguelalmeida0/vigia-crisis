# Repository structure

**Repository role:** PostGIS crisis-intelligence monorepo

The public root is product-first: runtime code, framework configuration,
tests, project docs and legal metadata stay visible. Agent runtime material,
historical planning and generated QA output live in explicit internal
namespaces.

## Rules

1. Product/runtime architecture owns the root.
2. Claude/Codex/agent material lives under `docs/internal/automation/` or `tooling/`.
3. Local agent conventions are recreated with `scripts/dev/bootstrap-local-tooling.sh`.
4. Generated output is not a root architectural concept.
5. Historical material lives under `docs/archive/`.
6. Framework-required configuration stays at root.

## Moved

- `.agents` -> `docs/internal/automation/agents`
- `.codex` -> `docs/internal/automation/codex`
- `.impeccable` -> `docs/internal/automation/impeccable`
- `AGENTS.md` -> `docs/internal/automation/AGENTS.md`
- `AGENTS.override.md` -> `docs/internal/automation/AGENTS.override.md`

## Notes

- None.

## Root before

```text
.agents/
.codex/
.dockerignore
.env.example
.gitignore
.impeccable/
AGENTS.md
AGENTS.override.md
README.md
apps/
artifacts/
data/
docs/
infra/
package-lock.json
package.json
packages/
scripts/
workers/
```

## Root after

```text
.dockerignore
.env.example
.gitignore
README.md
apps/
artifacts/
data/
docs/
infra/
package-lock.json
package.json
packages/
scripts/
workers/
```
