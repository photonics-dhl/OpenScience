## Subagent dispatch requires multi-agent support

Use agent tools only when available in the active tool schema and delegation is authorized. If setup is explicitly requested, verify the current local Codex configuration and documentation; this historical example is not a command to edit configuration:

```toml
[features]
multi_agent = true
```

Tool names and lifecycle controls vary by runtime. Reuse an implementer with relevant context for fixes; use the active follow-up or messaging capability when present. Release agents only through available lifecycle controls when their work is finished. If delegation or follow-up is unavailable, continue locally or pass a bounded brief and findings to an available worker; do not invent tools or enable features implicitly.

## Environment Detection

Skills that create worktrees or finish branches should detect their
environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → inspect `git worktree list --porcelain` and
  `git rev-parse --show-superproject-working-tree` before concluding linked worktree.
- `BRANCH` empty → detached HEAD; this alone does not establish a sandbox restriction.

Use the current `using-git-worktrees` and `finishing-a-development-branch`
entrypoints for isolation and ownership checks. Adapt shell syntax to the active runtime.

## Codex App Finishing

When a branch/push operation is actually blocked, preserve the work and
report the observed restriction. Commit only when already authorized.
Check available App controls before suggesting a UI path; historical labels include:

- **"Create branch"** — names the branch, then commit/push/PR via App UI
- **"Hand off to local"** — transfers work to the user's local checkout

Continue authorized verification and prepare a reviewable diff, branch name
or PR description. Do not stage unrelated work or infer commit/push permission
from a detached HEAD or from the existence of App controls.
