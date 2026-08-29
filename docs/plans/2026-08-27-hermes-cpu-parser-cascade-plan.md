# Hermes CPU Parser Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status (2026-08-29):** Taskmaster Task 4 and production deployment are complete at `c5817121bddbd065c5ecb38811da8e707e6e5d17`; rollback is `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`. Only the docs-only closeout commit/CI remains in this session.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 4 with a CPU-only, provider-neutral document cascade that produces strict `DocumentSourceMap` results, selects local OCR by measured need, and can offer only the smallest unresolved pages to the already-controlled AI Gateway OCR route.

**Architecture:** Preserve `packages/domain` as the only owner of serialized source-map contracts and keep every binary/parser runtime inside ECS containers. Upgrade the existing worker↔sidecar shared-volume protocol from plain text to a bounded versioned stage-result envelope, normalize every parser's private output inside `apps/agent-worker`, and merge stages through one deterministic orchestrator. Docling versus LiteParse and Tesseract versus PaddleOCR are retention decisions made by an isolated ECS corpus bake-off; a candidate that fails the gate is not installed in the production Compose stack.

**Tech Stack:** TypeScript, Vitest, Node 22, Docker Compose on ECS only, current `pdf-parse`/`mammoth`/Tesseract baseline, candidate CPU images for Docling/LiteParse/GROBID/PaddleOCR, `@openscience/domain`, `@openscience/ai-gateway`.

## Global Constraints

- Production host is CPU-only. Do not introduce a GPU image, CUDA/ROCm dependency, or local image/video model.
- Never run Docker locally. Candidate image build, container benchmark, final image build and runtime acceptance run only on ECS through `C:\Program Files\Git\bin\bash.exe` and canonical project scripts.
- No parser, model, package, binary or model weight is installed globally on the ECS host. Candidate artifacts live only in digest-pinned Docker images or a dedicated versioned read-only model volume.
- Do not read or print `.env`; configuration verification is presence-only. MiniMax Vision remains disabled and no paid call is part of Task 4 acceptance.
- Every parser must normalize to `DocumentSourceMap`; API, Web, Domain and extraction consumers must never depend on Docling, LiteParse, GROBID, Tesseract or PaddleOCR private output.
- LLM OCR never overwrites a source block. It remains a candidate layer carrying the original page coordinates and `llm_ocr_candidate` provenance.
- Historical planning rollback `f9659668b237b70b4c018b866e20498689d327c2` was superseded; the CURRENT deployed/rollback tuple is `c581712...` / `e2c0eaf...` and must still be refreshed from ECS before future production work.
- No database migration, public API or UI change is required for Task 4.
- Candidate retention requires exact version/digest/license, corpus metrics, resource boundary, kill switch and rollback evidence in `docs/runbooks/hermes-capability-registry.md`.

---

### Task 1: Freeze the ECS candidate bake-off and baseline

**Files:**
- Create: `infra/parser-candidates/docling/Dockerfile`
- Create: `infra/parser-candidates/liteparse/Dockerfile`
- Create: `infra/parser-candidates/paddleocr/Dockerfile`
- Create: `infra/scripts/evaluate-document-parsers.sh`
- Create: `apps/agent-worker/src/parser-evaluation.ts`
- Test: `apps/agent-worker/test/parser-evaluation.test.ts`
- Modify: `apps/agent-worker/package.json`

**Interfaces:**
- Produces: `evaluateParserCandidate(run: CandidateRunner, corpus: CandidateCase[]): Promise<CandidateEvaluationReport>`.
- `CandidateEvaluationReport` contains only case IDs, hashes, locator outcomes, elapsed milliseconds, peak RSS bytes, exit status, parser metadata and bounded error codes; it never contains document text, absolute paths or source bytes.
- Produces ECS-only output under `/opt/openscience-evals/document-parser/<git-sha>/`; nothing is installed under `/usr`, `/usr/local`, `/opt/openscience` or the production release tree.

