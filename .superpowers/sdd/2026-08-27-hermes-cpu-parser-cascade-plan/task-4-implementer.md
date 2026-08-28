# Task 4 Implementer Report

## Status and version tuple

Task 4 is **complete** at code commit
`85ba051f8b080161c1d9766ccd761782181e2d3b` on
`codex/hermes-wanko-live2d`. Production was not changed: application/release
remains `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`; rollback remains
`8163f8b4218e529ee4be41bb9fc732ff6497931a`.

No Docker command ran locally, no host-global package was installed, and no
`.env` content was read or printed. Production Compose is unchanged.

## Delivered behavior

- `createLayoutParser(adapter)` accepts only canonical V2
  `ParserStageResult` output and rejects schema or parser-identity mismatch.
  It normalizes spanning blocks and left-to-right columns, maps all Domain
  block kinds, preserves table-cell text and bounded geometry, assigns stable
  post-order IDs, and records provider `detect_layout` plus provider-neutral
  `normalize` provenance.
- No concrete layout candidate was retained. LiteParse and Docling remain
  absent from production manifests and routes.
- `enrichWithGrobid(sourceMap, result)` is a bounded, fail-closed TEI seam. It
  resolves the exact TEI namespace, rejects DTD/entities, malformed qualified
  names, empty numeric coordinates and structural limits, and emits only
  `heading` or `reference` blocks with page-bounded coordinates.
- Enrichment preserves artifact/hash/page/top-level parser identity and every
  existing block ID/text/parser. Matching low-confidence native text may gain
  only heading/reference classification and provenance; conflicts remain
  native. New IDs are content-derived and use the same canonical dual-column
  order as the layout adapter.
- The final aggregate is reparsed through the Domain contract. Per-block text,
  transformation, total block and serialized limits therefore return the
  original layout map instead of an invalid enrichment.

DOI and author private metadata remain out of scope; no provider-private field
or warning channel was added.

## TDD and independent review

The first RED failed because both parser modules were absent. Subsequent REDs
proved structured TEI text concatenation, empty elements, wrong/undeclared
namespaces, aggregate Domain overflow, right-column insertion and empty x/y
coordinates. Each failed for the intended behavior before the minimal fix.

Independent review ended **Approve** with no remaining Critical or Important
finding. Its four Important findings (namespace URI, final Domain limits,
dual-column insertion and empty numeric fields) were all reproduced and fixed.
The remaining Minor is deliberate fail-closed tolerance for XML name case;
near-limit deeply nested TEI has no separate stress benchmark.

## ECS GROBID retention gate

Exact source `85ba051f8b080161c1d9766ccd761782181e2d3b` was materialized with the
canonical evaluation archive helper. The schema-v2 corpus export produced the
self-authored `references.pdf` and bounded `dual-column.pdf` fixtures.

The one authorized bounded attempt requested `grobid/grobid:0.9.1-crf` with a
180-second pull cutoff. Pull did not finish before the objective bound, so no
RepoDigest resolved and no container started. Consequently there is no valid
heading/reference quality, latency, peak RSS, upstream-user or restricted
rootfs result. None is inferred from the acquisition failure.

Content-free outcome:

```text
decision=APPROVED_PILOT
reason=pull_timeout_or_failure
digest=unresolved
containers=0 networks=0 eval_root_present=false new_image_present=false
compose_changed=false
```

The same remote script removed the exact evaluation root and verified zero
labeled containers/networks and no newly retained image. GROBID remains
`APPROVED_PILOT`, the enrichment route remains disabled, and the fixed stage
returns the non-enriched layout source map.

## Fresh validation

- Layout/GROBID focused suites: `20/20` passed.
- Full `@openscience/agent-worker` suite after all review fixes: `230/230`
  passed across 19 files.
- Agent-worker build and typecheck: passed.
- Targeted ESLint: passed.
- `git diff --check`: passed.
