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
