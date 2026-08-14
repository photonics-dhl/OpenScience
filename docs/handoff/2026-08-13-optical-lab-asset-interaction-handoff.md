# Handoff — 2026-08-13 Optical Lab Asset Interaction

## Current canonical state — Task 20 stronger idle RC, deployment pending (2026-08-14)

> **This section supersedes Task 19's next action and every historical Task
> 17/18 statement below.** The current task remains the production `Science
> evolves.` shared Landing/Lab surface; do not reopen the blue six-face object.

- User accepted pointer interaction but found no-input flow too weak. Task 20
  keeps every local contract unchanged and changes only idle displacement
  `2px → 4.5px` plus cycle `8s → 5s`; ambient vector remains `.05`.
- Renderer pauses the ambient clock during local input and resumes from the same
  phase after the existing exact `700ms` local zero. Flow persistence retains
  the accepted `.985` inside previous-local support and is zero outside it,
  preventing whole-frame ambient duplication without attenuating local history.
- Final local evidence includes two consecutive full native GREEN runs after
  phase-matching layer probes: latest idle `33,890` pixels with all four
  quadrants; worst centroid `.02263`, worst locality `.98994`; layers
  `20.37 > 15.40 > 5.14`; recovery `788.5ms`; halo `2/16`; touch `.99954`.
  One timing-only PNG run was RED at `992.7ms`, followed by two consecutive
  full GREEN runs at `184.6s/178.6s`. Focused `14/14`, Web `241/241`,
  typecheck/lint/build, Landing desktop/mobile normal/reduced/pointer/idle,
  reduced exact Lab, full native and release `27/27` are GREEN.
- No pass, FBO, texture, canvas owner, dependency, API, data, schema, Nginx,
  Compose, secret or topology change. Physical-mobile waiver remains the same
  one-release risk decision; simulated mobile is not described as hardware.
- **Next action:** finish independent diff review and docs gates, commit Task 20,
  then use the already authorized backup/dry-run/`deploy.sh --confirm
  --skip-migrate` production path and repeat public desktop/mobile idle/pointer/
  reduced plus service/log verification.

## Current canonical state — Task 19 deployed and publicly verified (2026-08-14)

> **This section supersedes every Task 17/18 blocker and next-action statement
> below.** Do not restart the blue six-face object or the earlier fixed-centre
> plan. The current task is the production `Science evolves.` shared Landing/Lab
> optical surface.

- Task 19 adds one independent transparent overlay draw after the authored
  composite. It reuses the same RGBA8 flow texture/canvas/RAF and existing
  lifecycle ledger; no new FBO, texture, owner, package or server GPU exists.
- Current accepted tuning: `70ms` response, `.05` ambient flow, `2px` ambient
  displacement, `8s` idle cycle, `5px` follow, `10px` local/combined cap,
  `.18` gain, longitudinal `.20` / transverse `.14`, empty `.27`, exact local
  geometry/carrier zero at `700ms`.
- Responsibility-specific acceptance is binding: production framebuffer-alpha
  overlay mask centroid `<=.04`; final authored+overlay centroid `<=.08` and
  locality `>=.80` across five positions × four phases. Latest overlay worst is
  `.01083`; final worst is `.0609174` / locality `.852831`. A real WebGL
  skip-draw mutation suppresses `487` overlay draws and fails up to about `.12`,
  proving the ordered overlay draw is load-bearing.
- Retained native evidence is GREEN: follow `+5px`, forbidden cap mutation
  `+4px`, halo `2/16`, energy > typography > empty, touch locality `.9673`,
  recovered same-RAF PNG complete at `767.8ms` with exact local zero after
  `700ms` and ambient RAF continuing. Focused `12/12`, Web `239/239`, typecheck,
  lint/docs sync, build, Landing matrix, exact reduced Lab and release `27/27`
  are GREEN.
- User waived only the physical-mobile performance gate and authorized deploy
  after all other gates. Never describe simulated mobile as physical hardware.
- Release `b6a41da` is active on ECS; rollback anchor is `cd5be36`. Pre/post
  checkup passed, backup was `280K` with `7/7` retention, and deployment used
  `--skip-migrate`. Public `/`, Lab and `/explore` return 200; unauthenticated
  `/auth/me` returns 401. Desktop/mobile normal/reduced browser checks passed,
  including four-quadrant idle pixels, pointer response, zero errors/overflow
  and no reduced-motion interaction canvas. Critical-log match count is zero.
