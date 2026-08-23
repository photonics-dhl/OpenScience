# Task 21.5 CSS / E2E release blocker report

Date: 2026-08-23

Branch / base: `codex/hermes-wanko-live2d` / `46cc5b2`

Scope: CSS, Dashboard and field-guide browser contracts, and the exact blank-RO Create submit. No composite travel-path or dock-state change; no deployment.

## Result

The four reported release regressions now pass their focused browser contract. A new same-history browser regression proves that the exact protected Create CTA triggers an actor replan, but the final guide bubble DOM footprint still covers the button. Per integration direction this planned-vs-rendered composite mismatch remains RED for the guide worker; this slice does not widen into the composite planner.

## RED to GREEN evidence

1. Dashboard protection: RED was an obsolete exact count of three against the real semantic primary navigation plus continuation, import and task rail. The contract now names and verifies all four semantic regions before and after reload, while allowing additional protected regions. GREEN in the focused run and the 25-test owned E2E run.
2. Reduced mobile guide: RED at 390x844 because the generic 200px-stage rule hid functional guide actions. CSS now hides only autonomous performance actions; Explain stays visible and operable. A real expanded-content geometry assertion first exposed the motion pill covering copy; reserving a compact control row made it GREEN without hiding the function.
3. Suppressed guide motion control: RED because the healthy floating hide selector overrode the suppressed-state visibility rule. The healthy selector now excludes suppressed guidance, while reduced/fallback/suppressed states show the control and normal healthy floating guidance keeps it hidden. GREEN.
4. Visible Hermes entry: RED because guide-target CSS disabled both the carrier hit surface and its pseudo surface. The full element remains pointer-transparent; a guide-only, visible torso/lamp core pseudo target owns the real click, opens the drawer exactly once, and leaves title, workspace and file controls page-owned. GREEN. Ordinary autonomous hit geometry remains unchanged at `inset: 12% 12% 14%`, preserving cap/lamp and whole-character drag coverage.
5. Create CTA protection follow-up: the same Dashboard -> blank-RO SPA history was RED with the Create center owned by Hermes. The real submit now has `data-hermes-protected="true"`. A new test waits for `guide-arrive` before judging the settled result.

## Remaining RED: composite planned footprint differs from final DOM

Stable 1920x1080 evidence after the protected observer has run:

- protected count: 1 (the real Create submit); `guide-motion=travel`; `action=guide-arrive`; `guide-suppressed=false`.
- stage: `(1509.02, 661.34) .. (1869.02, 1021.34)`.
- native travel/actor hull: `(1551.10, 703.30) .. (1826.23, 971.26)`; this part correctly avoids Create.
- guide bubble: `(1517.02, 558.39) .. (1765.02, 681.34)`.
- Create: `(1425.52, 565.19) .. (1648.00, 613.19)`.
- Create center resolves to the bubble's `<p>`, not the interaction hull or the button.

Thus the protected CTA is observed and the actor replans, but the selected composite bubble footprint does not match its final CSS DOM placement. The acceptance test is `field guidance leaves the primary blank-RO create action directly operable`. `test:hermes-work-assistant` independently remains RED at 1920x1080 on the real Create hit assertion. Fixing this belongs in the composite guide geometry worker; collision rules and ordinary interaction coverage were not weakened here.

## Browser and verification commands

