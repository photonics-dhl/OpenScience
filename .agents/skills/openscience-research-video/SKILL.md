---
name: openscience-research-video
description: Plan source-grounded research videos from Hermes paper understanding, accepted storyboards and approved scene assets; use for shot design, motion continuity, quota-safe Synclip or MiniMax H3 handoff and private review.
version: "2026-10-08"
---

# OpenScience research video

This is Hermes's planning and review method for research video. It converts the paper's reviewed meaning into a small, readable motion brief. It is not a provider API contract, a source of paper facts, or permission to spend video credits.

## Source and responsibility

1. Treat the PDF/OCR/SourceMap, `openscience-source-review`, saved six-dimensional understanding, Claims/Evidence and the accepted storyboard as the scientific authority. Read the original passage or figure again when a motion, condition, direction, object or qualifier is missing. A vendor blog, a style Skill and a generated frame cannot add a scientific fact.
2. First reduce the paper to one reader outcome: the thesis, one mechanism or comparison, and the one condition or limitation that prevents overclaiming. Use two or three connected beats only when each beat changes what the reader understands. Do not turn every extracted detail into a shot.
3. Keep source reasoning, visual direction and provider transport separate. The video model renders the approved brief; it does not interpret the paper, repair a Claim, choose unsupported geometry or review its own result.
4. Load `openscience-synclip-capabilities` for Synclip's image/video provider boundary, then load only the relevant illustration/style Skills. The current server also has a verified MiniMax H3 pilot in `packages/ai-gateway/src/minimax-video.ts` and `infra/codex-image-runner/minimax-video-pilot.mjs`; existing media styles remain reusable planning resources and do not authorize a new provider call.

## Build a compact shot brief

For each shot, write a bounded planning record. In the OpenScience server this maps to the existing storyboard document's optional `videoProduction` and per-scene `videoDirection` fields; it is not a second task chain or paper-analysis schema:

```text
shot: stable local number and purpose
sourceClaimIds: exact reviewed Claims supporting the shot
duration: smallest provider-supported duration that can express the beat
subject: identity and the scientific objects that must remain fixed
environment: field, apparatus, material, coordinate frame or abstract space
action: one physical or conceptual change, with start state and end state
camera: fixed, pan, orbit, zoom or cut; say what must remain in frame
fixed: sign, axis, boundary, scale meaning, contact, ordering and unchanged objects
audio: narration or sound purpose, sourced from the approved meaning
text: none by default; exact post-edit text only when the product path supports it
references: numbered approved scene/frame/audio assets, one job per reference
exclusions: plausible but unsupported objects, motion, labels or causal claims
```

The persisted production fields are deliberately provider-neutral. `videoProduction` stores the narrative arc, global continuity bible, audio policy and commercial-first model policy. `videoDirection` stores the shot type, purpose, locked subject, generated elements, one motion beat, camera treatment, reference/frame strategy, audio mode, subtitle mode and bounded exclusions. Claims and reviewed passages remain the scientific authority; these fields only package that meaning for a commercial video model. Legacy storyboards without these optional fields remain readable by the local preview renderer, while new Hermes video plans must populate them.

Use the shared directorial order when writing a prompt: `subject → environment → action → camera → style → audio → text → references → exclusions`. Describe motion as a transition between two readable states, not as a list of cinematic adjectives. Repeat identity, lighting, material and camera continuity across connected shots. One reference has one job: for example, `Image 1 = approved scene frame` or `Image 2 = approved endpoint`.

Prefer a fixed camera and a single moving relation for scientific explainers. If a field, ray, trajectory or boundary moves, name its direction and what stays fixed. Do not imply that decorative particles are measurements, that a smooth animation is a simulation, or that temporal order proves causality. For equations, axes and dense labels, keep the visual clean and add verified typography as a separate layer; generated lettering is not a reliable source of scientific text.

## Choose the least expensive useful route

- If the reader needs one relationship, use a still image. The current production route is Synclip `gpt-image-2`; do not create a video to animate a detail that a reviewed image explains better.
- If the reader needs a short transition, prepare one private MiniMax H3 shot or the smallest connected sequence allowed by the verified H3 contract. Do not request variants, batch scenes or a full paper film by default.
- If continuity across several shots is essential, prefer the Synclip video route once its exact server contract is recorded. Until that adapter is complete, the verified H3 paper-shot contract is the executable pilot: one approved reference image per shot, 15 seconds, 2K, 16:9, native audio, one durable state directory per shot, and no automatic retry. Never invent another model, duration, resolution, reference or pricing field.
- The repository's `content-driven-v1` and `onchip-field-sampling-v1` paths are isolated OpenScience renderers with their own parent, claim and approved-scene gates. They are not Synclip video calls. Use them only through the existing `video.create` flow and its server checks.
- A plan is free of provider cost. Before any paid request, show or record the exact model, estimated spend/credits, duration, reference inputs and the private-review destination. If the contract or estimate is unknown, stop at the brief.

Never auto-fallback between Synclip, MiniMax H3 or another provider after an uncertain submission. Keep the original intent, request marker, task ID, attempt and receipt; reconcile the same operation before any new POST. A timeout, missing receipt or ambiguous provider state is not permission to try again.

## Review before delivery

Keep every output private until the existing review and user approval flow accepts it. Review the actual decoded clip, not only the provider status:

1. **Meaning:** the clip communicates the selected Claim and its condition; the narration does not outrun the source.
2. **Physics and geometry:** object identity, axes, signs, direction, contact, boundary, scale meaning and before/after states remain correct.
3. **Continuity:** subjects, environment, lighting, camera frame and material do not drift between shots; cuts do not create a false transition.
4. **Timing and audio:** narration names what is changing when it changes; speech is short, intelligible and source-faithful; estimated timing remains review-required.
5. **Text and crop:** no unreadable or invented scientific labels; intended captions, equations and units are checked separately; the important relation survives the target crop.
6. **Disclosure:** an explanatory animation is marked as such and is never presented as raw measurement, a validated simulation or a new result.

If a defect changes the paper meaning, return to the scientific brief or storyboard. If it changes only layout, camera, material or pacing, revise that bounded field. Do not make an art correction that silently changes a Claim. Preserve the source passage IDs, original assets, prompt/brief, model identity, request receipt and review decision with the private draft.

## Provider handoff checklist

Before declaring Synclip video stable, verify the endpoint, account permission, model, fields, external reference links, task/receipt recovery, bounded download and decoded result. Current developer documentation puts LTX (`ltx23`) on the admin-only `/v1/video-admin` route with `duration_seconds`; `/v1/video` is the public Veo route. Never send inline image data or a guessed resolution field. The candidate broker reuses existing approved image receipts and checks the returned original bytes before using a temporary HTTPS reference. Watermarked reference metadata must be resolved before paying to propagate it into a video.

Synclip documents an independent TTS interface; returned voice IDs, a real narration sample, measured timing and final listening are still required. Do not claim native video speech from a TTS catalogue or replace the audio strategy silently. The existing MiniMax H3 pilot is historical, separate provider evidence, not an automatic fallback from the user's Synclip choice. A balance rejection or uncertain submission retains its original attempt and receipt and cannot be retried automatically.
