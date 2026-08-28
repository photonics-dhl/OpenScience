# Task 3 Implementer Report

## Status and version tuple

Task 3 is **complete** at initial code commit `49cd909` and review-fix commit
`ac94ebc` on
`codex/hermes-wanko-live2d`. The implementation base was `9133635`.
Production was not changed: application/release remains
`e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback remains
`8163f8b4218e529ee4be41bb9fc732ff6497931a`.

No Docker command was run locally, and no `.env` file was read or printed.

## Delivered behavior

- Added `createTextExtractor(adapters): DocumentParser` and the canonical
  `executeDocumentParser` execution seam.
- Markdown and TeX retain exact source lines on
  `openscience-virtual-page-v1` geometry (`1000` width, `24` line height).
- CSV preserves quoted commas and embedded newlines and maps row/cell
  coordinates deterministically.
- XLSX uses the single exact dependency `yauzl@2.10.0`. Lazy ZIP processing
  enforces entry-count, per-entry expansion, aggregate expansion, compression
  ratio, encrypted-entry, shared-string, cell, XML-entity and source-map text
  budgets. DTD/entity declarations and unknown entity references fail closed.
- DOCX consumes the current provider-neutral V2 text stage and preserves
  paragraph order on virtual geometry. Native-text PDF retains supplied page,
  bbox, confidence and parser provenance.
- Final block IDs are derived only from content hash, page and canonical
  ordinal. Every block has exact `extract_text` provenance; only virtual
  geometry adds the `normalize` transformation.
- Malformed UTF-8/ZIP/PDF/CSV, unavailable adapters and empty/control-only
  output become bounded review results. Contract-size violations become
  `limit_exceeded`; provider errors and document fragments do not cross the
  boundary.

Physical-layout enrichment remains pending because Task 1 retained no layout
candidate. No LiteParse, Docling, GROBID or OCR cascade work was started.

## TDD and review record

The first RED failed because `text-extractor.ts` and `createTextExtractor` did
not exist. The initial GREEN loop exposed and fixed Markdown media-type
classification plus null-prototype V2 metadata normalization. An adversarial
RED then proved that oversized blocks escaped as `ParserContractError` and a
CSV quote trailer was accepted; both now return controlled results.

Deep review was on target. Security review found no surviving finding.
Architecture review found one Important issue: a top-level `base-parser`
import would have expanded the Task 2 sidecar image module graph. The executor
now dynamically loads the worker-only contract, and the compiled legacy
ingestion module remains independently loadable. No unresolved review finding
remains.

The final review requested three additional adversarial boundaries. TDD repros
proved that repeated rows/fields were materialized before caps, DOCX paragraph
expansion and PDF provenance growth could escape as `ParserContractError`, and
XLSX references beyond `XFD1048576` were not rejected consistently. The fix:

- scans Markdown/TeX rows and CSV rows/fields in one pass, counting empty
  fields and stopping at row, field, block, per-block and total-text budgets;
- covers exact 48 MiB newline/comma inputs without unbounded row/field arrays;
- validates the complete PDF/DOCX source map and a conservative serialized
  success envelope before returning, mapping every overflow to controlled
  `limit_exceeded`;
- parses XLSX references only within `A1:XFD1048576`, before any geometry is
  built, so columns and page coordinates remain safe finite numbers.

The first 48 MiB test exposed an O(n²) delimiter search when one newline style
was absent. The scanner was changed to a single forward pass; the same tests
then completed within the focused suite.

## Fresh validation

- Focused extractor + parser contract + schema-v2 corpus: `62/62` passed.
- Full `@openscience/agent-worker` suite: `210/210` passed across 17 files.
- Agent-worker build: passed.
- Agent-worker typecheck: passed.
- Targeted ESLint for Task 3 TypeScript: passed.
- Runtime contract self-test: `DOCUMENT_PARSER_CONTRACT_OK`.
- Compiled ingestion module graph: `INGESTION_MODULE_GRAPH_OK`.
- `git diff --check`: passed.

The 16-case schema-v2 corpus is exercised by
`research-intelligence-corpus.test.ts`; its six contract assertions and the
new 20-case extractor suite are included in the totals above.
