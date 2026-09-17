#!/bin/sh
set -eu

PHASE_A_ROOT='/Users/malmeida/Documents/ChatGPT/VIGIA Integration'
PHASE_A_BRANCH='integration/vigia-world-class-convergence'
PHASE_A_HEAD='950910aa46772a6514da8219b7f7bdfe63bca506'
PHASE_A_MERGE_HEAD='84bd727b88d3d3b218d78117248d8fc5c170164d'
PHASE_A_MANIFEST="$PHASE_A_ROOT/docs/internal/staging/SAFE_TO_STAGE_INTEGRATION_PHASE_A.txt"

cd "$PHASE_A_ROOT"
test "$(pwd -P)" = "$PHASE_A_ROOT"
test "$(git branch --show-current)" = "$PHASE_A_BRANCH"
test "$(git rev-parse HEAD)" = "$PHASE_A_HEAD"
test "$(git rev-parse 'MERGE_HEAD^{commit}')" = "$PHASE_A_MERGE_HEAD"

while IFS= read -r PHASE_A_PATH; do
  case "$PHASE_A_PATH" in
    ''|'#'*) continue ;;
    /*|../*|*/../*|data/runtime/*|.tmp/*|node_modules/*|apps/mission-dark/*) echo "unsafe_path:$PHASE_A_PATH" >&2; exit 1 ;;
  esac
  git add -- "$PHASE_A_PATH"
done < "$PHASE_A_MANIFEST"

git diff --cached --check
git status --short --branch
printf '%s\n' 'Phase A paths are staged and checked. Review git diff --cached; this command intentionally does not commit.'
