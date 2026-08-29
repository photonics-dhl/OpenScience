# Hermes Claim-First Public RO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production Claim-first public Research Object reader with
traceable Evidence, desktop rail/mobile sheet, persistent collapse preference,
and an explicit safe publish-to-public transition.

**Architecture:** Extend the existing public research read model rather than
creating a second RO stack. The API returns a bounded, publication-only DTO with
Claims, Evidence, provenance and approved presentation assets; a separate public
source endpoint resolves one Evidence locator on demand without exposing object
keys. A small core-database reading-preference record synchronizes authenticated
users while local storage supplies the anonymous fallback. The existing R3
publish transaction becomes the single explicit public-visibility expansion
boundary.

**Tech Stack:** Fastify 4, Zod, Prisma/PostgreSQL, `@openscience/domain`,
SeaweedFS through `@openscience/storage`, Next.js 14 App Router, React 18,
next-intl, Tailwind/global Research Folio CSS, Vitest/Node test, Playwright.

## Global Constraints

- Production acceptance runs on the CPU-only ECS; local Docker is forbidden.
- Public pages are SSR and contain the complete Evidence text for indexing,
  printing and assistive technology regardless of visual collapse state.
- Desktop reading column is 760px and Evidence rail is 280px; mobile provides
  the same Evidence through an accessible bottom sheet.
- Evidence starts expanded unless the user preference says collapsed. Anonymous
  preference is local-only; authenticated preference synchronizes through API.
- Object-storage keys, verifier user IDs, workspace IDs and private provenance
  never enter the public DTO.
- Only `published` versions with a Publication row may appear on public routes.
- The R3 publish confirmation is the explicit author approval that may expand a
  RO to `public`; generic RO PATCH cannot change visibility.
- Presentation assets remain labelled as presentation, never as source Evidence.
- All user-facing copy uses `messages/zh.json` and `messages/en.json`.
- No new third-party runtime dependency, parser, model, MCP or server binary.
- Landing and the accepted Wanko visual runtime remain unchanged.

---

### Task 1: Lock the publication-only public read contract

**Files:**

- Modify: `apps/api/src/routes/research.ts`
- Modify: `apps/api/test/research.integration.test.ts`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**

- Produces: `PublicResearchVersion` with `claims`, `evidence`,
  `presentationAssets`, `history` and existing identity/provenance fields.
- Security rule: a public RO with a draft, approved, withdrawn or missing-
  Publication version returns non-disclosing 404 for that version.

- [ ] **Step 1: Write failing API tests for publication-only reads**

  Add cases that create a public RO with draft and approved versions and assert
  `GET /research/:publicId/v/:versionNo` is 404 until that exact version has
  `status=published` and a Publication row. Assert the overview selects the
  latest published version rather than the latest database version.

- [ ] **Step 2: Run the focused test and confirm the privacy failure**

  Run:
  `npx pnpm@9.15.0 --filter @openscience/api test -- research.integration.test.ts`

  Expected: the new draft/approved visibility assertions fail against the
  current route.

- [ ] **Step 3: Introduce a closed public DTO**

  Extend the web contract with these public-only shapes and no internal IDs
  beyond version-scoped Claim/Evidence identifiers:

  ```ts
  export interface PublicClaim {
    id: string;
    parentClaimId: string | null;
    kind: 'core' | 'supporting' | 'method' | 'boundary' | 'counter';
    statement: string;
    conditions: string[];
    limitations: string[];
    assessment: 'supported' | 'partial' | 'disputed' | 'missing';
  }

  export interface PublicEvidence {
    id: string;
    claimId: string;
    kind: string;
    title: string;
    exactQuote: string | null;
    relation: 'supports' | 'contradicts' | 'qualifies';
    locator: Record<string, unknown>;
    extractionConfidence: number | null;
    verified: boolean;
    artifact: { logicalPath: string; mediaType: string; contentHash: string };
  }
  ```

  Query the exact published version and load Claims in stable core/parent/order
  order, Evidence in creation order, approved PresentationAssets with source
  Claim IDs, and published version history. Map rows explicitly instead of
  serializing Prisma objects.

- [ ] **Step 4: Pass the focused API/type contract tests**

  Run the focused API test plus
  `npx pnpm@9.15.0 --filter @openscience/web typecheck`.

