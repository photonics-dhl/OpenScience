# Hermes 3D Scholar Agent Design

- Status: Approved for implementation
- Date: 2026-08-15
- Product surface: authenticated workspaces and Hermes task surfaces
- Replaces visually: the current original-vector Optical Guide when the 3D runtime is available
- Does not replace: `HermesVisualState`, task links, approval semantics, or the original-vector fallback

## 1. Product intent

Hermes is a visible research colleague, not a decorative mascot and not a
surveillance device. The character must be recognizable as a living robot
before its scholarly and technological details are noticed. Its warmth comes
from gaze, timing and responsive secondary motion; its authority comes from
adult proportions, restrained materials and calm movement.

The design must avoid the failed directions already reviewed with the user:

- no circular camera face or concentric lens language;
- no floating seed, book spirit, mask, warrior or drone silhouette;
- no literal book body and no pasted microscope, DNA, glasses, mortarboard,
  pen or other academic props;
- no chibi, baby, plush, anime or generic consumer-assistant proportions;
- no use of Wanko or another third-party character binary.

## 2. Character direction: the Scholarly Automaton

Hermes has a clear head, short neck, shoulders, compact torso and two
articulated arms. The lower torso terminates in a quiet levitation core rather
than legs. This preserves a distinctive non-human silhouette while providing
the posture and gesture vocabulary needed to read as a companion.

Bookishness is structural but subordinate:

- two thin shoulder mantle leaves echo a scholarly folio without becoming a
  costume or literal book;
- a graphite central spine reads as both binding and robotic chassis;
- three restrained page-edge layers can articulate during scanning and
  suggesting;
- cyan index light and coral annotation light expose machine state without
  adding symbols or text.

The head uses a shallow smoke-glass adaptive face plane. Two small ivory light
strokes form the eyes. They are softly curved, low-luminance and slightly
asymmetric, with no mouth. Head orientation, eye offset and eyelid scale must
carry attention and emotion without turning the face into a screen full of UI.

## 3. Shape and material system

### 3.1 Proportion

- overall height: 2.4 Blender units at neutral pose;
- head: 29%–33% of total height;
- shoulder width: 72%–78% of total height;
- arm span in neutral pose: no more than 92% of total height;
- hands: compact three-segment scholar gestures, not human anatomical hands;
- no single circular face element larger than 18% of head width;
- silhouette must remain recognizable in a 48 CSS pixel square.

### 3.2 Materials

1. `Hermes_BoneCeramic`: warm bone, matte roughness 0.64–0.74.
2. `Hermes_SmokeGlass`: graphite smoke, roughness 0.22–0.32, no lens bulge.
3. `Hermes_Titanium`: dark neutral binding/chassis, metallic 0.82–0.92.
4. `Hermes_EyeIvory`: low-power emissive ivory.
5. `Hermes_IndexCyan`: cool index telemetry; never the dominant surface.
6. `Hermes_AnnotationCoral`: warm annotation/approval telemetry.

Materials use factors and compact procedural detail where possible. The web
asset must not rely on externally hosted textures. Any baked texture is at most
1024 × 1024 and has an authored source in the Blender file.

## 4. Asset contract

The canonical editable source is `apps/web/assets/hermes/Hermes.blend`. The
runtime artifact is `apps/web/public/hermes/hermes-scholar.glb`. A deterministic
Blender Python builder is retained at
`apps/web/scripts/hermes/build-hermes-asset.py`; the script is the repeatable
geometry, material, rig, camera and animation recipe, while the `.blend` file
remains artist-editable.

The GLB root is `Hermes_Root`. Required named nodes are:

- `Hermes_Head`, `Hermes_Face`, `Hermes_Eye_L`, `Hermes_Eye_R`;
- `Hermes_Torso`, `Hermes_Spine`, `Hermes_Core`;
- `Hermes_Mantle_L`, `Hermes_Mantle_R`;
- `Hermes_Arm_L`, `Hermes_Forearm_L`, `Hermes_Hand_L`;
- `Hermes_Arm_R`, `Hermes_Forearm_R`, `Hermes_Hand_R`;
- `Hermes_Page_L_01`, `Hermes_Page_L_02`, `Hermes_Page_R_01`,
  `Hermes_Page_R_02`.

