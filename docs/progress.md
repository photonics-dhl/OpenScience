# Progress

## 2026-09-08 — Research records and per-RO API deployed

- User-authorized merge-continuity fix2d19052b and current production integration6a1e7957 completed; final application 134ebdea796b922ac07d9f29b6148b458b5e515f uploaded and deployed. Rollback 97aa06a542febf558a47cecbf6559bd0a6c876aa; later docs HEAD is separate. No main merge or successful PR creation/CI claim.
- M1/M2 core: atomic confirmation, fixed records, source verification, version/API/export consistency, graph carry through merge/edit/delete and honest legacy/missing states. M3/M4 remain future scope.
- Independent reviews approved; exact Linux build/types/lint/release137, domain651/API165, Web564+5 and browser125 passed. Worker592 passed cumulatively after restoring real Git metadata for archive-only tests;1 worker and8 database existing skips retained. Hermes gate and parser16 passed. Full logs and initial failures remain in ignored SDD workspace.
- Exact isolated PostgreSQL merge/confirmation/rollback passed. Live private RO39b386bd-b1f8-4b72-bf41-5b7ddd516e71 → v1 0370a30d-05af-402e-954c-420e2c6e1fdb; real Hermes, duplicate confirmation,6 sources, export equality, draft isolation, private404 and machine-readable contracts passed. One test-only optional-$schema assertion corrected via read-only resume.
- Canonical deploy core37/search2, BGE/ScanSci/runtime/public checks passed; production journal clear. Original paper hash/version preserved. Post-deployment core28M/search20K backup saved without deleting old backups; no separate fresh pre-deployment DB backup claimed. Isolated dev services stopped; volumes retained.
- Current source/deployment and preserved media-workflow continuity: docs/handoff/2026-08-16-hermes-2d-pet-handoff.md. Prior detailed progress remains in Git history.