- **Next action:** user performs final visual judgment on the deployed surface.
  Do not reopen the blue six-face object or historical Task 17/18 plans.
- Canonical report:
  `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/task-19-report.md`.

## Current canonical state — Task 17 blocked, no deployment (2026-08-14)

> **This section supersedes every next action and release-status statement
> below.** The physical-mobile gate is explicitly waived by the user, but the
> Task 17 local native gate is RED, so deployment has not started.

- Rollback/last fully accepted anchor is commit `6cd460c`. Task 16 has complete
  local release evidence and independent APPROVE.
- The uncommitted Task 17 working tree retains only the user-approved target
  constants (`70ms`, `5px`, `10px`, `.18`, ambient `.05`/`2px`/`8s`, empty
  `.27`) plus its test/docs evidence. The rejected `1.15` outward support and
  local/ambient phase-decoupling experiments were reverted; original Task 16
  wake geometry is restored.
- The untouched wake with stronger constants failed the real four-phase matrix
  at the right sample (`.07028 > .065`). The final bounded `1.15` hypothesis
  then failed the same-RAF recovery deadline: PNG completion `961.8ms > 900ms`,
  with `1,382` changed pixels and max delta `79`.
- Per the three-hypothesis/systematic-debugging stop rule, do not add another
  scalar shader tweak. Task 17 is **BLOCKED**, uncommitted and not deployable.
- User decision required: deploy the already reviewed Task 16 anchor, or approve
  an architectural redesign of Task 17 followed by a fresh full native/release
  matrix. The mobile waiver remains valid but does not waive local failures.
- **Decision received:** the user selected the Task 17 redesign and approved a
  single-texture dual-channel flow. RG/B retain velocity and geometry memory; A
  carries a pointer-centred signed visibility ripple. The composite separates
  refraction from visible contrast, and local channels reach exact visual zero
  at `700ms` while ambient motion continues. This is design-only until its new
  plan, RED/GREEN cycle and full release gates pass.
- **Task 18 result:** the single-texture dual-channel implementation is
  BLOCKED and fully reverted. Carrier-only native evidence was centred at all
  five positions (distance about `.002–.034`, locality `.999–1.0`), but the
  authored displacement and carrier still cancelled in the same RGB output;
  full matrices failed up to centroid `.12785`. Uniform carrier amplitude and
  a near-zero-luminance chromatic axis also failed. Focused cleanup is `11/11`
  and ports 3174–3179 are free. Do not retry another shader scalar.
- Continuing requires a separately approved overlay/pass architecture. It adds
  a GPU pass and therefore exceeds the approved single-texture/no-new-pass
  design. No Task 18 implementation commit or deployment exists.
- **Approval received:** the user approved one independent transparent overlay
  pass. It reuses the existing flow texture and canvas, adds no FBO/texture or
  owner, draws after the authored composite with `clear:false`, and is tracked
  by the renderer ledger. Task 19 may proceed directly through TDD and full
  release gates; deployment still requires GREEN evidence.
- Canonical evidence: `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/task-17-report.md`.
  No cloud sync, SSH, `.env` read, backup, ECS change or deployment occurred;
  port 3000 was untouched.

## Current canonical state — final fix complete with mobile blocker (2026-08-14)

> **This section supersedes every next action and release-status statement
> below.** The local release implementation is complete. Deployment is blocked
> only because no physical mobile performance run is available.

- `patchFollowPx4` now changes real local composite pixels through
  `uPatchFollowPx`; it is signed-x, `localAmount * layerWeight` bounded, capped
  at `4 CSS px`, and combined with local refraction under the existing `8 CSS
  px` vector cap. It does not translate the global title, camera or surface.
- Strict TDD was RED on the absent renderer/shader contract, then GREEN at
  `10/10`. The final production-vs-follow-disabled shader mutation proof changes
  `131,800` pixels and measures best energy registration at exactly `+4px`.
  Production diagnostics report `patchFollowPx=3.9385276665` and
  `refractionPx.x=7.8770553331`. A separate full-flow production-cap-8 versus
  cap-12 mutation changes `78,488` pixels and exposes exactly the forbidden
  extra `+4px`, proving the cap branch in rendered pixels. Full native matrix
  remains GREEN, including
  halo `1/16`, locality, layers, total cap, recovery, failure, context,
  visibility/offscreen, delayed init, unmount and Lab→Landing ownership.
