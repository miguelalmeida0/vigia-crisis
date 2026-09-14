# 06 — Installation and Run Commands

## Install this package into the repository

```bash
cd "/Users/malmeida/Documents/ChatGPT/VIGIA Integration"

mkdir -p docs/handoffs

rm -rf "/tmp/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03"

unzip -q \
  "$HOME/Downloads/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03.zip" \
  -d /tmp

cp -R \
  "/tmp/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03" \
  "docs/handoffs/"

ls -la \
  "docs/handoffs/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03"
```

## Preserve a pre-release snapshot

```bash
cd "/Users/malmeida/Documents/ChatGPT/VIGIA Integration"

STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p ".artifacts/pre-operational-truth-recovery/$STAMP"

git status --short > \
  ".artifacts/pre-operational-truth-recovery/$STAMP/git-status.txt"

git diff > \
  ".artifacts/pre-operational-truth-recovery/$STAMP/working-tree.patch"

git diff --cached > \
  ".artifacts/pre-operational-truth-recovery/$STAMP/staged.patch"

cp -f data/validation/release/current-release-manifest.json \
  ".artifacts/pre-operational-truth-recovery/$STAMP/" \
  2>/dev/null || true

echo "$STAMP"
```

## Agent entry point

Tell the agent to read:

```text
docs/handoffs/VIGIA_CRITICAL_OPERATIONAL_RECOVERY_2026-09-03/01_AGENT_PROMPT.txt
```

and execute it in full.

## Manual verification after the agent returns

```bash
cd "/Users/malmeida/Documents/ChatGPT/VIGIA Integration"

open -a Docker
until docker info >/dev/null 2>&1; do sleep 2; done

npm run local:down
npm run local:up
npm run local:status
npm run operator:open
```

Do not manually create runtime pointer files and do not reuse an old browser tab.