- [ ] **Step 5: Commit**

  Commit message: `feat(api): expose publication-only claim read model`.

---

### Task 2: Make R3 publish the only public-visibility expansion path

**Files:**

- Modify: `apps/api/src/routes/research-objects.ts`
- Modify: `apps/api/test/research-objects.integration.test.ts`
- Modify: `packages/domain/src/publish/publish.ts`
- Modify: `packages/domain/test/publish/publish.test.ts`
- Modify: `apps/web/app/research-objects/[id]/publish/page.tsx`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`

**Interfaces:**

- Consumes: existing `POST /versions/:versionId/publish` body
  `{ r3Confirmed: true }`.
- Produces: one serializable transaction that validates the current visibility,
  publishes the version and changes the RO to `public`; the response includes
  `visibility: 'public'`.

- [ ] **Step 1: Write failing bypass and atomic-publish tests**

  Assert generic `PATCH /research-objects/:id` rejects a `visibility` property
  with 400. Assert publish without R3 remains rejected and publish with R3 moves
  a private or invite-only RO to public in the same transaction and audit event.

- [ ] **Step 2: Run the focused API/domain tests and observe failures**

  Run the research-object integration test and the focused publish test.

- [ ] **Step 3: Close generic PATCH and extend the publish transaction**

  Remove `visibility` from the route PATCH schema. In `publishVersion`, include
  the current RO visibility in the locked read, set it to public alongside the
  Version/Publication writes, and record `visibilityFrom`/`visibilityTo` in the
  existing publication audit metadata. Preserve idempotent republish behavior.

- [ ] **Step 4: Update the R3 confirmation UI**

  The dialog summary explicitly states that publishing creates a permanent
  public URL and expands visibility to everyone. Keep the single confirmation;
  do not add a second modal for the same approved operation.

- [ ] **Step 5: Pass focused tests and commit**

  Commit message: `fix(publish): make public visibility an explicit R3 change`.

---

### Task 3: Add account-synchronized reading preferences

**Files:**

- Add: `infra/migrations/20260829170000_reading_preferences/migration.sql`
- Add: `infra/migrations/20260829170000_reading_preferences/rollback.sql`
- Modify: `infra/schema.prisma`
- Add: `packages/domain/src/preferences/reading-preferences.ts`
- Add: `packages/domain/test/preferences/reading-preferences.test.ts`
- Modify: `packages/domain/src/index.ts`
- Add: `apps/api/src/routes/reading-preferences.ts`
- Add: `apps/api/test/reading-preferences-routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**

- Produces:
  `GET /reading-preferences -> { evidenceDefaultCollapsed, version }` and
  `PATCH /reading-preferences` with
  `{ evidenceDefaultCollapsed, expectedVersion }`.
- Persists one `ReadingPreference` per user with optimistic versioning; default
  is `false` (Evidence expanded).

- [ ] **Step 1: Write migration and domain failure tests**

  Tests cover first read default, idempotent upsert, version conflict, user
  isolation and boolean-only input.

- [ ] **Step 2: Run the focused domain test and confirm missing behavior**

  Run the new domain test file; expected failure is the missing service export.

- [ ] **Step 3: Implement migration and preference service**

  Create a one-to-one `reading_preferences` table with `user_id` primary/foreign
  key, `evidence_default_collapsed boolean not null default false`, integer
  `version`, timestamps and cascade on user deletion. Keep it in the core DB;
  no search/object-storage coupling.

- [ ] **Step 4: Add strict authenticated routes**

  Use closed Zod bodies, current-session identity and 409
  `PREFERENCE_VERSION_CONFLICT`. Never accept a user ID from the browser.

- [ ] **Step 5: Pass database build/domain/API tests and commit**

  Commit message: `feat(settings): persist evidence reading preference`.

---

### Task 4: Deliver published Evidence sources and presentation assets safely

**Files:**

