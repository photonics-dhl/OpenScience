---
name: auto-compact
description: Preserve continuity when context nears its limit, repetitive history impairs work, or the user requests compaction. Do not trigger by time or turn count alone.
---

# Context Management

Compact at a coherent checkpoint when retained context is repetitive or no longer useful, or pressure threatens continuity. Do not interrupt productive work merely because a session is long.

Before a requested clear or necessary compaction, save incomplete state using project handoff/memory rules. Preserve:

- Objective, scope, constraints, corrections, and existing authorization.
- Changed files and state; branch/HEAD and release distinctions when relevant.
- Decisions and reasons, validation commands/results, unresolved failures.
- Pending work, active process/agent identifiers, and the next concrete action.

Replace repeated file contents and verbose logs with locations and concise evidence. Retain unique facts and unresolved requirements.

Use narrower reads and quiet outputs. Delegate only bounded independent work when authorized and useful, without duplicating investigation. Resume from the handoff instead of restarting.

Context size, billing, caching, and tool overhead vary by environment. Use measured usage when available; do not invent percentages or claim a compaction command ran without tool confirmation. Do not disable memories, history, or capabilities as default optimization.
