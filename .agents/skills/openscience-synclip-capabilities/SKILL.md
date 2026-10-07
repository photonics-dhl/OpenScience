---
name: openscience-synclip-capabilities
description: Use the Synclip image and video capability guide for evidence-grounded media planning, model selection, prompting, review, and safe handoff. This is a production guide, not a source of paper facts or an API key.
version: "2026-10-07"
---

# Synclip capability guide

This guide is the compact operational index for Synclip. It is derived from the 25 posts currently listed on the [Synclip blog](https://synclip.ai/blog), then separated from the current OpenScience implementation and real runtime evidence. Blog claims describe product or model behavior; they do not authorize a provider call and do not replace the API contract.

## Rules for Hermes

1. The paper, its PDF/OCR/SourceMap, the saved Claims and the accepted illustration brief are the only sources of scientific content. Read the paper with `openscience-source-review` and `openscience-research-illustration`; use `paper_read`/`paper_view` for missing definitions, conditions, captions and spatial relations. Never use a Synclip blog post as evidence for a paper.
2. Before choosing a model, define one observable outcome: one still relationship, one motion beat, one transition, or one narrated shot. Keep the scientific contract separate from aesthetic language.
3. Load this guide with `skill_view`, then load only the selected illustration, layout and style references. Do not inject the full blog catalogue into every model request. The existing `installed-media-skills.ts` loader records the exact design resources consumed by the plan and render stages.
4. Treat the first output as a private candidate. Review science, geometry, labels, crop, identity, motion and audio before approval. A successful provider task is not scientific acceptance.
5. Never invent a model ID, endpoint, reference-input shape, duration, resolution, price or idempotency rule from a blog post. If the exact API contract is not in the current adapter or official developer documentation, mark the route `unverified` and stop before a paid POST.
6. A timed-out or otherwise uncertain generation is not a failure that can be blindly retried. Preserve the original request, provider task ID if any, attempt marker and receipt; reconcile the same operation first.

## Current OpenScience contract

The current server image route is the Synclip adapter in `packages/ai-gateway/src/synclip-image-api.ts`, `packages/ai-gateway/src/codex-image.ts` and `infra/synclip-image/`. It is selected by `HERMES_SCENE_IMAGE_PROVIDER=synclip` and requires the private host spool to be enabled. The current implementation:

- sends one asynchronous `POST https://api.synclip.ai/v1/image` with `model: "gpt-image-2"`, the reviewed prompt and `aspectRatio: "16:9"`;
- queries only the saved task with `GET https://api.synclip.ai/v1/tasks/:id` and accepts `queued`, `processing`, `completed` or `failed`;
- downloads only a completed HTTPS result with an unexpired URL, public IPv4 DNS, bounded bytes and image-dimension checks;
- uses no reference image in this adapter. The current request protocol intentionally rejects a reference field, so a blog description of image references or editing is not an instruction to add one;
- stores the request, submission marker, task receipt, result and normalized private PNG through the existing image spool. The Worker then runs the existing image review and publication/approval guards;
- keeps the API key in the private host configuration. It must never enter a prompt, task payload, log, browser message or Git file.

This current route has real private-draft evidence for `gpt-image-2` and accepted image review, but that proves the present image route can run; it does not prove every Synclip model, the video API, long-term cross-paper quality or the claims in the blog. The authoritative runtime state is the [Hermes CURRENT handoff](../../docs/handoff/2026-09-10-hermes-web-image-handoff.md).

The current repository does **not** have a Synclip video adapter. The existing paper-video and narration paths use the separate MiniMax video/speech pilot and media renderer. Do not route a paper video into Synclip until the exact Synclip video endpoint, model value, authentication, asynchronous status, reference-file contract, download limits, idempotency behavior and one real private result are recorded. Blog support for a web Studio is not server API integration.

## Model and workflow selection

| Need | Blog-described Synclip option | Use when | Current server status |
|---|---|---|---|
| Scientific still or explainer image | GPT Image 2 | The deliverable is a single readable still; fix subject, relationship, layout, labels and exclusions in the brief | **Integrated:** current adapter uses `gpt-image-2`, text-only, 16:9 |
| Image Studio template or image-to-image edit | Nano Banana Pro | Identity, restyling, mockup or repeatable template workflow | Blog/UI capability only; not the current server image adapter |
| Reference-guided cinematic video | Veo 3.1 Fast/Pro | Use reference images for identity/style or first/last frames for a controlled transition | Blog/UI capability; exact Synclip API contract and server adapter are unverified |
| Short video with one reference | Grok Video | One character/product/scene reference, 6/10/15 seconds, 3:2/2:3/1:1 | Blog/UI capability; unverified server adapter |
| Connected multi-shot video | LTX 2.5 | A sequence needs continuity of subject, environment, lighting and voice | Latest blog capability; exact Synclip API contract is unverified |
| Text/image/audio video in Video Studio | MiniMax H3 | A short shot needs optional image and audio references and explicit sound direction | Synclip blog says Video Studio only; repository has a separate MiniMax pilot, not this Synclip route |
| Text-to-video with motion coherence | Seedance 2.0 | Consider only after Synclip marks it live and publishes a callable contract | The model article still labels it coming soon; no server route |
| Script-to-storyboard-to-video workspace | VideoClaw | A film workflow needs characters, shots, storyboard images and selectable video models | Synclip product workflow only; no OpenScience adapter |

When the route is eventually implemented, use the model whose control matches the failure to prevent: reference images for identity drift, first/last frames for a required transition, multi-shot for continuity, and a simple text shot for a single motion beat. Do not select by marketing quality claims alone.

## Prompt construction

### Still images

Build the reviewed image prompt in this order:

1. **Scientific subject:** the exact object, system or comparison from the accepted brief.
2. **Visible relation:** what connects to what, direction, spatial separation, scale and boundary conditions.
3. **Composition:** frame orientation, reading path, region placement and empty space for labels.
4. **Rendering language:** the selected installed style, palette, material and line treatment.
5. **Constraints:** preserve equations and symbols as provided, do not invent text, no extra objects, no changed sign/direction/scale, no decorative element that resembles a physical relation.
6. **Output use:** article body, cover, figure replacement or reader explainer, including crop requirements.

The image blog's useful operational pattern is intent → short structured brief → candidate set → review for crop/brand/placement → small targeted revision → approval. For a research figure, replace brand review with science/geometry/label review while retaining the same staged workflow.

### Video

Use the shared directorial order from the Seedance, Veo, Grok, LTX and MiniMax H3 posts:

`subject → environment → action/motion beat → camera → visual style → audio → on-screen text → references → exclusions`

Number every reference and assign one job only: `Image 1 = approved scene frame`, `Image 2 = approved endpoint`, `Video 1 = motion reference`, or `Audio 1 = narration/ambience`. Do not ask one reference to control character identity, camera motion and scene layout at the same time. Use “no text” when generated lettering is not part of the scientific deliverable; add precise typography later only when that is a separate approved step.

For a paper video, each shot must carry a source-bound visual claim and a motion contract. Prefer one physical change per shot. State what remains fixed: object identity, axes, sign, boundary, field direction, material contact, camera frame and time mapping. A visually smooth clip that changes a scientific relation is rejected.

## Existing OpenScience skills to combine

| Stage | Existing project capability | Synclip guide contribution |
|---|---|---|
| Understand | `openscience-source-review`, native `paper_read`/`paper_view`, SourceMap and Claims | Keep the author’s message and conditions authoritative |
| Choose a visual | `openscience-research-illustration` | Map reader goal to still, reference frame, motion beat or multi-shot sequence |
| Choose style/layout | `baoyu-article-illustrator`, `baoyu-infographic`, `baoyu-cover-image` and installed style resources | Use style as rendering language only; never let it change science |
| Plan | native illustration task and `illustration-planner.ts` | Produce one scoped, reviewable prompt per scene/shot |
| Generate | current Synclip image spool; future Synclip video adapter only after contract proof | Treat provider output as private candidate |
| Review | existing image review/native image review and user approval flow | Apply science, geometry, identity, crop, motion, audio and text checks |
| Publish | existing private draft, CAS approval and public-version flow | Do not publish directly from a provider result |

## Blog coverage register

The following is the complete 25-post set shown by the blog index on 2026-10-07. The short note records what is reusable for Hermes; it is not a statement that the capability is integrated.

| Post | Reusable lesson | Boundary |
|---|---|---|
| [MiniMax H3](https://synclip.ai/blog/minimax-h3-synclip-video-studio) | Subject → setting → action → camera → sound → constraints; image/audio references get explicit jobs; inspect the whole clip | Video Studio only; no video references or first/last frames in that integration |
| [LTX 2.5](https://synclip.ai/blog/ltx-2-5-ai-video-generator-synclip) | Use a compact labelled shot list and repeat identity, wardrobe, environment, lighting and style for connected shots | Product/model claim; exact API controls vary by mode and plan |
| [Composer](https://synclip.ai/blog/synclip-composer-ai-creative-workspace) | Describe outcome, inspect plan/materials/cost, then generate and revise | Synclip workspace behavior, not current server API |
| [Mirra AI](https://synclip.ai/blog/mirra-ai-visual-creator-app) | Prompt → reference/template → generate → refine → export is a low-friction mobile loop | iPhone app, not server Hermes |
| [AI regulation workflow](https://synclip.ai/blog/ai-regulation-updates-creators-2026) | Define goal, placement, audience and approval bar before the prompt; preserve ownership/version metadata | Generic workflow guidance; no model contract |
| [Open-source models / GLM 5.2](https://synclip.ai/blog/best-open-source-ai-models-content-creation-glm-5-2) | Treat the first asset set as candidates and revise for channel fit, not novelty | No OpenScience model integration |
| [Claude Fable 5 workflow](https://synclip.ai/blog/claude-fable-5-content-workflows-synclip) | Prompt as a production brief; document successful constraints and rejected variants | Generic workflow guidance; no server route |
| [Summer Game Fest](https://synclip.ai/blog/summer-game-fest-2026-announcements) | Build an asset stack: hero, supporting images, summary cards and reusable crops | Editorial example, not a research generation recipe |
| [Northern Lights](https://synclip.ai/blog/northern-lights-ai-images) | For stills, use restrained palette, foreground scale and realism before spectacle | Topic-specific example; scientific truth still comes from the paper |
| [SpaceX launch visuals](https://synclip.ai/blog/spacex-ai-launch-visuals) | Start from narrative intent, then make hero/workflow/refinement asset classes | Trend example; no scientific or API contract |
| [GPT Image 2](https://synclip.ai/blog/how-to-use-gpt-image-2-for-real-content-workflows-in-synclip) | Intent → scoped brief → candidate set → crop/format review → targeted refinement → approval | Current server model matches, but current adapter remains text-only 16:9 |
| [Seedance prompt guide](https://synclip.ai/blog/seedance-2-prompt-guide) | Subject + environment + action, then camera/style/audio/text/references; number references and assign one role | Prompt method; no current OpenScience adapter |
| [LTX 2.3](https://synclip.ai/blog/ltx-video-2-3-ai-video-generator) | First frame, last frame and both are independent in the described integration; motion prompts should describe camera behavior | Older article; do not copy `ltx23` API IDs without current contract |
| [AI Canvas](https://synclip.ai/blog/ai-canvas-launch) | Keep input, generation, preview, download and reusable workflow in one visible chain | Synclip canvas product; no current server canvas integration |
| [Audio Studio](https://synclip.ai/blog/audio-studio) | TTS, voice clone and separation feed lipsync; clean short references improve voice results | Audio capability; not part of current paper-image route |
| [VideoClaw](https://synclip.ai/blog/videoclaw-ai-storyboard-video-generator) | Script → characters → scenes → shots → storyboard images → video; global style with local overrides | Hosted multi-agent product, not current Hermes integration |
| [Seedance coming soon](https://synclip.ai/blog/seedance-2-ai-video-generator) | Fast for scene validation, standard for final; use one subject and one clear scene | The page labels the model coming soon; never submit from this entry |
| [Grok Video](https://synclip.ai/blog/grok-video-ai-video-generator) | One reference image, explicit subject/scene/camera/motion/style, choose ratio before prompt | Blog/UI feature; 720p and pricing are not current server contract |
| [Veo 3.1](https://synclip.ai/blog/veo-3-1-first-last-frame-reference-images) | Reference images solve identity drift; first/last frames solve transitions; Fast explores, Pro finalizes | Exact Synclip request schema unverified |
| [Nano Banana Christmas templates](https://synclip.ai/blog/ai-christmas-photo-generator-nano-banana-pro-templates) | Template + short prompt; change one variable at a time; use no-readable-text when typography matters | Image Studio template workflow; not current `gpt-image-2` adapter |
| [Natural body movement](https://synclip.ai/blog/body-movement) | Head-only is stable; optional body movement is a deliberate higher-cost lipsync layer | Lipsync feature; not paper video integration |
| [Sora watermark remover](https://synclip.ai/blog/watermark-remover) | A post-processing tool can preserve motion while removing a platform mark | Not used for OpenScience assets; rights/provenance must be explicit |
| [Sora Video Creator](https://synclip.ai/blog/sora-video-creator) | Subject/place/camera/mood; optional reference frame; choose orientation and duration before generation | UI/workspace claim; exact API adapter unverified |
| [Image Toolkit](https://synclip.ai/blog/image-tool) | Local crop/resize/adjust/QR/compress can prepare distribution variants without uploading the source | Browser utility, not model generation or Hermes science |
| [How Synclip works](https://synclip.ai/blog/how-it-works) | Design for temporal consistency, semantic-visual coherence, caching and measurable checks | Vendor engineering statement; claimed metrics are not our acceptance tests |

## Handoff checklist

Before a future Synclip adapter or real task is enabled, record the exact model and endpoint, request/response examples without secrets, reference limits, duration/resolution/ratio options, provider task states, idempotency/correlation behavior, download validation, credit semantics, rollback and one private result. Then update the capability registry and CURRENT. Do not add a fallback or second paid attempt merely because a blog model looks stronger.
