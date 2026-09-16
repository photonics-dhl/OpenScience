---
name: using-git-worktrees
description: Set up or reuse an isolated Git workspace when feature work or concurrent edits need isolation; avoid redundant worktrees and unnecessary setup.
---

# Using Git Worktrees

Inspect status, branch, HEAD and `git worktree list --porcelain`. Compare resolved git/common directories and check `git rev-parse --show-superproject-working-tree`: a submodule must not be mistaken for an already isolated worktree.

Reuse an existing suitable linked worktree, including a host-managed detached HEAD. Do not create nested isolation. Honor the user's workspace preference. For work needing isolation, create it within the authorized task without a repeated permission prompt; simple in-place edits need no extra worktree.

Prefer an available native workspace tool that manages lifecycle. Otherwise use `git worktree add` with a verified base, unused absolute target and `codex/` branch name. Explicit placement wins, followed by an existing suitable directory. Verify the actual selected project-local parent with `git check-ignore`; one ignored directory does not prove another is ignored. Add an appropriate ignore entry if needed within scope, without an unsolicited commit, or use an external location.

Protect dirty/untracked work; do not reset, clean, stash or copy it into another tree automatically. If isolation creation fails, inspect the reason. Continue in place only if this preserves the required isolation and user work; otherwise report the concrete blocker.

Read manifests and lockfiles before setup. Use the project package manager; XGS uses `npx pnpm@9.15.0`. Install existing locked dependencies only when missing and necessary, with frozen-lockfile behavior where supported. Do not introduce dependencies, global binaries or another lockfile implicitly.

Choose a baseline check proportional to the affected behavior and risk; reuse valid evidence for the same code and environment. Record pre-existing failures and investigate relevant blockers without masking them. Full-suite baseline runs are warranted only by risk or explicit project gates.

Report path, branch/HEAD and actual validation. Cleanup requires verified ownership and applicable deletion authorization; preserve external workspaces.
