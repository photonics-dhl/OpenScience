# `figurePlan.reuse` — paper-original binding design

Status: proposal (not implemented). Captures the design intent for the third
remaining debt after `figurePlan` is wired into the planner (`dfbcc593`).
Implemented semantics today: `reuse` means "no scene produced"; a scene whose
only justification is the figure id may still appear if the planner decides so.
This spec describes the intended end-state where `reuse` actually points at
the source paper's original figure.

## Why

`reuse` currently collapses to "skip" in the planner (no scene). For the
audience-facing product this is wrong: a publication-grade author figure
should land in the presentation as the source image, not be replaced by a
generated scene or omitted entirely. The fix is a binding from `figurePlan`
entries to the registered paper-original image assets.

## Shape

A `reuse` figure references a paper-original image asset that already exists
in `presentation_assets` (subtype `paper_original_figure`) keyed by
`(researchObjectId, versionId, figureId)` where `figureId` matches the
figurePlan entry's `id`. The asset carries the original image bytes, the
caption verbatim, and a source provenance row pointing to the evidence
record that justified the figure.

```jsonc
// figurePlan entry (current shape, no new fields)
{ "id": "Fig. 2", "decision": "reuse" }

// resolved by the planner at plan time
// -> presentation_assets row with subtype = 'paper_original_figure'
//    where provenance.figureId = 'Fig. 2'
//    and provenance.researchObjectId = version.researchObjectId
//    and versionId = version.id
```

The illustration plan then emits ONE scene per `reuse` figure whose
`visualAction` says "render the source figure verbatim (do not redraw)"
and whose payload carries the bound asset's `objectKey` so the renderer
can ship it as-is. No Chat call is needed for `reuse` figures — the asset
is already on disk.

## Subtype contract

A new `presentation_assets` subtype `paper_original_figure` joins the
existing set (`sourced_storyboard`, `storyboard_scene_image`,
`approved_storyboard_video`). The asset row:

- `kind` is `image`.
- `status` is `approved` (paper originals are user-provided evidence, not
  generated artefacts; they never need review).
- `generator` is a fixed string `OpenScience paper-original figure`, with
  the artefact-import task id in `generatorVersion`.
- `provenance.subtype` is `paper_original_figure`.
- `provenance.figureId` matches the figurePlan entry id.
- `provenance.researchObjectId` and `provenance.versionId` scope the
  binding (a paper-original only valid for the version it was registered
  on).
- `provenance.sourceClaimId` references the claim whose `evidenceRecord`
  rows identify this figure.
- `sourceClaims` join rows resolve to the same claim.

## Registration

Paper-original images arrive with the source paper's artefact, not from a
generation pipeline. Registration should be a side-effect of `sdf.extract`
when the parser identifies a figure (image-bearing page region + caption
text): emit a `presentation_assets` row of subtype `paper_original_figure`
per detected figure, scoped to the current draft version, with the
claim's evidence record as the source. The figure-audit pass is the
authoritative consumer of this row set.

If the parser cannot detect figures, registration is a manual
`POST /research-objects/:id/versions/:vid/figures` call that creates the
asset row, scoped to a claim, with the image uploaded as the asset body.

## Lookup and renderer behaviour

The illustration planner, given a `reuse` figure, looks up the matching
`paper_original_figure` asset by `(researchObjectId, versionId, figureId)`.
- Found: the scene's `visualAction` is fixed to "render the source figure
  as-is"; the renderer reads the bound `objectKey` and emits it verbatim.
  `subjects`/`labels`/`encoding` reflect the source figure's caption.
- Not found: the planner fails the planning step with
  `paper_original_missing_<figureId>` and the user must either upload the
  original or change the decision to `re-render` or `abstract`.

This is the only failure mode the planner surfaces for `reuse`; the user
cannot submit a `reuse` decision without a registered paper-original.

## Failure modes and constraints

- Paper-originals are version-scoped. Editing the paper creates a new
  version; the new version has no registered originals until the parser
  (or manual upload) registers them. Re-running figure-audit on the new
  version must mark `reuse` figures as `paper_original_missing_<id>` if
  the originals are not yet registered. The audit UI must surface this
  to the user.
- Status lifecycle: paper-originals do not transition (they are
  user-provided evidence, not generation artefacts). They can be
  `deletedAt`-set if the user removes the source paper version.
- Workspace: paper-originals follow the existing `presentation_assets`
  workspace rules (`requirePresentationWriteScope` still applies; uploads
  require a write role).

## Out of scope here

- The parser-side detection logic (heuristics for "this page region is a
  figure with caption text"). The sdf.extract pass already produces
  page-quality + figure-candidate metadata; turning that into
  `paper_original_figure` rows is its own task.
- Cross-version reuse (a paper-original registered on v1 used in v2's
  presentation). Version-history-copy may already handle this via
  `version_history_copy` subtype; this spec keeps paper-originals
  version-scoped until that flow is reconciled.
- UI affordances for figure-by-figure approval. The Hermes guide already
  emits `presentationDraft.figurePlan`; the user clicks confirm and the
  audit result is what they sign off. Approval/rejection for individual
  figures is a follow-up.