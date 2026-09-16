---
name: requesting-code-review
description: Prepare focused review for substantial changes or merge readiness; use independent High review for architecture, security, concurrency, migrations and irreversible work.
---

# Requesting Code Review

Review the changed behavior against requirements and likely failure modes. Small routine diffs can be reviewed locally; substantial independent review should use a bounded reviewer. Use High independent review for architecture, security, concurrency, database migration, irreversible operations and unresolved material ambiguity. Preserve project-required merge review.

Choose the actual task base or merge-base and current head, plus staged and unstaged changes. Do not assume `HEAD~1` covers a multi-commit task.

Supply the reviewer requirements, exact diff scope, relevant interfaces and validation evidence. Avoid session history, duplicate reports and instructions that pre-judge findings. The [code-reviewer.md](code-reviewer.md) template is available when helpful; adapt its role and report format to current tools and policy.

One review can cover spec compliance and code quality. Reuse verified results on unchanged code; rerun when evidence is missing, stale or relevant risk remains. Report actionable findings with location, trigger, impact and severity.

Check feedback against the code. Fix real Critical/Important defects before dependent work or merge; explain rejected findings with evidence and track deferred minor work. Re-review the fix and affected boundaries rather than restarting whole-branch review without cause. Repeated disagreement warrants clarification or stronger judgment, not a predetermined five-round loop.