- Add: `packages/domain/src/research-intelligence/public-evidence-source.ts`
- Add: `packages/domain/test/research-intelligence/public-evidence-source.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `apps/api/src/routes/research.ts`
- Modify: `apps/api/test/research.integration.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/lib/public-server-api.ts`
- Modify: `apps/web/lib/api.ts`

**Interfaces:**

- Produces:
  `GET /research/:publicId/v/:versionNo/evidence/:evidenceId/source` returning
  `{ text, page, locator, artifact: { logicalPath, mediaType } }`.
- Produces:
  `GET /research/:publicId/v/:versionNo/presentation-assets/:assetId` for an
  approved asset. Images and video use a strict allowlist; HTML and unknown
  media download as attachments and never execute in the OpenScience origin.
- Uses exact published version, public visibility, immutable artifact hash and
  trusted SourceMap verification from Task 8.

- [ ] **Step 1: Write failing security/source tests**

  Cover valid quote resolution, private RO, unpublished version, cross-version
  Evidence, tampered SourceMap, missing original and internal-key redaction.
  Asset cases cover draft rejection, cross-version rejection, byte/content-hash
  verification, safe content type and attachment treatment for HTML.

- [ ] **Step 2: Run tests and confirm the endpoint/service are absent**

- [ ] **Step 3: Implement bounded public resolution**

  Reuse the Task 8 SourceMap loader and resolver. Return a bounded text excerpt
  and normalized locator only. Do not return `objectKey`, workspace, verifier or
  full provenance. Stream approved assets from storage only after exact size/
  hash validation and set `X-Content-Type-Options: nosniff`; never inline HTML.
  Keep failures non-disclosing except a 503 for published bytes temporarily
  unavailable from storage.

- [ ] **Step 4: Pass focused domain/API tests and commit**

  Commit message: `feat(api): resolve published evidence sources safely`.

---

### Task 5: Build the Claim-first Research Folio reading surface

**Files:**

- Add: `apps/web/components/public/ClaimNarrative.tsx`
- Add: `apps/web/components/public/EvidenceDisclosure.tsx`
- Add: `apps/web/components/public/EvidenceRail.tsx`
- Add: `apps/web/components/public/EvidenceSheet.tsx`
- Add: `apps/web/components/public/PresentationAssetGallery.tsx`
- Add: `apps/web/lib/evidence-reading-preference.ts`
- Modify: `apps/web/components/public/PublicVersionPage.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Modify: `apps/web/test/public-reading-surface.test.tsx`

**Interfaces:**

- Consumes: Task 1 public DTO and Task 4 source endpoint.
- Produces: reading order
  identity/citation → positioning line → 3–7 core Claims → Evidence,
  conditions and limitations → methods/data/code/environment/reuse →
  history/review/provenance → presentation assets.

- [ ] **Step 1: Write failing semantic-order and disclosure tests**

  Server-render the surface and assert heading/order landmarks, every Claim and
  Evidence text, default expanded state, presentation labels and no internal
  storage fields. Add an anonymous preference unit test for invalid/corrupt
  local-storage values falling back to expanded.

- [ ] **Step 2: Run focused Web tests and confirm failures**

- [ ] **Step 3: Implement the reading column and Claim hierarchy**

  Preserve the warm-paper Research Folio. Use one 760px typographic column,
  numbered core Claims, indented typed child Claims, inline conditions and
  limitations, and relation-aware Evidence markers. Avoid card grids and avoid
  changing Landing tokens.

- [ ] **Step 4: Implement desktop Evidence rail and source preview**

  Use a sticky 280px graphite rail with keyboard-selectable Evidence. Display
  exact quote, page, source path and a small normalized page-region diagram
  derived from the locator; fetch the authoritative source only on selection.
  Loading, missing and unavailable states occupy a stable footprint.

- [ ] **Step 5: Implement mobile bottom sheet and preference behavior**

  At mobile width, the same Evidence opens in an accessible dialog/sheet with
  focus trap, Escape close, labelled trigger and focus return. A collapse
  preference changes visual height/rail selection only: it must not set
  `hidden`, `display:none` or `aria-hidden` on the Evidence transcript, so the
  complete text remains in the accessibility and print trees. Respect reduced
  motion.

- [ ] **Step 6: Render approved presentation assets distinctly**

  Render only approved assets, label each as generated presentation, link it to
  source Claim IDs and preserve generator provenance. Unsupported or missing
  media produces a textual provenance row rather than a broken embed.

- [ ] **Step 7: Pass Web tests and commit**

  Commit message: `feat(web): build claim-first public research reader`.

