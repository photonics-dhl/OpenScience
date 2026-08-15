# Task 13 Handoff — Figma Canonical

## Status

Task 13 is complete. The long-term project account owns the canonical Figma file `gjhowMG7cG4clKwvhvF08E`; OAuth identity, Full seat, writes, screenshots and read-back audits passed.

## Completed

- Added an isolated V3 namespace: 44 Web-scoped variables, 9 text styles and 3 effects.
- Added foundations specimens for color, typography, grids, motion and reduced motion.
- Added four real component sets mapped to existing React primitives.
- Added Landing, Workspace, Public, Auth, Dashboard, Intake, Explore and Collection structural frames.
- Preserved old pages and components; no destructive migration was performed.
- Registered all IDs and runtime limits in `docs/design/optical-editorial-figma-map.md`.

## Decisions

- Browser code is the visual/runtime source of truth; Figma is the structural design map.
- Canvas Optical Field, i18n labels, callbacks, native uploads and API-derived states remain browser-owned.
- The old temporary-account file is historical migration material and must not receive future canonical writes.
- Code Connect entitlement limits do not justify fake mappings or block implementation.

## Next

Execute Task 14 in `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3`:

1. Replace scattered screenshot scripts with a canonical route/state/viewport manifest.
2. Make Canvas time/seed, font readiness and network settling deterministic.
3. Add reduced-motion, keyboard/focus, accessibility and performance budgets.
4. Run full repository quality gates and a manual 1440/1920/390 aesthetic review.
5. Commit `test(web): install product visual release gate`, then proceed to ECS Task 15.

## Safety

Do not read or print `.env`. Do not include Figma OAuth/session material in logs or docs. Server deployments must use the project SSH/deploy scripts and retain rollback evidence.
