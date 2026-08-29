# Task 5 Implementer Report

## Status and version tuple

Task 5 code is complete and independently reviewed at
`622cc246029b81f1cf7f26fbf67d3b370bb97c42` on
`codex/hermes-wanko-live2d`. ECS runtime acceptance remains **pending** because
the single final image build did not finish inside the bounded window.

Production was not changed: application/release remains
`e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback remains
`8163f8b4218e529ee4be41bb9fc732ff6497931a`. No Docker command ran locally and
no `.env` content was read or printed.

## Delivered behavior

- Versioned page-quality routing selects native parsing at confidence `>=0.92`,
  local OCR below `0.92` or without usable Unicode, and LLM review below `0.70`
  after OCR or for formula, complex-table and layout-failure signals.
- Only selected PDF pages are rendered. The concrete Tesseract
  `eng+chi_sim` adapter validates PNG magic, dimensions, decoded pixels,
  encoded bytes and content hashes, then converts TSV word boxes from raster
  top-left coordinates to PDF bottom-left coordinates.
- Untrusted raster/TSV output has per-page and stage-wide byte, pixel, block and
  text budgets. OCR is serialized, deterministic page order is preserved, and
  malformed or over-budget pages fail closed as partial results.
- Rendering and Tesseract execute through shell-free bounded child processes.
  The default adapter owns its timeout, sends `SIGKILL`, and settles only after
  child `close`, preventing later pages from overlapping orphaned work.
- Production Compose locks the parser sidecar at 2 CPU while retaining no
  network, non-root, read-only, 512 MiB, 64 PID, cap-drop and
  no-new-privileges isolation.

PaddleOCR was not promoted or added to the production path.

## TDD and independent review

RED tests covered absent routing/OCR modules, selected-page rendering, raster
integrity, coordinate conversion, malformed boxes, page and aggregate limits,
serialized recognition, deterministic partial output, timeout cleanup and the
2-CPU Compose contract. Review then exposed stage-wide budget gaps, concurrent
OCR, a render teardown race, floating edge alignment and a mutation-insensitive
aggregate-byte test. Each was reproduced before its fix.

Final independent review at `622cc24` reported no Critical, Important or Minor
findings and **Ready: Yes**. Its fresh validation passed focused worker `75/75`,
agent-worker typecheck, deployment `19/19` and cumulative diff checks.

## Fresh local validation

- Full `@openscience/agent-worker`: final fresh `254/254` passed; independent
  focused review set: `75/75` passed.
- OCR focused suite: `18/18` passed.
- Agent-worker build and typecheck: passed.
- Deployment contract: `19/19` passed.
- Targeted ESLint and `git diff --check`: passed.

## ECS gate and cleanup

Exact source `622cc246029b81f1cf7f26fbf67d3b370bb97c42` was materialized under
its immutable evaluation root. Frozen install, Prisma generation and the full
monorepo build passed, including the production Web build and agent-worker.

The one final parser-image build remained active past the bounded cutoff. It
was terminated by exact PID, any candidate container/image was removed, and a
fresh remote check returned `FINAL_ECS_ATTEMPT_CLEAN`. No packaged-image OCR
canary, peak-resource result or capped-load worker-responsiveness result exists;
none is inferred from the successful source build.

Next action: repeat one exact-`622cc24` remote image/runtime gate, then promote
Task 5 from code-complete/pending to accepted only if the real packaged
`pdf-parse` + Tesseract scan canary, 2-CPU inspect and production-worker
responsiveness all pass.
