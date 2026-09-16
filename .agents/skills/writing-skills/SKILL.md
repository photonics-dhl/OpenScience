---
name: writing-skills
description: Create, refine or validate skill guidance with scoped triggers and realistic behavioral checks; retain unique supporting capabilities.
---

# Writing Skills

Prefer the available official skill-creator guidance for Codex packaging and validation. Keep the name and description discoverable and specific; describe the capability and actual triggering context, not every adjacent keyword.

Read existing instructions, references and callers before editing. Back up originals for substantial rewrites. Preserve unique tools, scripts, metadata and useful references; duplicate removal requires the user's applicable backup/equivalence policy and authorization.

Put essential constraints and decision criteria in SKILL.md. Link specialized detail and read it only when needed. Avoid generic tutorials, repeated rules, forced skill chains, fixed model counts and approvals that repeat existing authorization.

Choose guidance according to the observed failure:
- A wrong output shape needs a positive output contract.
- Missing information needs a required field.
- Conditional behavior needs an observable condition.
- A real safety boundary needs an explicit prohibition and reason.

Validate frontmatter, reference targets and any changed executable helper. Exercise realistic activation, non-activation and edge scenarios proportional to the change. A behavioral review is not evidence of an executed agent experiment. For complex or risky behavior, use independent forward tests when authorized, supplying raw scenarios without the intended answer. Reuse existing demonstrated failures; do not manufacture a failure before every edit or delete a skill to recreate TDD.

Read [testing-skills-with-subagents.md](testing-skills-with-subagents.md) for optional experimental techniques, [persuasion-principles.md](persuasion-principles.md) for persuasion research, and [anthropic-best-practices.md](anthropic-best-practices.md) for provider-specific comparison. These references do not require fixed repetitions, delegation or stronger rules than the task warrants. For Graphviz diagrams, [graphviz-conventions.dot](graphviz-conventions.dot) and `render-graphs.js` remain available.

Report actual checks and limitations. Commit, publish, install or remove only within explicit authorization; editing a skill does not authorize distribution.