- [x] Write failing tests proving evaluation reports are content-free, deterministic by case ID/hash, reject unknown fields and calculate P50/P95 without silently discarding failures.
- [x] Run `npx pnpm@9.15.0 --filter @openscience/agent-worker test -- parser-evaluation.test.ts` and confirm RED because the evaluation API is absent.
- [x] Implement the minimal report builder and JSON serializer; keep Docker execution in the shell script rather than granting Docker access to the worker.
- [ ] Add candidate Dockerfiles with CPU-only entrypoints and non-root users. Initial source pins are Docling `2.123.0` wheel SHA-256 `95c0a4d9bc1beafc6097c8573ec3a8dc317e8bcf67e3234aa7c050b7d73fde9c`, `@llamaindex/liteparse@2.14.0` npm integrity `sha512-lIFBbTRs87Bpp45Lm986hUDEPndm85pT9l/BM1dtWhQs0zTLEkpHLrgbOxGG2rjBqDgJM5fdChT8LWUd4ZThWA==`, and PaddleOCR `3.7.0` wheel SHA-256 `c0f0a81ad4112727f30c6fcf986ac0ef6a120d31ee0991a01fae0357ee32d338`; the built image digest and all model hashes are recorded before execution. Disable Docling OCR during the layout comparison; disable LiteParse OCR with `--no-ocr`; the layout comparison must measure layout rather than bundling an OCR advantage.
- [ ] Implement the ECS script with explicit candidate names, CPU/RSS/time limits, `--network none`, read-only rootfs, a single read-only corpus mount and a 64 KiB attached-output stream with disabled Docker logging. The script must refuse to run outside the ECS host marker and must not mutate production Compose.
- [x] Export the schema-v2 16-case self-authored corpus to the dedicated evaluation directory. Use the same seven-PDF layout subset (corrupt/native/dual-column/table/formula/references/image-only scan) for current parser, Docling and LiteParse; use the selected scan image/pages for Tesseract and PaddleOCR. The three added PDF cases close the original 13-case matrix's lack of geometry assertions for table/formula/reference layout.
- [ ] Apply the retention gate: no false-ready; all claimed locators reproduce; no supported-case regression from baseline; at least one measurable dual-column/table/formula/scan improvement; layout P95 at or below 30 seconds/page; candidate hard RSS at or below 2 GiB. GROBID is evaluated separately with 4 GiB hard RSS because upstream full-text guidance requires that class of allocation.
- [ ] Record exact tag, image digest, license source, P50/P95, peak RSS, pass/fail and reason in the capability registry. Do not change a failed or unevaluated candidate from `APPROVED_PILOT`.
- [x] Commit the harness and immutable evaluation contract before adding a retained runtime.

### Task 2: Version the structured sidecar protocol

**Files:**
- Create: `apps/agent-worker/src/parsers/job-protocol.ts`
- Modify: `apps/agent-worker/src/parser-job-isolation.ts`
- Modify: `apps/agent-worker/src/parser-service.ts`
- Test: `apps/agent-worker/test/parser-job-isolation.test.ts`
- Test: `apps/agent-worker/test/parser-job-protocol.test.ts`

**Interfaces:**
- Produces `ParserJobRequestV2 = { schemaVersion: 2; operation: 'extract_text' | 'detect_layout' | 'render_page' | 'ocr_page' | 'extract_references'; artifactId: string; contentHash: string; mediaType: string; options: exact bounded object }`.
- Produces `ParserStageResult = { schemaVersion: 2; parser: DocumentParserMetadata; pages: StagePage[]; warnings: string[] }`, where each stage page/block has bounded page geometry, text, bbox, confidence and private-format-free block kind.
- The sidecar reopens input with `O_NOFOLLOW`, verifies regular-file status, the 50 MiB cap and SHA-256 equality before parsing. Worker adapters rebuild a `DocumentSourceMap`, execute it through `executeDocumentParser`, and reject any identity/metadata mismatch.
- V1 plain-text jobs remain accepted only during the same-release worker/parser transition and are removed before Task 4 is marked done.