- ADR-009 now Accepts the production OGL shared-surface exception and retires
  Canvas-only/Lab-only/no-Lab-chunk. It records exact static/reduced/failure
  behavior, continuous visible ambient RAF suspension, browser/ECS boundary,
  measured budgets and mandatory exact release/rollback refs.
- Fresh `/` build is `805 B / 132 kB First Load JS`; `/page` client JS/CSS is
  `461,103 B raw / 135,268 B gzip`, route-exclusive
  `119,866 / 35,935 B`; served optical plates total
  `2,485,771 B raw / 2,465,418 B gzip`.
- Installed headful Chrome `150.0.7871.187` selected unmasked WebGL2 D3D11
  `NVIDIA GeForce RTX 4060`, not SwiftShader/software. In the actual active RDP
  cadence (`31.2ms`, `~32.05Hz`), separate 15-second rest and continuous-pointer
  intervals each produced `480` frames, median `31.2ms`, p95 `31.9ms`, dropped
  `0`, fixed-full quality and DPR approximately `1`. This is not a 60Hz console
  claim.
- Final local gates are GREEN: focused `10/10`; Web `32 files / 237 tests`;
  typecheck; production build; Landing desktop/mobile normal/reduced/pointer;
  Lab full native; exact reduced static `952,176 B`; product release `27/27`.
  The release matrix must run immediately after a production build because the
  dev-based native gate replaces `.next`.
- **Only remaining blocker:** ADB is unavailable and safe read-only Windows
  portable/USB discovery found no connected physical mobile. Emulation is only
  supplemental. Do not deploy until a real mobile completes both prescribed
  15-second intervals. No speculative downshift was added without device-class
  evidence.
- See `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/final-fix-report.md`.
  No cloud, SSH, `.env`, backup or deployment operation occurred. All owned
  ports were released; port 3000 was not touched.

## Current canonical state — shared surface local release candidate (2026-08-14)

> **This section supersedes the pre-promotion instructions below.** Task 15 is
> complete only through local, independent-review-ready promotion. Nothing in
> this handoff records or authorizes an ECS deployment.

- `apps/web/components/optical-lab/AcceptedOpticalSurface.tsx` is the single
  accepted composition owner for the ordered energy/typography plates, semantic
  `Science evolves.` heading, hidden diagnostics and amplified
  `AssetInteractionMount`.
- Both the Landing Hero and exact asset Lab route consume that component with
  unique stage/diagnostics IDs. Landing deliberately owns the sole page `h1`;
  its kicker/context, SiteHeader navigation, Explore/Create CTAs, Open RO link
  and downstream Latest Research remain outside the shared visual and are not
  duplicated.
- Legacy `OpticalHeadline`/`OpticalField` files remain in the repository for a
  separately approved cleanup, but production `/` no longer imports or mounts
  that runtime.
- Fresh local gates are GREEN: focused Landing/Lab `45/45`; Web `236/236`;
  typecheck; production build; canonical root lint; Landing desktop/mobile and
  normal/reduced production matrix; product release `27/27`; exact Lab native
  pointer/touch/failure/lifecycle matrix; and byte-identical reduced-motion
  1672×941 capture (`952,176 B`). Visual inspection found no clipping,
  diagnostic leakage, focus residue, overflow or navigation/CTA regression.
- The SPA lifecycle contract now measures ownership across the promoted route:
  the old Lab canvas/resources/listeners dispose exactly once, then `/` owns one
  fresh Landing canvas and diagnostic snapshot. A delayed Lab initialization
  cannot overwrite or delete that new Landing owner.
- No task server is running. Owned 3010/3102/3131 and earlier worktree preview
  ports were released; unrelated port 3000 PID `33620` was not touched.
- **Next action:** independent review of the scoped source/docs/tests commit.
  Deployment preflight remains pending: choose release/rollback refs, run the
  approved local dry-run, ECS checkup and database backup, then deploy only in a
  separately authorized deployment turn. No `.env` read, cloud sync, SSH, ECS,
  backup or deployment occurred here. There is no schema, API, Nginx, Compose or
  topology change.

