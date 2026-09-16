---
name: verification-before-completion
description: Match completion, fix and passing claims to current reproducible evidence before handoff, commit or PR.
---

# Verification Before Completion

Evidence precedes claims. Identify what would prove the specific claim, execute the relevant check when current evidence is absent, inspect exit status and meaningful output, then report only what the evidence establishes.

Recorded results remain valid when relevant code, dependencies, configuration and environment are unchanged. A new message or workflow step does not invalidate them. Rerun affected checks after changes or failures; broaden only for required gates or unresolved risk.

- Passing tests establish their covered behavior, not all requirements.
- Lint is not build evidence; local build is not production acceptance.
- A regression fix needs the original symptom reproduced and then resolved; claim red-green only when observed.
- An agent report needs verification against the actual diff and test evidence.
- A milestone needs its requirements and mandatory acceptance checks satisfied.

Use isolated copies or safe reversible patches to check a regression against prior behavior, protecting other agents' edits. Never delete work just to recreate a verification sequence.

Keep large logs outside the conversation; inspect failures and record command, scope, exit code and result summary. Do not conceal skips, failures or missing runtime dependencies. Say what remains unverified and its consequence instead of implying full completion.