---

### Task 6: Connect the preference to Settings without mode switching

**Files:**

- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/lib/api.ts`
- Modify: `messages/zh.json`
- Modify: `messages/en.json`
- Add: `apps/web/test/reading-preference-settings.test.tsx`

**Interfaces:**

- Consumes: Task 3 reading-preference endpoints.
- Produces: one Settings switch labelled “默认折叠证据” / “Collapse evidence
  by default”, with optimistic save and conflict reload.

- [ ] **Step 1: Write failing Settings interaction tests**

  Test load, toggle/save, disabled pending state, conflict refresh and API error
  announcement. No user-visible “mode” selector is added.

- [ ] **Step 2: Implement authenticated synchronization**

  On successful account write, mirror the value to the anonymous local key so
  logout keeps the user’s last reading preference on that device. API truth wins
  after login. Errors do not overwrite either confirmed value.

- [ ] **Step 3: Pass focused Web tests and commit**

  Commit message: `feat(settings): synchronize evidence disclosure preference`.

---

### Task 7: Add responsive, accessibility, print and contract gates

**Files:**

- Modify: `apps/web/test/public-reading-surface.test.tsx`
- Add: `apps/web/test/e2e/claim-first-public-ro.spec.ts`
- Add: `apps/web/test/visual/claim-first-public-ro-gate.mjs`
- Modify: `apps/web/test/visual/product-release-manifest.mjs`
- Modify: `apps/web/playwright.release.config.ts`

**Interfaces:**

- Verifies: 1440px 760/280 layout, 768px transition, 375px bottom sheet,
  keyboard order/focus return, WCAG AA automated checks, reduced motion, print
  completeness and no overflow.

- [ ] **Step 1: Add failing desktop/mobile/print gates**

  Use a deterministic published fixture with three core Claims, supporting and
  counter Evidence, conditions, limitations and one presentation asset. Assert
  all evidence appears in print even when default collapse is enabled.

- [ ] **Step 2: Run focused browser gates and capture the first failure**

  Run the exact new E2E and visual entrypoints against the local Next server;
  do not run local Docker.

- [ ] **Step 3: Fix only evidence-backed layout/accessibility defects**

  Keep the existing Research Folio visual thesis. Do not add decorative
  gradients, generic cards, new fonts or unrelated navigation changes.

- [ ] **Step 4: Pass Web unit/E2E/visual gates and commit**

  Commit message: `test(web): gate claim-first public research experience`.

---

### Task 8: Full review, immutable deployment and production journey

**Files:**

- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `docs/runbooks/deployment.md`
- Modify: `project_index.md`

**Interfaces:**

- Produces: Task 9 exact CI and ECS evidence, migration 31 status, active/
  rollback tuple, public Claim-first page evidence and exact disposable cleanup.

- [ ] **Step 1: Run focused then full local gates**

  Run database/domain/API/Web tests, root build/typecheck/lint/test,
  `audit:docs-sync`, `docs:lint` and `git diff --check`. Review security around
  public DTOs, visibility, source resolution and storage errors.

- [ ] **Step 2: Push and wait for exact GitHub CI**

  Record run/job IDs only after the exact candidate SHA is green.

- [ ] **Step 3: Create fresh backup and deploy on ECS**

  Use explicit Windows Git Bash and canonical wrappers. Materialize immutable
  candidate, run full server build, migration 31, parser acceptance, SHA images,
  BGE real vector, health, Nginx and release identity gates. Keep the current
  active release as explicit rollback.

- [ ] **Step 4: Run one real production journey**

  Create a disposable author, RO and source artifact; build/verify three Claims
  and Evidence, publish through the R3 UI/API, assert the RO becomes public, load
  the Claim-first page anonymously at desktop/mobile widths, resolve a selected
  source, change the preference in Settings, and prove print contains all
  Evidence. Remove only the exact test user, RO, blobs, SourceMap and assets.

- [ ] **Step 5: Verify hygiene and close Task 9**

  Require zero disposable rows/objects, active+rollback retention, no failed
  candidate/eval roots, healthy containers and unchanged bounded disk use. Mark
  Task 9 done only after all production evidence is green, then sync CURRENT
  docs and commit the closeout.
