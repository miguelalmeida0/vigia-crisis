# Delivery / Git / Release Guide

Use this guide for branch integration, handoffs, deployment claims, and release-oriented work.

## Git hygiene
- Inspect `git status`, current branch, and recent commits before editing.
- Preserve unrelated user work. Do not `reset --hard`, discard local changes, or rewrite shared history unless explicitly authorized.
- Keep commits coherent and scoped. Do not mix unrelated cleanup into a functional change.
- When concurrent work is active, isolate broad refactors on a separate branch rather than disrupting the working branch.

## Handoffs
Report:
- branch and commit hash
- user-visible behavior changed
- important files changed
- validation actually run and result
- unresolved risks/blockers
- any exact next action required from the user

Do not claim a commit was pushed unless the remote was actually updated.

## Deployment and production claims
- A successful build is not a successful deployment.
- A successful deployment is not a healthy application.
- Verify the target URL/health endpoint and relevant runtime behavior before claiming LIVE/READY.
- Inspect runtime logs when a health check fails or a service restarts.
- Do not expose or copy secret values into chat, logs, commits, or documentation.
- Never introduce a paid resource, usage-based billing exposure, or missing hard cost control without explicit user approval.
- Before adopting infrastructure, surface free-tier expiry/pause behavior, storage/usage limits, overage behavior, and data-retention risk.

For Render/Neon/runtime changes use `.agents/skills/deployment-change/SKILL.md`.