- [ ] Write failing protocol tests for exact fields, version mismatch, sparse/proxy/accessor objects, page/block/string budgets, bbox bounds, confidence `[0,1]`, response byte cap and unknown private parser fields.
- [ ] Run the two focused test files and confirm RED on the missing V2 validator.
- [ ] Implement strict canonical snapshot/serialization functions without importing a provider SDK or app-private module.
- [ ] Extend shared-volume request/response handling to V2 while preserving atomic rename, `O_NOFOLLOW`, timeout, cancellation and orphan reaping behavior. Keep the current 24 MiB response ceiling even though the Domain raw-JSON ceiling is larger.
- [ ] Replace raw third-party errors with a closed `SafeParserErrorCode` enum; provider stderr, document fragments and absolute paths never cross the sidecar boundary or enter logs.
- [ ] Prove malformed or oversized sidecar output becomes a bounded `needs_review`/failed stage and cannot crash the long-lived worker.
- [ ] Run focused tests and `DOCUMENT_PARSER_CONTRACT_OK`; commit only after GREEN.

### Task 3: Add deterministic text extraction as a real DocumentParser

**Files:**
- Create: `apps/agent-worker/src/parsers/text-extractor.ts`
- Create: `apps/agent-worker/src/parsers/source-map-builders.ts`
- Create: `apps/agent-worker/src/parsers/source-map-merge.ts`
- Test: `apps/agent-worker/test/text-extractor.test.ts`
- Modify: `apps/agent-worker/src/ingestion-parser.ts`

**Interfaces:**
- Produces `createTextExtractor(adapters: TextExtractionAdapters): DocumentParser`.
- Supports Markdown/TeX with line coordinates, CSV with row/cell coordinates, XLSX with sheet/row/cell coordinates, DOCX with paragraph order, and native-text PDF with page coordinates where available.
- Every output is executed through `executeDocumentParser`; block IDs are deterministic from artifact hash, page and canonical ordinal.

- [ ] Write failing tests for Markdown/TeX lines, CSV quoted cells, XLSX sheets/cells, DOCX paragraphs, native PDF pages, malformed UTF-8/ZIP/PDF, deterministic IDs and exact transformations.
- [ ] Confirm RED because `createTextExtractor` does not exist.
- [ ] Implement source-map builders with zero provider knowledge. Use the winner retained by Task 1 only for binary layout/geometry; keep plain text formats dependency-free. Do not hand-write an unbounded XLSX ZIP/XML reader: use a project-pinned dependency with entry-count, per-entry/aggregate expansion, compression-ratio, shared-string/cell-count and XML-entity limits.
- [ ] Version non-paginated logical geometry as `openscience-virtual-page-v1`: width `1000`, line height `24`, line `n` at `y=(n-1)*24`, and page height `max(24,lineCount*24)`. This is deterministic logical geometry, not PDF pixel precision.
- [ ] Require `needs_review` for empty/control-only output and preserve the current 50 MiB input cap.
- [ ] Run focused tests, the schema-v2 16-case corpus and parser contract; commit after GREEN.

### Task 4: Normalize the retained layout parser and GROBID enrichment

**Files:**
- Create: `apps/agent-worker/src/parsers/layout-parser.ts`
- Create: `apps/agent-worker/src/parsers/grobid-parser.ts`
- Test: `apps/agent-worker/test/layout-parser.test.ts`
- Test: `apps/agent-worker/test/grobid-parser.test.ts`
- Modify: `infra/compose/docker-compose.prod.yml` only if the GROBID gate passes

**Interfaces:**
- `createLayoutParser(adapter: LayoutAdapter): DocumentParser` accepts only V2 normalized stage results.
- `enrichWithGrobid(sourceMap, result): DocumentSourceMap` may add/upgrade `heading` and `reference` blocks; it may not replace higher-confidence native text or change artifact/hash/page identity.

- [ ] Write failing layout tests for dual-column order, block-kind mapping, bbox bounds, deterministic IDs, table cells and parser/transformation provenance.
- [ ] Write failing GROBID tests for TEI namespace handling, section/reference mapping, malformed XML, timeout and conflict preservation.
- [ ] Confirm RED on missing adapters.
- [ ] Implement the retained layout adapter selected by Task 1. No unselected candidate package or image enters production manifests.
- [ ] Benchmark `grobid/grobid:0.9.1-crf` by digest on the self-authored references fixture and a bounded self-authored scholarly PDF. The current Domain contract can represent only `heading` and `reference` blocks; DOI/author metadata remains out of scope and must not be hidden in warnings or unknown fields.
- [ ] Keep GROBID disabled in the first production slice unless both the heading/reference quality gate and an internal-only topology review pass. If retained later in this task, use a dedicated internal Compose network, no published port, no Secret, non-root/read-only where the upstream image permits, hard CPU/RSS/PID limits and a kill flag. Otherwise it remains `APPROVED_PILOT` and the fixed stage returns the non-enriched layout map.
- [ ] Run focused tests and commit the normalized adapters/retention decision.