Rigid articulated parts are driven by one armature. The asset must contain the
following exact animation clips:

| `HermesVisualState` | GLB clip | Duration | Loop | Contract |
| --- | --- | ---: | --- | --- |
| `idle` | `Hermes_Idle` | 6.4 s | yes | micro-float, breath, irregular blink, mantle lag |
| `guiding` | `Hermes_Guiding` | 2.8 s | yes | open palm, head lead, one annotation pulse |
| `scanning` | `Hermes_Scanning` | 3.2 s | yes | page leaves open, bilateral scan, cyan index sweep |
| `suggesting` | `Hermes_Suggesting` | 3.6 s | yes | two-hand evidence presentation, attentive gaze |
| `awaiting_approval` | `Hermes_AwaitingApproval` | one neutral key | no | exactly still; coral edge only |
| `failed` | `Hermes_Failed` | 2.4 s | no | one contained recoil, dim eyes, settled readable pose |

The Wanko puppy reference is behavioral only: spontaneous blink timing, gaze
anticipation, breathing, head-body follow-through and secondary motion create
life. No Wanko geometry, texture, rig, motion data or runtime is copied.

## 5. Runtime design

`HermesVisualAdapter` remains the semantic link and state owner. A lazy client
`Hermes3DMount` progressively replaces the original-vector portrait only after
the page load boundary, GLB decode and first successful frame. The original
portrait remains the SSR, loading, WebGL failure and reduced-motion fallback.

The 3D renderer uses the already installed OGL runtime and its `GLTFLoader`,
`Skin` and `Animation` facilities. It must not add Three.js, Pixi, Cubism or a
second rendering framework.

- exactly one canvas and one GL context per visible Hermes instance;
- `IntersectionObserver`, `visibilitychange` and context-loss handling pause
  rendering when hidden, offscreen or unavailable;
- `awaiting_approval` renders one stable frame and stops RAF;
- `prefers-reduced-motion: reduce` never creates a WebGL context;
- pointer gaze is limited to ±6° head yaw, ±4° pitch and a small eye offset;
- pointer gaze is disabled for approval, reduced motion and after unmount;
- all listeners, RAFs, buffers, programs, textures and context ownership are
  released on unmount or route transition.

## 6. Performance and accessibility budgets

- GLB raw size: ≤ 1.8 MB; gzip/Brotli transfer target ≤ 700 KB;
- triangles: ≤ 24,000; materials: ≤ 6; steady draw calls: ≤ 12;
- no more than one 1024² texture; prefer factor-only PBR materials;
- renderer code is lazy and does not enter Landing critical-path JavaScript;
- desktop DPR cap 1.5, mobile DPR cap 1.0;
- idle frame cadence may downshift to 30 Hz; pointer response remains 60 Hz
  where the display cadence permits;
- canvas is `aria-hidden`; the enclosing link, visible state label and task
  destination remain real DOM and keyboard accessible;
- contrast and focus behavior remain inherited from the current workbench.

## 7. Failure, fallback and honest evidence

Asset fetch/decode, WebGL creation, shader compilation, context loss or action
lookup failure must leave the original-vector portrait visible and the task
link usable. No empty canvas may replace the fallback before a successful
frame.

Automated evidence must parse the real GLB and prove node names, six clip names,
approval stillness, triangle/material/size budgets and license metadata. Browser
evidence must exercise all six real actions, pointer gaze, reduced motion,
offscreen/hidden lifecycle, context failure and route unmount. Final approval
also requires a turntable and a six-state contact sheet rendered from the real
`.blend`, not an image-generation concept.

## 8. Ownership and licensing

The generated geometry, rig, materials and animations are original
OpenScience assets produced from the checked-in builder. The CC0
RobotExpressive model may be inspected only as a technical animation-format
reference; it is not embedded or redistributed in the final model. Wanko and
Live2D remain governed by ADR-010 and are not used.
