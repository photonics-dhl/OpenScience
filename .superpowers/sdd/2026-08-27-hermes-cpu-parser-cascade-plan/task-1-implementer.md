# Task 1 Implementer Report

## Status

Task 1 remains **in progress**. The immutable evaluation harness and measured current/LiteParse/Tesseract evidence are complete. Docling and PaddleOCR failed before corpus execution, so neither failure is treated as parser-quality evidence and no candidate state was promoted from `APPROVED_PILOT`.

Implementation commit: `04178b4146bd234ba1236ed8d3fdd8173c7f02de` (`feat(parser-eval): complete CPU candidate bake-off harness`).

Production anchor remained `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback anchor remained `8163f8b4218e529ee4be41bb9fc732ff6497931a`. Production Compose and release files were not changed.

## Changed files

- `apps/agent-worker/test/parser-evaluation.test.ts`
- `infra/scripts/evaluate-document-parsers.sh`
- `infra/parser-candidates/current-parser/runner.mjs`
- `infra/parser-candidates/current-parser/runner.test.mjs`
- `infra/parser-candidates/paddleocr/Dockerfile`
- `infra/parser-candidates/paddleocr/runner.py`
- `infra/parser-candidates/paddleocr/runner_test.py`
- `docs/runbooks/hermes-capability-registry.md`
- `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/task-1-implementer.md`

## TDD and local validation

RED was captured before implementation:

- Worker contract rejected the unverified PaddleOCR identity and lock.
- PaddleOCR runner tests failed because the runner API was absent.
- Current/Tesseract contract failed because the production-image runner path was absent.
- The Paddle image native-runtime contract failed after ECS exposed the missing `libgomp.so.1` dependency.

Fresh GREEN evidence after implementation:

- `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-evaluation.test.ts`: 19/19.
- `node --test infra/parser-candidates/current-parser/runner.test.mjs`: 2/2.
- `python infra/parser-candidates/paddleocr/runner_test.py`: 2/2.
- `python infra/parser-candidates/docling/runner_test.py`: 3/3.
- `node --test infra/parser-candidates/liteparse/runner.test.mjs`: 4/4.
- `npx pnpm@9.15.0 --filter @openscience/agent-worker typecheck`: passed.
- Explicit Git Bash `bash -n infra/scripts/evaluate-document-parsers.sh`: passed.
- `git diff --check`: passed before the implementation commit.

The current parser and Tesseract runner uses the active production parser image. Candidate execution retains `--network none`, a read-only root, non-root UID/GID 10001, 2 CPU, 2 GiB hard memory/swap, 64 PIDs, no capabilities, no-new-privileges, a single read-only corpus mount, disabled Docker logging, a 120-second attached execution timeout and a 64 KiB normalized output bound.

## Exact ECS commands and evidence

Every ECS command was sent through the repository wrapper using explicit Windows Git Bash:

```text
C:/Program Files/Git/bin/bash.exe infra/scripts/ssh-run.sh '<content-free remote command>'
```

Docker was never run locally. Exact source checkouts and all candidate artifacts stayed below `/opt/openscience-evals/document-parser/<git-sha>/`; no global host install, production Compose mutation or release-tree mutation occurred.

### Current production parser baseline

- Harness/source SHA: `04178b4146bd234ba1236ed8d3fdd8173c7f02de`.
- Candidate version: production release `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`.
- Image: `sha256:88da362b3ca264c6b24eb453c803d82d239942dd81d8b279862273b0b4a75606`.
- Seven PDFs: 1 succeeded, 5 needs review, 1 failed; 7/16 locators.
- P50/P95: 96/275 ms; peak RSS: 108,040,192 bytes.
- Corrupt PDF failed explicitly; the image-only scan remained review, so no false-ready result was accepted.

### LiteParse 2.14.0

- Harness/source SHA: `e50a5603421cfc4aeca0c0afb5c3b3bea02ed717`.
- Image: `sha256:352cf5d985c7fbf11e936c12e8878fc83bee6e08bb3a0fb4fe53c5e1d34c5601`; Apache-2.0; locked npm integrity `sha512-lIFBbTRs87Bpp45Lm986hUDEPndm85pT9l/BM1dtWhQs0zTLEkpHLrgbOxGG2rjBqDgJM5fdChT8LWUd4ZThWA==`.
- Seven PDFs: 5 succeeded, 1 needs review, 1 failed; 13/16 locators.
- P50/P95: 8/163 ms; peak RSS: 61,300,736 bytes.
- Native, dual-column, table, formula and references locators reproduced. The scan remained review because OCR was disabled, and the corrupt PDF failed explicitly.

Compared with the measured current parser, LiteParse improved from 7/16 to 13/16 locators, added exact dual-column/table/formula/reference geometry reproduction, stayed below 30 seconds/page and below 2 GiB RSS, and introduced no false-ready result. It remains `APPROVED_PILOT` because the required Docling comparison is unavailable.

### Tesseract production baseline

- Harness/source SHA: `04178b4146bd234ba1236ed8d3fdd8173c7f02de`.
- Same production image digest as the current parser.
- Selected scan: 0 succeeded, 1 needs review, 0 failed; 1/2 locators.
- P50/P95: 480/480 ms; peak RSS: 110,149,632 bytes.
- The package-license field remains unverified in the captured report; this is retained as an explicit residual rather than silently filled after execution.

### Docling 2.123.0

- Exact source SHA: `e50a5603421cfc4aeca0c0afb5c3b3bea02ed717`.
- Official wheel SHA-256: `95c0a4d9bc1beafc6097c8573ec3a8dc317e8bcf67e3234aa7c050b7d73fde9c`; MIT.
- The exact CPU dependency layer installed, including `torch 2.13.0+cpu` and `torchvision 0.28.0+cpu`.
- The model acquisition step failed on the locked build path with `httpx.ConnectError: [Errno 99] Cannot assign requested address`, followed by an offline-cache miss.
- No final image, model aggregate lock, preflight, corpus result, latency or RSS result exists. The failure is network/model acquisition evidence only, not Docling quality evidence. No uncontrolled retry was made.

### PaddleOCR 3.7.0

- Exact source SHA: `04178b4146bd234ba1236ed8d3fdd8173c7f02de`.
- Official wheel SHA-256: `c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338`; Apache-2.0 package; CPU PaddlePaddle 3.3.1.
- The single bounded ECS build installed its Python dependency set, then the CPU runtime import check failed because `libgomp.so.1` was absent from the slim image.
- No OCR model download, final image, model lock, preflight, scan result, latency or RSS result exists. This is a fail-closed image dependency failure, not PaddleOCR quality evidence. A second long dependency download was not attempted.
- A follow-up RED/GREEN unit contract now declares Debian `libgomp1` in the candidate Dockerfile. The corrected image has not been rebuilt on ECS, so model acquisition, lock preflight and scan evidence remain outstanding.

## Cleanup

Before cleanup, the exact evaluation roots occupied 2.6 GiB (`e50a560…`) and 307 MiB (`04178b4…`). Bounded summaries were captured, then only exact task resources were removed.

Final ECS verification:

- Evaluation root `e50a560…`: absent.
- Evaluation root `04178b4…`: absent.
- Task-labeled containers for both SHAs: 0.
- Task-labeled images for both SHAs: 0.
- Failed Paddle build container: absent.
- Production parser image: present.
- Active release: unchanged at `e2c0eaf…`.

## Retention result and residual risk

- LiteParse meets the measured current-baseline quality/resource gate but remains `APPROVED_PILOT`; the required Docling result is missing.
- Docling remains `APPROVED_PILOT`; exact blocker is model download connectivity before lock/preflight/corpus.
- PaddleOCR remains `APPROVED_PILOT`; the observed missing-`libgomp.so.1` defect is corrected locally, but the corrected image still lacks exact ECS build/model-lock/preflight/corpus evidence.
- Tesseract remains the production scan fallback; the selected scan reproduced text but missed the geometry locator, and its captured license field is still unverified.
- No parser candidate was retained in or routed into production. `progress.md` was deliberately not marked `Task 1: complete` because the Docling and PaddleOCR gates are incomplete.
