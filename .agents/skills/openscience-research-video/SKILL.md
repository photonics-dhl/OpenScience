---
name: openscience-research-video
description: Plan source-grounded research videos from Hermes paper understanding, accepted storyboards and approved scene assets; use for shot design, motion continuity, bounded Synclip handoff, explicit audio strategy and private review.
version: "2026-10-13"
---

# OpenScience research video

This is Hermes's planning and review method for research video. It converts the paper's reviewed meaning into a small, readable motion brief. It is not a provider API contract, a source of paper facts, or permission to spend video credits.

## Source and responsibility

1. Treat the PDF/OCR/SourceMap, `openscience-source-review`, saved six-dimensional understanding, Claims/Evidence and the accepted storyboard as the scientific authority. Read the original passage or figure again when a motion, condition, direction, object or qualifier is missing. A vendor blog, a style Skill and a generated frame cannot add a scientific fact.
2. First reduce the paper to one reader outcome: the thesis, one mechanism or comparison, and the one condition or limitation that prevents overclaiming. Use two or three connected beats only when each beat changes what the reader understands. Do not turn every extracted detail into a shot.
3. Keep source reasoning, visual direction and provider transport separate. The video model renders the approved brief; it does not interpret the paper, repair a Claim, choose unsupported geometry or review its own result.
4. Load `openscience-synclip-capabilities` for saved provider evidence, then only the relevant illustration/style Skills. Its historical model and pilot notes do not override the user's current API-only choice, the current adapters or actual runtime receipts. The registered video chain is `packages/ai-gateway/src/synclip-video-api.ts` → `apps/agent-worker/src/presentation/synclip-video-spool.ts` → `infra/synclip-video/`; reuse it and the existing image assets rather than building another chain. Source availability, installed resources, runtime readiness and accepted media quality are separate facts.

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

## Choose an executable route and keep cost bounded

- If a reviewed still communicates the intended relationship, reuse it. The authorized new-image policy is Synclip `gpt-image-2.5` first, with one `gpt-image-2` fallback only for an explicit structured model-unavailable response. Actual installed model identity comes from runtime receipts; historical images retain their own model. This image fallback policy does not authorize a video retry.
- For a motion beat or connected scientific explanation, prepare the Synclip commercial-video brief within the existing task grant. The current adapter supports configured `ltx23` or `ltx23fast`, with 5/10/15-second provider clips; follow the configured model and exact contract, rather than switching for a guessed price or quality advantage. A full-paper narrative remains a valid deliverable, but variants, extra shots and paid batches require the existing scope and budget to cover them.
- Use the approved scene artwork as the start reference. The current broker consumes `reference: scene-artwork`, `frameStrategy: start-reference` and `subtitleMode: none`. Tail frames, multiple reference images, subtitles and mixed audio are not implemented end-to-end by this chain merely because planning fields or vendor APIs describe them. Record such needs as pending capabilities instead of promising executable controls.
- MiniMax H3's pilot is historical evidence, not the current default or a fallback from Synclip. Its existing entry points remain `packages/ai-gateway/src/minimax-video.ts` and `infra/codex-image-runner/minimax-video-pilot.mjs`; read their own saved contract for a separately authorized comparison. Veo and Seedance have separate endpoint, account, input and audio contracts; their vendor availability does not mean this LTX adapter accepts their model IDs. Model comparisons need their own verified route and bounded authorization, not substitution into the current request.
- `content-driven-v1` and `onchip-field-sampling-v1` are existing local preview renderers, not evidence of commercial-video quality or a replacement for the requested commercial output. Do not reroute to them when the commercial host is unavailable.
- Preparing a brief does not authorize a paid video POST and may itself consume the existing Hermes planning budget. Reuse existing scoped authorization and source analysis; record the exact model, estimate, duration, references and private-review destination. If runtime readiness, the supported contract or the estimate is unknown, preserve the plan and stop before paid submission. Never invent pricing or another approval workflow.

## Keep the assigned audio strategy

The registered broker supports two distinct narrative combinations: `external-narration` with every scene's `audioMode: external-narration`, or `native-first` with every scene's `audioMode: native` and no external audio request. Preserve the source-bound task's explicit audio authority; a storyboard `audioPolicy` field alone cannot create that authority. Do not convert saved or paid tasks to another mode.

- External narration uses the existing Synclip audio path and the configured returned voice ID/speed. Audio qualification, a real sample, decoded/measured timing and final listening remain necessary. Do not claim that the audition MP3 is already reused verbatim in the final film or that the current mux preserves native environmental sound; the present mux replaces the original audio track.
- An explicitly authorized all-native plan can use the existing `native-first` readiness path without independent TTS. It does not guarantee the requested dialogue, natural Chinese speech, voice identity, synchronization or acceptable sound. Review the actual provider audio; do not infer those qualities from a voice catalogue or plan text.
- The ordinary whole-paper run still uses default narration readiness. This Skill does not change that contract, bypass a closed or expired host, or silently opt a run into `native-first`. A mixed scene strategy needs a supported consumer before submission.

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

Before declaring Synclip video stable, verify the endpoint, account permission, configured model, fields, external references, task/receipt recovery, bounded download and decoded result. The saved developer contract and current adapter put LTX (`ltx23` / `ltx23fast`) on admin-only `/v1/video-admin` with `duration_seconds` and `orientation`; `/v1/video` is the separate public Veo route. Current account access and video execution readiness require actual evidence, not a successful image call. Never send inline image data or a guessed resolution field. The existing broker reuses approved image receipts and checks the returned original bytes before using a temporary HTTPS reference. The chain's 720p output target is not a guarantee of LTX native resolution. Missing or watermarked references remain blocked before paid video submission.

Synclip documents an independent TTS interface; returned voice IDs, a real narration sample, measured timing and final listening are still required. Do not claim native video speech from a TTS catalogue or replace the audio strategy silently. The existing MiniMax H3 pilot is historical, separate provider evidence, not an automatic fallback from the user's Synclip choice. A balance rejection or uncertain submission retains its original attempt and receipt and cannot be retried automatically.