## Historical pre-promotion state — full-surface interaction

> **Supersedes every fixed-centre instruction in the historical appendix
> below.** The blue six-facet object, old procedural renderer, fixed `.58`
> interaction centre, central-only patch, 650ms recovery and “implement Tasks
> 11–13” are all stale. `.58` is now only an authored energy landmark.

- **Current goal:** user motion review of the completed full-surface layered
  fluid interaction at `/_visual/optical-lab?candidate=asset` on local preview
  port 3066. Static `Science evolves.` typography/energy/16:9 composition is
  already accepted and must not be regenerated or recomposed.
- **Implemented:** complete-stage low-amplitude ambient flow; pointer/touch
  local response at real x/y with `.14` stage-width radius; velocity-aligned
  `1.12 × 0.54` irregular feathered wake with no cursor-centred circular halo;
  layered response `energy > typography >= empty × 1.25`; signed velocity;
  accumulated wake;
  monotonic local recovery with visual inactivity by 900ms; reduced-motion,
  visibility/intersection, context/runtime failure and SPA cleanup.
- **Stable acceptance:** task-owned server `127.0.0.1:3113` used parent PID
  `53936` / listener PID `80740`. Final five complete isolated-browser matrices
  were exit 0 in `49.1/50.7/48.7/51.2/51.3s`; listener PID was unchanged each
  run, then the owned server was released. Final locality minimum `.998889`,
  all centroids within `.04`, layer means `15.770 > 7.787 > 6.712`, touch
  locality `.999951`, four ambient quadrants non-zero, recovered local pixels
  zero at `827.7ms` and follow exact zero at 900ms.
- **Engineering gates:** reduced-motion native frame equals the accepted fixture
  byte-for-byte with zero canvas/RAF; focused Vitest `35/35`, web typecheck and
  production build exit 0. Final review fix evidence: old radial mutation
  occupied `16/16` halo sectors; current wake occupies `3/16`; renderer-owned
  same-RAF readback completes its real nontransparent PNG at `850.1ms`
  (alpha/RGB `1571650/1568338`, recovered local `33/max9`); final layer means
  `11.816 > 8.002 > 3.133`. Final upper centroid `(.53217,.31360)` is distance
  `.0349` from input and halo remains `2/16` sectors. See
  `.superpowers/sdd/2026-08-11-optical-lab-high-fidelity-reconstruction-plan/task-13-report.md`
  for exact RED/GREEN and process evidence.
- **Safety:** intentionally dirty/uncommitted worktree
  `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3`, branch
  `codex/optical-editorial-v3`. Do not reset/delete, read `.env`, commit, deploy,
  change production `/`, touch ECS or stop unrelated port 3000.
- **Next action:** show the 3066 desktop preview and ask only accept / iterate /
  reject for motion. Automated acceptance does not authorize production
  promotion. Current verified production-preview listener PID is `20136`; `/`
  and the exact asset route are HTTP 200, asset-only marker is true and panel
  count is one.

> **Recovery evidence correction:** the earlier `762.3ms` compositor-copy PNG
> was all transparent because it copied WebGL outside RAF with
> `preserveDrawingBuffer:false`; do not reuse that evidence. Current capture is
> renderer-owned `readPixels` immediately after draw, and asserts nonzero
> ambient, active and recovered alpha/RGB before accepting recovery timing.

## Historical superseded record — preserve as evidence, do not execute

> **Fresh verification override (2026-08-13):** the deterministic mounted
> 18px/24ms browser assertion is timing-flaky because it reads the last RAF
> snapshot after a fixed 120ms timer. A controller rerun failed at `.3845`, and
> four repetitions produced `.4135` fail / `.4583` fail / pass / pass. Treat the
> earlier native-gate GREEN statement as superseded until an explicitly
> authorized bounded-condition-wait fix is implemented and repeatedly verified.

## Read This First: Single Current Task

The only current task for the next session is the user's visual review of the
implemented isolated Optical Lab asset candidate's central mixed-flow pointer
interaction on its single deployable candidate surface. Engineering
implementation is present, but the native motion gate has a known timing
flake; visual motion acceptance is still
pending.

Do **not** restart, reinterpret or substitute any of these historical tasks:

