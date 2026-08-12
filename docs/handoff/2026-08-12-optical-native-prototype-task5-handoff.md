# Handoff — 2026-08-12 Optical native prototype after Task 5

- **Current goal:** Continue the isolated Three.js prototype with Task 6 only:
  restrained selective Bloom and a center-local chromatic aberration pass.
- **Workspace:** `E:/Miscellaneous/XGS/.worktrees/optical-native-prototype` on
  branch `codex/optical-native-prototype`; tracked worktree was clean at this
  handoff.
- **Current commits:** Task 5 implementation `df5bba5`; Task 5 docs checkpoint
  `27527f0`. Task 1–5 and the seam-anchor geometry repair are complete.

## Done

- Default rendering is a continuous GPU `outlinePath` title, not a full-line
  5px particle font. The 4,619-point title grid is debug-only.
- The default particle draw contains 508 seam-local glyph points and 1,305
  independent curtain points. The fixed field combines radial convergence,
  weaker signed tangent and rightward emission around `(0.573, 0.50)`.
- Fixed 1672x935 evidence is at
  `apps/web/test/visual/out/central-particle/task-5-field-1672x935.png`.
  Exact metrics and RED/GREEN history are in the ignored Task 5 report under
  `.superpowers/sdd/2026-08-12-optical-native-particle-prototype-plan/`.
- Production-start browser coverage includes fixed `uTimeMs=1500`, subtle
  pointer response, 800x1000 and 1672x800 resize, fresh-context restoration,
  dynamic-to-static cleanup, mobile/reduced SVG fallback and real invalid GLSL
  fail-closed behavior. Port 3062 closes after the gate.
- Independent review initially found three Important issues. CPU/GLSL parity,
  lazy shader failure propagation and partial title rollback were fixed with
  RED/GREEN evidence; narrow re-review returned 0 Critical / 0 Important and
  APPROVE.

## Verification state

- Task 5 focused suite: 5 files / 56 tests GREEN.
- Web typecheck, production build, root lint/workspace/docs-sync, docs lint and
  production Task 5 browser matrix: GREEN.
- Production `/` remains 3.87 kB / 112 kB First Load and has no prototype
  import.
- Full Web currently reports 250 pass / 2 known baseline failures: the Landing
  source test hard-codes LF while this Windows checkout uses CRLF; two old OGL
  MSDF JSON working-tree hashes differ from their manifest while font/PNG hashes
  remain valid. Do not mix these unrelated repairs into Task 6.
- Root workspace typecheck remains blocked outside Web by the existing
  `packages/observability` generated Prisma client mismatch (`Prisma` export
  absent).

## Constraints

- Do not modify the production Hero, `/`, the OGL Lab or deployment during
  Task 6.
- Do not read or print `.env`; do not delete files.
- Use `postprocessing@6.39.4` directly. Do not add R3F,
  `@react-three/postprocessing`, GSAP, ControlKit, glslify, tsParticles,
  particlesGL or hosted runtimes.
- Add exactly selective Bloom plus one locally masked chromatic-aberration
  effect. No vignette, grain, glitch, depth of field, god rays or global grade.
- Center mask must stay below 12% of stage width. Mobile/reduced modes disable
  effects. Composer, passes and targets require exact resize/dispose ownership.
- Keep fixed-time effects-on/off captures honest. Do not improve metrics by
  brightening the entire frame or separating colour outside the center mask.

## Next action

Execute Task 6 from
`docs/superpowers/plans/2026-08-12-optical-native-particle-prototype-plan.md`:

1. Read the current renderer lifecycle and `postprocessing@6.39.4` APIs.
2. Write `central-particle-postprocessing.test.ts` RED for exactly two effects,
   selective seam membership, local mask `<12%`, mobile/reduced disablement and
   exact composer/pass/target cleanup.
3. Implement `postprocessing.ts` and the local aberration shader only after the
   intended RED; then add equal-state effects-on/off browser evidence.
4. Stop before Task 7, Hero integration or ECS deployment unless the Task 6
   review and gates are complete.

## Read first

1. `AGENTS.md`
2. `docs/OpenScience_Kimi_Development_Spec.md`
3. `docs/specs/2026-08-12-optical-native-particle-prototype-design.md`
4. `docs/superpowers/plans/2026-08-12-optical-native-particle-prototype-plan.md`
5. `docs/progress.md`
6. `project_index.md`
7. This handoff and the ignored Task 5 brief/report/SDD ledger

Recommended skills for the next session: `using-superpowers`, `brainstorming`
only to reconfirm the already-approved Task 6 boundary, `executing-plans`,
`architecture-guard`, `frontend-design`, `test-driven-development`,
`requesting-code-review`, `test-gate`, `verification-before-completion` and
`docs-sync`.