### Task 5: Add page selection and local OCR with coordinates

**Files:**
- Create: `apps/agent-worker/src/parsers/page-quality.ts`
- Create: `apps/agent-worker/src/parsers/ocr-parser.ts`
- Test: `apps/agent-worker/test/page-quality.test.ts`
- Test: `apps/agent-worker/test/ocr-parser.test.ts`
- Modify: `apps/agent-worker/Dockerfile.parser`
- Modify: `apps/agent-worker/parser-image/package.json`
- Modify: `apps/agent-worker/parser-image/package-lock.json`
- Modify: `infra/compose/docker-compose.prod.yml`

**Interfaces:**
- Produces `assessPageQuality(page): { confidence: number; reasons: OcrSelectionReason[]; localOcrRequired: boolean; llmCandidateReason?: OcrSelectionReason }`.
- Produces `ocrSelectedPages(input, pages, adapter): Promise<ParserStageResult>` using TSV/JSON word boxes and confidences, not plain OCR text.

- [ ] Write failing tests for empty scan, low text density, valid native text, formula/table/layout signals, confidence aggregation and selection reason priority.
- [ ] Write failing OCR tests for Tesseract TSV bbox normalization, negative/overflow bbox rejection, mixed Chinese/English, timeout and partial-page failure.
- [ ] Confirm RED before implementation.
- [ ] Implement deterministic quality scoring with exported versioned thresholds: native page accepted at `>=0.92`; local OCR selected below `0.92` or when no Unicode letter/number exists; LLM candidate considered only below `0.70` after local OCR or for `formula`, `complex_table`, or `layout_failure`.
- [ ] Add only the retained OCR backend. Tesseract remains the production default unless PaddleOCR beats it on scan locator/text quality without exceeding the 2 GiB/P95 gate.
- [ ] Use the pinned `pdf-parse@2.4.5` screenshot API to render selected PDF pages only; do not rasterize the whole document. Cap dimensions/pixels/bytes to the AI Gateway OCR limits and verify magic, encoded dimensions and content hash before the Worker accepts each raster.
- [ ] Add an explicit CPU hard limit to the parser service and prove the worker remains responsive during a capped parser job.
- [ ] Run focused tests and the scan corpus; commit after GREEN.

### Task 6: Implement the fixed cascade and candidate-only LLM fallback

**Files:**
- Create: `apps/agent-worker/src/parsers/llm-ocr-fallback.ts`
- Create: `apps/agent-worker/src/parsers/cascade-orchestrator.ts`
- Test: `apps/agent-worker/test/llm-ocr-fallback.test.ts`
- Test: `apps/agent-worker/test/cascade-orchestrator.test.ts`

**Interfaces:**
- `runParserCascade(input, context): Promise<ExtractionResult<DocumentSourceMap>>` executes `extract_text → detect_layout → GROBID enrichment → local OCR → optional AI Gateway OCR candidate → merge`.
- `CascadeContext` injects stage adapters, `AiGateway`, trusted authorization context, external-processing eligibility and runtime feature flags; it contains no API key.

- [ ] Write failing orchestration tests proving exact stage order, stage skipping, no replay of successful pages, partial failure handling and original-block preservation.
- [ ] Write failing fallback tests proving at most four unresolved pages, valid raster dimensions, strict trusted authorization, disabled-route behavior and `llm_ocr_candidate` transformation without overwrite.
- [ ] Confirm RED before implementation.
- [ ] Implement deterministic block merge: preserve the higher-confidence original block; attach every participating processor to transformation history; append candidate blocks with distinct IDs; never silently drop conflicts. The top-level parser metadata is always the orchestrator metadata required by the strict base-parser contract.
- [ ] Return `needs_review` when a critical locator cannot round-trip, all local stages fail, or LLM OCR is disabled/unavailable and unresolved pages remain. Provider outage must not turn deterministic extraction into a failed job.
- [ ] Run focused tests plus AI Gateway OCR contract; commit after GREEN. No paid provider call is permitted.

