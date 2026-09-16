---
name: writing-plans
description: Create an actionable plan for substantial multi-step work from understood requirements; avoid standalone plans for clear small edits.
---

# Writing Plans

Use the approved requirements and current repository evidence. Reuse an existing indexed plan rather than duplicate it. Save new plans in `docs/plans/YYYY-MM-DD-<topic>-plan.md`; designs use `docs/specs/` and decisions `docs/decisions/`.

Include the goal, constraints, affected architecture, dependencies and acceptance criteria. Preserve exact required values once in global constraints; reference rather than repeat long specifications.

Divide work at meaningful independently verifiable boundaries. For each task give:
- Owned files and responsibility, including relevant existing patterns.
- Inputs/outputs and exact cross-task interface names where needed.
- Intended behavior, errors and meaningful test/reproduction cases.
- Commands and expected evidence for affected checks.
- Dependencies, rollout or rollback needs proportional to risk.

Do not transcribe complete implementation code or force 2–5 minute steps, tests for every function, fresh reviewers per task or commits after each action. Code examples are useful for a genuinely non-obvious interface, not as mandatory padding.

Check coverage, contradictory requirements, unresolved material decisions and type/interface consistency. Resolve routine choices from project context. Clarify only material uncertainty that prevents safe progress.

If implementation is already authorized, execute the plan using local work or bounded delegation as appropriate; do not ask the user to approve the same scope or choose an agent mode again. A request only for planning ends with the reviewable plan. Commit, merge and deployment retain their own applicable authorization boundaries.