- `playwright ... --grep "Dashboard protects semantic|reduced motion retains|fully obstructed guide|creation guidance advances" --workers=1`: **4/4 passed**.
- Dashboard + field-guide specs with only the new settled-Create regression excluded: **25/25 passed**.
- `test:hermes-live2d`: **passed**; native whole-character motion/coverage gate remains green.
- focused Vitest, `hermes-performance-bubble` + `surface-shells`: **14/14 passed**.
- `npx pnpm@9.15.0 --filter @openscience/web build`: **passed**, 18 static pages generated.
- `npx pnpm@9.15.0 --filter @openscience/web typecheck`: **passed**.
- ESLint on the changed TS/TSX files: **passed**.
- `git diff --check`: **passed** (only Git's existing LF-to-CRLF notices).
- `test:hermes-work-assistant`: **RED**, 1920x1080 real Create action intercepted during the composite guide sequence.
- `test:hermes-companion-release`: started and completed the Live2D/performance phase, then was intentionally stopped on integration direction rather than waiting through the known browser RED; it is not claimed green.

## Screenshot inspection

`apps/web/test/visual/out/hermes-field-guide/reduced-guide-390x844.png` was regenerated and inspected at original 390x844 resolution. The first image showed the motion pill covering expanded Explain copy and was rejected. The post-fix image keeps the title field clear and reserves a distinct bottom control row; Explain remains legible and actionable. The composition is intentionally dense but has no measured copy/action/dismiss overlap. No new desktop screenshot is claimed because the remaining 1920 composite bubble overlap is a release blocker.

## Changed files

- `apps/web/app/globals.css`
- `apps/web/app/research-objects/new/page.tsx`
- `apps/web/test/e2e/hermes-dashboard.spec.ts`
- `apps/web/test/e2e/hermes-field-guide.spec.ts`
- `.superpowers/sdd/2026-08-19-hermes-wanko-live2d-plan/task-21.5-css-release-fix-report.md`

## Self-review and concerns

- No force click, broad click-through, reduced collision clearance, full-stage transparent hit plane, travel-path change, or dock-state change was introduced.
- The guide-specific core remains at least 44px and aligns with visible Wanko art; the ordinary hit plane still covers the measured native alpha envelope.
- The exact Create protection is correct and independently observable, but it exposes rather than repairs the composite planned-vs-DOM mismatch. Release remains blocked until the new settled regression, work-assistant gate, and full companion release are green.

## Fix Round 2 — mobile editor action geometry and explanation contrast

Date: 2026-08-24

Base: `47b57da fix(web): align Hermes guide planning with live geometry`

This round supersedes the earlier composite-mismatch concern above: the guide geometry fix at `47b57da` made the settled Create regression, work-assistant gate, and companion release green. This scoped follow-up changed only `globals.css`, the field-guide browser contract, and this report; it did not touch the planner, Stage, ordinary interaction hull, 360/200 stage sizes, or Create protection.

### Review findings and TDD evidence

1. Mobile editor actions: the new 390x844 editor journey selected `sdf-insight`, expanded the functional guide, and failed against the old CSS because all three action targets were only 40px high (`Expected >= 44; Received 40`). The mobile functional action row now uses three equal grid columns with compact gaps; every Explain/Draft/Check target is at least 44x44, remains inside the bubble, and is disjoint from its peers. The real Insight textarea remains unobstructed and was clicked and focused without force.
2. Explanation contrast: the same test read browser computed styles and failed against the old `#52616e` foreground on `rgba(12, 15, 14, .97)` at `3.020997:1`. The explanation now uses the existing `--os-muted-dark` token (`#b6bcb6` fallback), producing approximately `9.96:1`, above the 4.5:1 normal-text threshold.
3. Expanded layout: the contract proves the main guide copy, dismiss control, three actions, explanation, and reduced-motion pill do not overlap. The explanation remains within the measured bubble bounds. The functional bubble receives only the compact mobile padding needed for the three controls; autonomous performance actions remain hidden at 200px as before.

### Original-resolution visual inspection

`apps/web/test/visual/out/hermes-field-guide/mobile-editor-actions-390x844.png` was generated and inspected at original 390x844 resolution. The bubble is a compact 192px editorial panel: three equal actions form one clear row, the explanation reads as a muted high-contrast secondary paragraph, and the motion pill occupies its own bottom reserve. The dismiss mark, title/copy, action row, explanation, tail and motion pill remain visually separated. Wanko stays the anchor beneath the panel while the Insight editor and bottom workspace navigation remain legible and operable; the guide does not expand into a second page-sized surface.

### Fresh gates

- Focused mobile editor browser test: **1/1 passed**.
- Full `hermes-field-guide.spec.ts`: **8/8 passed**.
- `test:hermes-work-assistant`: **passed**.
- `test:hermes-companion-release`: Live2D/performance/geometry/motion gates plus product E2E **26/26 passed**.
- Web unit/contract suite: **55 files, 375 tests passed**, plus Node asset/export contracts **5/5 passed**.
- Web build: **passed**, 18 static pages generated.
- Web typecheck: **passed**.
- ESLint on the changed browser contract: **passed**.

### Fix Round 2 concerns

- No known issue remains in this mobile CSS/E2E slice.
- The separate architecture review findings about transition-end replanning and temporary visual-viewport recovery belong to the planner/Stage owner and were intentionally not changed here.

## Fix Round 3 — atomic guide perimeter and rendered contrast

Date: 2026-08-24

Base: `ca3f3fd fix(web): bound Hermes guide replanning`

This round is limited to guide-target pointer geometry, its browser contract, and this report. It does not change the planner, Stage, 360/200 stage sizes, or the ordinary autonomous interaction plane (`inset: 12% 12% 14%`).

### RED to GREEN evidence

1. Guide perimeter: the prior test measured the travel hull and bubble in separate asynchronous browser calls, then classified perimeter points after the active `guide-travel` animation had moved the stage. It reproduced six apparent Hermes-owned exterior samples, including approximately `(325.5, 388.8)`, `(325.5, 432.8)`, `(325.5, 476.8)`, `(237.5, 388.8)` and `(281.5, 388.8)`. Diagnostic frames showed the measured travel rect had moved from about `(1.23, 418.61)..(290.28, 700.90)` to `(141.36, 272.93)..(428.00, 552.74)` before hit-testing. The contract now measures the stage, visible travel hull, visible bubble, perimeter points and `elementFromPoint` ownership synchronously in one browser frame. The guide-only core was conservatively reduced from `inset: 30% 30% 22%` to `32% 32% 24%`. GREEN: every exterior sample is page-owned.
2. Visible guide entry: the desktop atomic audit reads the actual pseudo-element target size and measured approximately `129.6 x 158.4`, above 44x44. A real center click opens the Hermes drawer and increments the invocation count exactly once. The title, select, files, Create action and other page-owned controls remain directly clickable; no force click or broad transparent hit surface is used.
3. Rendered contrast: the mobile browser contract now composites the computed `rgba(12, 15, 14, .97)` bubble background over the first non-transparent page background before calculating WCAG contrast. This corrects the Fix Round 2 wording: the resolved existing token is `#9b9d98`, not the documented fallback `#b6bcb6`, and the measured rendered contrast is about `7.03:1`, not `9.96:1`. It remains above the required 4.5:1.
4. Cross-worker RED verification: on a fresh production build/server, `test:hermes-work-assistant` passed, so the reported missing zh `editor.common.cancel` key did not reproduce. `test:hermes-live2d` also passed, so the reported RO-create motion surface count of zero did not reproduce. Neither area was changed in this scoped round.

### Fresh gates

- Focused source-import perimeter/entry browser test: **1/1 passed**.
- Focused mobile rendered-contrast browser test: **1/1 passed**.
- Full `hermes-field-guide.spec.ts`: **9/9 passed**.
- `test:hermes-work-assistant`: **passed**.
- `test:hermes-live2d`: **passed**, including native-alpha interaction coverage and whole-character drag behavior.
- `test:hermes-companion-release`: Live2D/performance/geometry/motion gates plus product E2E **27/27 passed**.
- Web unit/contract suite: **55 files, 375 tests passed**, plus Node asset/export contracts **5/5 passed**.
- Web production build: **passed**, 18 static pages generated.
- Web typecheck: **passed**.
- Owned ESLint, root lint/docs-sync, and `git diff --check`: **passed**.
- ESLint on the changed TypeScript browser contract: **passed**; CSS has no configured ESLint parser and was reported as ignored rather than failed.

### Visual and self-review

No screenshot was regenerated because the only CSS change affects an invisible guide-only pointer pseudo-element; visible layout, paint, typography and the previously inspected 390x844 composition are pixel-unchanged. The prior original-resolution screenshot remains `apps/web/test/visual/out/hermes-field-guide/mobile-editor-actions-390x844.png`.

- The browser gate now judges geometry and ownership from one atomic rendering frame, so moving guide art cannot produce stale-coordinate false positives.
- The guide core stays visibly aligned and accessible while transparent exterior points remain page-owned. Ordinary autonomous alpha coverage is unchanged and independently green in the motion gate.
- The two separate architecture-review findings concerning transition-end replanning and temporary visual-viewport recovery remain with the planner/Stage owner and were intentionally not touched.

## Fix Round 4 — mobile pointer evidence clarification

Date: 2026-08-24

Base: `2304305 fix(web): make Hermes guidance lifecycle deterministic`

- The real 390x844 editor-guide scenario now reads the guide interaction `::after` computed inset and pseudo-element dimensions. It asserts the mobile target is at least 44x44 and that `elementFromPoint` at its derived center is owned by the interaction hull. This is the separate mobile evidence for the approximately `72 x 88` target; the desktop perimeter audit did not measure it.
- The atomic perimeter test classifies visible art using the travel hull's bounding rectangle plus the visible guide-bubble rectangle. It is an ownership/perimeter contract, not an invented native-alpha mask. Native-alpha envelope coverage remains separately enforced by the Live2D artifact/motion gate.
- No production CSS or visible layout changed in this round, so no screenshot was regenerated. The existing original-resolution 390x844 inspection remains applicable.
- Static validation passed: Playwright discovered the focused 390x844 test, owned ESLint passed, and `git diff --check` passed. The focused browser attempt did not reach the new assertion because the local Next dev server spent the full 60-second Playwright startup window compiling the editor route; the subsequent direct route probe also timed out before returning HTTP. This is recorded as an environment/startup limitation, not claimed as a browser GREEN run.

## Fix Round 5 — atomic behavior/speech ownership and pointer intent

Date: 2026-08-24

Base: `b1fadc7`

### RED to GREEN evidence

1. Atomic semantic owner: the 250ms loop enqueued `setBehavior(next)` and then stepped speech from an effect-lagged `behaviorRef`, allowing a newly rendered action to coexist briefly with the previous action's beat. Pointer transitions updated only behavior and left cue reconciliation to a later timer. A new pure performance director now selects the next behavior and steps speech from that exact snapshot, while `HermesWorkspaceStage` commits `{ behavior, speech }` as one React state value. RED was the absent atomic transaction contract; GREEN is three focused unit cases covering a task-state tick plus hover and press cue invalidation. The browser gate samples consecutive animation frames during autonomous speech, hover enter, primary press and hover leave; every visible beat is either absent or begins with the same frame's action identity, and no frame has multiple visible performance owners.
2. Pointer intent: the old `onPointerDown` accepted every button and secondary pointer, overwrote `dragRef`, captured it and could invoke the drawer. RED browser evidence showed a right click incrementing `data-hermes-invoke-count` from 0 to 1 and opening the drawer. The handler now rejects `!event.isPrimary` and `event.button !== 0` before changing restore, drag or capture state. GREEN proves right click and secondary touch do not invoke/capture, a secondary touch cannot replace an active primary drag, and primary left drag/click still work; the focused browser test passed five consecutive runs.
3. Atomic Create ownership: the work-assistant gate no longer caches a pre-settlement bounding box or point. It scrolls the real mobile Create control into view, then one browser `waitForFunction` task requires `guide-arrive`, `guideReady=true`, phase `route` or `edge-stop`, and the real protected attribute before returning fresh Create/actor/bubble/travel rectangles plus `elementFromPoint` at the current Create center. The first post-change 390 run correctly diagnosed the control at y=1213..1262, outside the 844px viewport, rather than misclassifying it as Hermes interception. After real `scrollIntoViewIfNeeded`, the complete three-viewport gate passed without force click or a longer timeout.

### Fresh gates

- Atomic director/beat/behavior focused unit tests: **18/18 passed**.
- Pointer browser RED reproduced, then focused GREEN **1/1** and repeat **5/5**.
- Full `test:hermes-work-assistant`: **passed** at 1440x900, 1920x1080 and 390x844.
- Canonical self-starting `test:hermes-companion-release`: Live2D/performance/geometry/motion plus product browser suite **36/36 passed**.
- Web unit/contract suite: **56 files, 384 tests passed**, plus Node asset/export contracts **5/5 passed**.
- Web production build: **passed**, 18 static pages generated.
- Web typecheck: **passed**.

### Self-review and concerns

- No geometry, guide lifecycle, stage sizing, ordinary hit plane, visual styling or translation changed. There is no screenshot delta.
- The atomic helper is a web-internal Hermes module and does not alter app/package dependency direction.
- Separate review findings for stationary obstacle collection and edge-stop/fallback measurement remain with the geometry owner and were intentionally not touched here.
