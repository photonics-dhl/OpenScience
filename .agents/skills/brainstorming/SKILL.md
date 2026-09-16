---
name: brainstorming
description: Clarify a new feature or design when requirements or materially different approaches remain unresolved; skip for approved specs and clear mechanical fixes.
---

# Brainstorming

Read current project context and relevant baseline requirements. Identify the actual missing decision: intended user outcome, constraints, scope, or acceptance criteria. Reuse answers and authorization already given.

For material uncertainty, ask the smallest useful question, compare viable approaches and recommend one with concrete tradeoffs. Do independent reversible work while an answer is pending. Do not invent alternatives for an unambiguous request or require approval per design section.

Present a coherent design proportional to the change. Obtain a decision only for unresolved material product or architecture choices; existing approved requirements authorize execution without another design ceremony.

For substantial work, update the existing indexed design or use `docs/specs/YYYY-MM-DD-<topic>-design.md`; plans belong in `docs/plans/` and decisions in `docs/decisions/`. Check contradictions, missing acceptance criteria and scope before implementation. Do not commit unless authorized. A small clear change needs no standalone design document.

Visual companion: use when a mockup or spatial comparison would clarify a decision. The optional local browser companion has its own server workflow; read [visual-companion.md](visual-companion.md) before using it and respect its opt-in and runtime safety rules. Ordinary text questions need no browser.
