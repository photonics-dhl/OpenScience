---
name: finishing-a-development-branch
description: Integrate a completed development branch or prepare its handoff, with verification and workspace ownership checks.
---

# Finishing a Development Branch

Review the final diff and acceptance evidence. Required checks must cover the tree being integrated; reuse valid results for unchanged relevant code and environment. Resolve material failures before claiming readiness. An unrelated environment blocker must be reported accurately.

Record repository root, branch, HEAD, git directory, common directory and worktree provenance before changing directories. Determine the base from explicit instructions, upstream and fork history; clarify only if material ambiguity remains.

Follow the integration choice already authorized. If none exists, preserve the branch and worktree and report the available next action; ask only when an integration decision is needed. Do not force an identical menu on every task.

- Local merge: verify target and source state, preserve unrelated changes, merge and verify the merged result's affected checks and required gates. A failed merge or test leaves recoverable state for investigation.
- PR: verify base, push the intended branch and create the PR with the project's template. Detached HEAD needs an explicit branch ref. Keep the worktree for feedback.
- Handoff: report branch, HEAD, path, evidence and pending work.

A rejected push requires inspection, not an automatic force push. Force push, destructive discard and deletion need explicit applicable authorization; an earlier specific authorization need not be requested again.

Cleanup is separate from merging. Only remove a worktree when authorized, ownership is verified and all wanted changes are preserved. A directory named `.worktrees` does not prove ownership. Preserve host-managed and other agents' worktrees, including detached ones. Run removal outside the target, verify the absolute target path, and avoid forced removal of dirty state. Do not delete branches or files merely because tests passed.