- do not work on the old blue six-facet object;
- do not tune the rejected procedural ray fan or old Candidate B renderer;
- do not regenerate, re-font or recompose the accepted resting
  `Science evolves.` visual;
- do not change production `/`, deploy ECS or begin production promotion.

The visual source of truth is
`apps/web/public/optical-lab/target-reference.png`. The accepted isolated result
is `/_visual/optical-lab?candidate=asset` in worktree
`E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3` on branch
`codex/optical-editorial-v3`.

## Current Goal

Show the implemented interaction at native size and obtain the user's explicit
accept / iterate / reject decision. If the user requests iteration, change only
the central motion response they identify; do not reopen the accepted resting
composition.

## User Decisions — Closed

- Resting visual: explicitly accepted at native 1672 × 941.
- Interaction family: mixed optical flow.
- Input region: whole Hero.
- Visible response: central seam only; no cursor halo or attraction field.
- Desktop/mobile: equivalent pointer and touch velocity behavior.
- Reduced motion: fully static accepted frame, no interaction context or RAF.
- Architecture: separate `AssetInteractionRenderer`, not modification of the
  rejected procedural Optical Lab renderer.

## Contract — Do Not Reopen

- Accepted resting pixels are immutable.
- Transparent WebGL2 overlay is empty at rest and renders only a feathered
  central replacement patch during input/recovery.
- Apparent patch follow ≤2 CSS px; local refraction ≤4 CSS px; caustic gain
  ≤8%; fixed aperture x=.58.
- Approximately 120ms monotonic response; no bounce; exact zero and inactive
  RAF by 650ms.
- Particle evidence may bend only along the existing positive-x field. No
  radial cursor mask, ring, symmetric fan, broad haze, rectangular patch edge,
  duplicate ink or whole-title drift.
- One selectable semantic `h1` remains exact `Science evolves.`; the decorative
  canvas is `aria-hidden` and pointer-transparent.
- WebGL2 failure, context loss and reduced motion expose the accepted static
  frame without layout or visual change.

Canonical details are in
`docs/specs/2026-08-11-optical-lab-high-fidelity-design.md`, sections
“2026-08-13 Accepted Asset Interaction Amendment” and “2026-08-13 Asset
Presentation and Perceptibility Iteration”. Both sections are implemented; the
user explicitly confirmed the architecture and every behavior choice. Dynamic
visual acceptance remains pending.

## Done

- Corrected earlier task drift from the blue object/procedural field to the
  real target reference.
- Generated and promoted
  `apps/web/public/optical-lab/energy-plate-black-alpha-v1.png` without an API
  key.
- Integrated exact `candidate=asset` routing and kept the default Lab and
  production homepage isolated.
- Corrected typography coupling: full target central typography/effect plate,
  independent full-height energy plate and transparent selectable DOM title.
- User visually accepted the resting candidate.
- Browser/contract safeguards cover exact query isolation, RGBA dimensions,
  no client/GPU mount in static asset mode, semantic selection and process
  cleanup.
- Added the focused implementation addendum to the existing high-fidelity plan.
- Implemented a pure bounded response model, lazy `AssetInteractionMount`,
  separate OGL `AssetInteractionRenderer`, fixed-seam 96 × 54 flow pass and
  feathered composite shader without changing the old procedural renderer.
- Added honest browser coverage for pointer left/aperture/right, touch drag,
  reduced motion, context loss, exact 650ms recovery, outer-pixel identity and
  process cleanup.
- Fixed the browser-discovered GLSL ES reserved-word failure (`patch` →
  `patchMask`) and retained a CSS compositor feather boundary.
- Closed independent-review findings: leftward input can no longer reverse the
  authored positive-x field; initialization/runtime/context/unmount paths now
  prove canvas/listener/RAF/OGL cleanup; and the primary rest gate renders a
  real 1672 × 941 stage against a committed accepted-baseline fixture.
- Replaced the exact asset query's three-panel comparison shell with one
  centered, uncropped 16:9 candidate figure (maximum width 1672px), one
  semantic heading and one compact keyboard-visible exit link. Target/current
  figures and captions remain on every non-asset Lab route; diagnostics remain
  in the asset DOM but are visually hidden.
