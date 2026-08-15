# Optical Editorial Visual Release Runbook

## Purpose

This gate proves that the eight canonical product surfaces remain coherent, keyboard-operable, responsive and within explicit runtime budgets. It is a release signal, not a screenshot generator for automatically accepting visual changes.

## Canonical Command

From the repository root:

```powershell
npx pnpm@9.15.0 --filter @openscience/web build
npx pnpm@9.15.0 --filter @openscience/web test:release
```

The release config starts the production Next server and a local, no-user-data API fixture for server-rendered Public RO and Collection routes. Authenticated client surfaces use Playwright route fixtures. ECS acceptance must use real production services instead.

## Coverage

The source of truth is `apps/web/test/visual/product-release-manifest.mjs`.

- Surfaces: Landing, Workspace, Public RO, Auth, Dashboard, Evidence Intake, Explore and Ultrafast Science Collection.
- Viewports: 1440×900, 1920×1080 and 390×844.
- Reduced motion: Landing at all three viewports.
- Named states: accepted optical resting/reduced, proposal ready, published reading, request code, approval ready, mixed evidence, launch corpus and selected media.

Every case requires:

- exactly one `main` and one `h1`;
- no horizontal overflow or browser/page errors;
- accessible names for visible form controls;
- a keyboard focus path, including skip-link focus where present;
- LCP/fallback content-ready time no greater than 4000 ms;
- transferred resources no greater than 3.5 MB;
- no more than 1800 DOM nodes.

The accepted Landing build additionally records its exact manifest and optical
asset budget. The 2026-08-14 release candidate measures `/` as `805 B / 132 kB`
in Next's route table, `461,103 B` raw / `135,268 B` gzip for all route
client/CSS files, and `119,866 B` raw / `35,935 B` gzip route-exclusive to the
root layout. The two served optical PNGs total `2,485,771 B`. Rebuild and
remeasure these values for any later optical/runtime change; do not copy the
numbers forward as estimates.

## Determinism

The Landing release case requires exactly one `AcceptedOpticalSurface`, one
semantic `h1`, the accepted plate order and no legacy Optical Field runtime. It
waits for network idle and local fonts, uses stable demo identifiers, and pauses
CSS/Web Animations before capture. The focused `test/visual/shots.mjs` gate also
checks desktop/mobile normal and reduced states, exact accepted reduced pixels,
navigation/CTA/focus behavior and a bounded pointer response from the amplified
asset interaction.

Do not add query-string backdoors, production demo accounts or stored credentials for visual testing. Do not read `.env` in the fixture server.

## Evidence

Local evidence is written below `apps/web/test/visual/out/product-release/`, which is ignored by Git. CI uploads screenshots, the HTML report and failure traces as the `optical-editorial-release-evidence` artifact for 14 days.

Ordinary pull requests must never rewrite or approve baselines automatically. A visual change requires reviewing the generated desktop, wide and mobile evidence and recording the decision in `docs/progress.md`.

## Manual Aesthetic Gate

Reject the release if any canonical screenshot shows:

- generic AI card grids, excessive pills, blue-purple gradients or decorative glass panels;
- clipped hero typography, broken optical aperture alignment or a missing Open RO transition;
- public reading that resembles a dashboard instead of a citable paper;
- workspace planes that collapse into an undifferentiated single column on desktop;
- placeholder copy, fake metrics, empty media without an honest state, or inconsistent surface color;
- visible test focus, debug overlays, horizontal scrolling or materially smaller mobile functionality.

Local release acceptance does not imply deployment. A later, explicitly
authorized ECS turn must repeat the public Landing/reduced/pointer checks with
real production services before the promoted surface is described as deployed.

## Physical GPU Gate

Before deployment, use an installed non-headless Chrome/Chromium and record the
unmasked WebGL renderer. SwiftShader, llvmpipe or another software renderer does
not satisfy the physical gate. Record separate 15-second resting and 15-second
continuous-pointer intervals with median/p95 frame time, cadence-relative
dropped frames, active quality and DPR.

Acceptance is relative to the actual visible display/session cadence:
`median <= 1.25 × cadence`, `p95 <= 2 × cadence`, and dropped frames no greater
than 1% of cadence-expected frames. Record the display path explicitly when a
remote display limits cadence; do not present it as a local-console refresh.

Run the same intervals on a connected physical mobile. ADB/device emulation is
supplemental only. If no physical mobile is safely discoverable, stop before
deployment and record that blocker; do not replace it with an emulated result.
Add an adaptive/DPR downshift only when physical measurements show that a real
device class misses the thresholds.

Release-specific exception: the product owner explicitly accepted unavailable
physical-mobile evidence for the 2026-08-14 Task 19 optical overlay release and
renewed that risk acceptance for the directly continued Task 20, Task 21 and
Task 22 optical-motion releases. On 2026-08-15 the product owner explicitly
renewed the same unavailable-physical-mobile risk acceptance for Task 23 after
reviewing the final local production preview. Deployment is authorized only after every
other release gate passes. The waiver does not convert emulation into physical
evidence and does not apply beyond Task 23 unless renewed again.

## Failure Handling

1. Keep the task in progress and retain the trace/artifact.
2. Identify whether the failure is product behavior, test determinism, an upstream service or a budget regression.
3. Fix the root cause; do not raise a budget or remove a route merely to make CI green.
4. Rebuild and rerun the full 27-case matrix.
5. Synchronize the plan, progress, project index and handoff before committing.
