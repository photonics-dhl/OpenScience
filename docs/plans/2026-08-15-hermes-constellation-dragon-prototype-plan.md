# Hermes Constellation Dragon Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and render a deterministic Blender feasibility prototype of the approved young constellation dragon before any runtime integration.

**Architecture:** A Vitest contract consumes a compact inspector and a Blender-emitted manifest. A single Blender Python builder owns geometry, materials, scene, four review poses, `.blend`, manifest and renders; no product component imports the prototype.

**Tech Stack:** Blender 4.5.12 Portable on E:, Blender Python API, Node.js PNG-header inspection, Vitest.

## Global Constraints

- Blender executable, caches and temporary outputs stay on E:.
- Do not reuse the rejected robot geometry or third-party character assets.
- Do not touch production UI, API, database, auth, deployment or `.env`.
- Keep exactly six evidence nodes, at most six materials and at most 80,000 triangles.
- Stop after static feasibility evidence; six-state animation and GLB are a separate user decision.

---

### Task 1: RED asset contract and deterministic Blender builder

**Files:**
- Create: `apps/web/scripts/hermes/inspect-constellation-dragon.mjs`
- Create: `apps/web/test/hermes-constellation-dragon-asset-contract.test.ts`
- Create: `apps/web/scripts/hermes/build-constellation-dragon.py`
- Create: `apps/web/assets/hermes/HermesConstellationDragon.blend`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-manifest.json`

**Interfaces:**
- `inspectConstellationDragon(rootDir): Promise<DragonAssetReport>` reads the generated manifest and PNG IHDR headers.
- Blender builder accepts `--output-root <apps/web absolute path>` and emits the canonical `.blend`, manifest and review renders.

- [x] Write a Vitest contract that requires the exact named anatomy, six nodes, material/triangle budgets and four absent review PNGs.
- [x] Run the focused test and record the expected missing-manifest RED.
- [x] Implement the manifest/PNG inspector without a new dependency.
- [x] Implement the minimum deterministic Blender geometry and four PBR materials.
- [x] Add the head, compact S body, short brow crests, cheek fins, dorsal ribbon, four tucked paws, six evidence nodes and vermilion tail nib with exact names.
- [x] Save `.blend`, emit manifest, and rerun the focused test until structural assertions are GREEN.
- [ ] Commit the structural prototype.

### Task 2: Review lighting, four poses and visual stop/go evidence

**Files:**
- Modify: `apps/web/scripts/hermes/build-constellation-dragon.py`
- Modify: `apps/web/assets/hermes/HermesConstellationDragon.blend`
- Modify: `apps/web/public/hermes/prototype/constellation-dragon-manifest.json`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-three-quarter.png`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-front.png`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-side.png`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-idle.png`
- Create: `apps/web/public/hermes/prototype/constellation-dragon-contact-sheet.png`
- Modify: `apps/web/test/hermes-constellation-dragon-asset-contract.test.ts`

**Interfaces:**
- Builder renders all views at `768 × 768`, then composes a `1536 × 1536` contact sheet inside Blender.
- Manifest records render names, dimensions, nontransparent coverage, material count and evaluated triangle count.

- [x] Extend the focused contract to require valid PNG signatures, exact dimensions, nontransparent coverage and contact sheet.
- [x] Run the contract and record the expected missing-render RED.
- [x] Add neutral editorial lighting, orthographic cameras and four deterministic pose transforms.
- [x] Render all review PNGs and compose the contact sheet without external image libraries.
- [x] Run the focused contract, `git diff --check`, docs lint and docs sync.
- [ ] Inspect the contact sheet and 48 px downsample visually; record an honest stop/go conclusion in `docs/progress.md` and handoff.
- [ ] Commit the review-ready prototype only if the render is genuinely usable.
