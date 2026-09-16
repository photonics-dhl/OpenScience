---
name: subagent-driven-development
description: Execute an implementation plan with bounded independent agents when delegation is authorized and improves execution or independent review.
---

# Subagent-Driven Development

Delegate substantial independent work when it saves context or enables necessary independent judgment. Keep small or tightly coupled tasks local. Use the minimum useful agents, reuse an agent with relevant context, and preserve the actual client model settings. Use available High review for architecture, security, concurrency, migration, irreversible work or unresolved material ambiguity.

Read the approved plan once and resolve actual contradictions using existing requirements and user decisions. Continue authorized work without between-task approval prompts. Isolate feature work where needed.

For work spanning context boundaries, keep progress in the existing project handoff/plan. Record task identity, verified changes, acceptance evidence and pending decisions; after compaction verify those records against Git before redispatching. A new parallel ledger is unnecessary when an existing record serves this purpose.

Each assignment supplies:
- Bounded responsibility and owned files; state that others share the codebase and their changes must be preserved.
- Task requirements or a precise brief reference, relevant interfaces and exact constraints.
- Acceptance criteria and required evidence, plus a concise report contract.

Parallel implementation requires disjoint ownership and compatible interfaces. Serialize shared-state changes and dependent tasks. Do not delegate a task while duplicating it locally.

Inspect worker changes and evidence. A success message alone is insufficient. Combine spec and quality review; independent High review is required for security, architecture, concurrency, migrations and irreversible operations, and retain project-required pre-merge review. Routine small tasks may use focused local review. Batch related findings instead of dispatching one agent per finding.

For a finding, verify the underlying behavior, fix material defects, and rerun affected checks. Re-review changed areas and newly exposed risks. Resolve false positives with evidence immediately; do not wait for a fixed number of rounds. If attempts repeat without new evidence, change the hypothesis, obtain missing context or escalate. Never park a real blocking defect as complete.

Keep durable decisions and preserve scratch/worktree files unless deletion is authorized.

Optional helpers for large plans: `scripts/sdd-workspace` creates per-plan scratch; `scripts/task-brief` extracts a task; `scripts/review-package` captures a committed range. Inspect helper requirements before running them. Use the actual pre-task base, not `HEAD~1`; separately include uncommitted changes. References: [implementer](implementer-prompt.md), [task review](task-reviewer-prompt.md), [scoped re-review](re-review-prompt.md). Templates support this conditional workflow; their historical role/model assumptions do not override current authorization, model policy or review scope. Their commit and full-suite examples are conditional on authorization and required gates; reuse valid unchanged evidence.
