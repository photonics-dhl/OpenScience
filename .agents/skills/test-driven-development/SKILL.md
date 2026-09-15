---
name: test-driven-development
description: Use test-first development for substantive behavior changes and regression fixes; avoid tests for reversible low-impact edits or implementation-mirroring assertions.
---

# Test-Driven Development

For behavior that can regress, define the observable contract before implementation. For a real defect, reproduce the original failure in a focused test when feasible. Choose an assertion that a plausible production defect would break.

1. Write the smallest behavioral test and run it against the unfixed or missing behavior.
2. Confirm failure is for the intended reason, not broken setup, imports or a typo.
3. Implement the minimal fix and confirm the test passes.
4. Refactor if useful, then run affected checks. Complete required broader gates at the applicable milestone.

Use existing tests when they already expose the defect. Prefer real production behavior; mocks belong at necessary external boundaries. Do not assert only that a mock returned its configured result or duplicate the algorithm in the expectation. Read [writing-good-tests.md](writing-good-tests.md) when designing mocks or encountering weak tests.

Do not add tests for prose, generated output or reversible low-impact edits that are better checked directly. State the suitable validation instead. If automation cannot reproduce a material bug, record a concrete manual reproduction and the coverage limitation.

If implementation already exists, preserve it: verify the regression test against the prior behavior in an isolated copy or reversible patch, protecting concurrent edits. Do not delete code to recreate a test-first sequence. Never claim red-green verification without observing both outcomes.

Use the repository package manager and targeted test command; reuse valid evidence on unchanged code.