- Added a deterministic mounted browser gesture with PointerEvent samples
  exactly 18 CSS px and 24ms apart. Velocity deltas use `event.timeStamp` while
  the renderer envelope retains its performance clock; published follow reaches
  at least .5 at the 120ms response point without changing any cap or outer
  accepted pixels.

## Latest Evidence

- Web Vitest: `32 files / 237 tests` passed.
- Focused interaction + contract: `35/35` passed.
- Web typecheck: passed.
- Interaction browser gate and original static asset capture: passed; ports
  3065 and 3063 were released. The temporary responsive check also released
  port 3066.
- Fresh production build: passed; `/` remains `3.87 kB / 112 kB`.
- Asset-only desktop/mobile browser evidence: one panel, one heading, one exit,
  zero comparison captions, hidden diagnostic DOM retained, no horizontal
  overflow, contained plates and a visible 2px focus outline at 1672×941 and
  390×844.
- Rest and recovered candidate PNGs are byte-identical; atomic active-frame
  pixels outside the central seam patch equal rest.
- Native baseline fixture:
  `apps/web/test/visual/fixtures/optical-lab-asset-accepted-1672x941.png`.
- Native title band, headline core and first-`e` seam comparison against the
  target: mean absolute RGB error `0`, max `0`.
- Motion evidence is in the ignored
  `apps/web/test/visual/out/optical-lab/asset-interaction/` directory.

### Timing-flake override — current verification truth

The mounted 18px/24ms assertion now RAF-polls the real published global until
follow reaches .5, bounded at 500ms with latest-snapshot diagnostics. Exact
event timestamps, 180ms wall-clock separation, caps, central-only pixels,
recovery and all lifecycle cases remain unchanged; the gate does not import the
mapping helper.

The follow condition passed on multiple full native runs (ports 3067, 3068,
3071, 3072 and 3073) and did not fail after this repair. Five consecutive clean
runs could not be obtained because the owned Next dev/full gate repeatedly
failed outside the follow assertion: reload/global loss, startup 500, one
ArrayBuffer allocation failure, one existing unmount canvas-remove observation
failure, and process-exit hangs after ports 3065/3074 stopped listening. The
best streak was three consecutive exit-0 runs (3071–3073); 3074 then hit its
120s ceiling and left an owned process, which was precisely validated and
stopped. Stable five-run native GREEN is blocked by local gate infrastructure
and is not claimed.

## Deferred Promotion Minors

These do not block the isolated Lab's user dynamic-visual review, but must be
closed before commit or production promotion:

- make the pre-normalization desktop/mobile actual-layout checks durable in a
  browser gate; the existing native interaction gate intentionally normalizes
  to 1672×941 for exact pixel evidence;
- clear `window.__OPENSCIENCE_OPTICAL_ASSET_INTERACTION__` after SPA unmount.
  Canvas, WebGL resources, RAF and owned listeners already clean up correctly;
  only the diagnostic global currently survives with its disposed snapshot.

## Working Tree and Safety

The worktree is intentionally dirty and uncommitted. Preserve all existing
changes and untracked files; do not delete or reset them. Relevant paths include:

- modified route wrappers, Optical Lab page/component/CSS and contract test;
- untracked interaction component, model, OGL renderer/flow/shaders, unit test
  and browser gate;
- modified active spec, plan, progress, index and historical handoff;
- untracked approved PNG and asset capture script;
- untracked `tmp/` image-generation and local inspection evidence.

No production or ECS writes are authorized. Do not read `.env` or retry the
failed API-key path. Do not commit unless the user separately asks.

## Next Session: Exact Execution Order

1. Work only in `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3`.
2. Read `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → this
   handoff → the active spec amendment → `docs/progress.md` →
   `project_index.md`.
3. Open exact `/_visual/optical-lab?candidate=asset` locally at native size;
   this is now the single candidate surface. Let the user inspect mouse and
   touch-equivalent central motion.
4. Ask only for accept / iterate / reject. If iterating, reproduce the named
   motion defect with the existing browser gate before changing code.
5. Even after visual acceptance, stop. Production promotion, commit and ECS
   deployment are separate actions requiring explicit user authorization.

Suggested skills: `using-superpowers`, `writing-plans`, `executing-plans`,
`test-driven-development`, `frontend-design`, `architecture-guard`,
`test-gate`, `verification-before-completion`, `requesting-code-review` and
`docs-sync`.