### Task 7: Integrate without changing public API or stored research data

**Files:**
- Modify: `apps/agent-worker/src/extractor.ts`
- Modify: `apps/agent-worker/src/index.ts`
- Modify: `apps/agent-worker/src/parser-self-test.ts`
- Test: `apps/agent-worker/test/extractor.test.ts`
- Test: `apps/agent-worker/test/ingestion-parser.test.ts`
- Test: `apps/agent-worker/test/research-intelligence-corpus.test.ts`

**Interfaces:**
- Existing ingestion text remains available to the SDF extraction prompt, but it is derived from the canonical source map rather than bypassing it.
- Parser/OCR execution stays asynchronous in the worker queue. No synchronous HTTP upload handler waits for the cascade.

- [ ] Write failing compatibility tests for existing Markdown/PDF/DOCX extraction and the new scan/cascade status transitions.
- [ ] Confirm RED on the missing cascade composition.
- [ ] Wire the cascade at the worker composition root so real `sdf.extract` binary ingestion calls one `runParserCascade(ParserInput)` and derives compatibility text from the canonical source map. Inject the parser job adapter and AI Gateway; keep provider configuration out of parser modules and keep the legacy `ParsedIngestion{text}` path only for explicit text-format compatibility.
- [ ] Build trusted external-processing eligibility from server-side AgentTask/workspace/actor facts. Never replace the current deny-default policy with `async () => true`; production Vision remains disabled regardless.
- [ ] Add startup/runtime self-tests for V2 IPC, native PDF/DOCX, scan OCR and candidate-only fallback-disabled behavior.
- [ ] Run Agent Worker, Domain and AI Gateway focused suites plus typecheck; commit after GREEN.

### Task 8: ECS acceptance, deployment and memory closeout

**Files:**
- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: `.taskmaster/tasks/tasks.json`

- [x] Run quiet local non-Docker gates: focused tests, build, typecheck, lint, dependency/duplicate checks as applicable, `git diff --check`, docs-sync and Markdown lint.
- [x] Obtain independent architecture/security review and resolve every material finding before deployment.
- [x] Push the exact implementation SHA and require exact-SHA CI success.
- [x] Run ECS preflight/backup; build all workspace packages and candidate/production images only on ECS; verify current core migration `29/29` and search migration `2/2` without adding a migration.
- [x] Run the full schema-v2 16-case corpus through the actual production sidecars. Record locator reproduction, per-stage confidence, false-ready count, P50/P95, peak CPU/RSS and failure status; no mocked adapter counts as this gate.
- [x] Deploy through the canonical immutable release script. Verify exact release marker, absent failure marker, rollback tree, SHA-tagged healthy worker/parser images, container user/rootfs/network/Secret/CPU/RSS/PID/volume limits, public `/` 200, auth/admin 401 and exact `/__release`.
- [x] Keep MiniMax Vision disabled. A later credential rotation plus explicitly approved paid canary is required before claiming real LLM OCR quality.
- [x] Update the capability registry with retained and rejected candidate evidence, mark Taskmaster Task 4 done only after production acceptance, and refresh the CURRENT version tuple and next ready task.
- [ ] Run docs-sync 8/8, Markdown lint, credential-pattern scan and `git diff --check`; commit and push the docs-only closeout, then require exact docs-HEAD CI.

## Plan self-review

- Spec coverage: §7.1 is consumed unchanged; §7.2 stages 1–7 map to Tasks 3–7; CPU/isolation and retention gates map to Tasks 1, 4, 5 and 8; AI/provider boundary maps to Task 6.
- Scope: no database, API, UI, retrieval, temporary-download lifecycle or rich-media work is included. Those remain later Taskmaster items.
- Type consistency: all runtime parsers return the existing `ExtractionResult<DocumentSourceMap>` through `DocumentParser`; only internal V2 stage results are new and provider-neutral.
- Rollback: failed candidates never remain active; retained services have route/feature kill switches. The completed transaction preserves `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f` as rollback for production `c581712...`.
- Known acceptance boundary: Task 4 can prove deterministic/layout/local OCR quality and safe LLM routing, but cannot claim MiniMax Vision quality without credential rotation and an approved paid canary.
