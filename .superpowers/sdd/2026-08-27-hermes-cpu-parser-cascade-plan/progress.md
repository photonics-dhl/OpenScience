# SDD ledger — plan: docs/plans/2026-08-27-hermes-cpu-parser-cascade-plan.md

Planning base: `e50a560`
Operational production baseline: application/release `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback `8163f8b4218e529ee4be41bb9fc732ff6497931a`.

Task 1: in progress (implementation/spec review clean at `5bcef6f`; external evidence only). Current/Tesseract/LiteParse ECS evidence, isolation, cleanup and registry are complete. Docling lacks final model/image/corpus evidence; corrected PaddleOCR lacks completed image/model/preflight/scan evidence. Neither candidate is promoted.
Task 2: complete. V2 protocol (including canonical response-envelope closure), isolated transport, same-release V1 transition, concrete parser-service composition and production-image module packaging passed all local gates and independent review; ECS image start remains final-acceptance evidence.
Task 3: pending.
Task 4: pending.
Task 5: pending.
Task 6: pending.
Task 7: pending.
Task 8: pending.

Preflight resolution: the plan's embedded rollback `f965966...` is stale. All production operations use the CURRENT tuple above and must refresh it from ECS immediately before deployment.
