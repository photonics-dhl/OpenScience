# Edge cache asset versioning implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Serve the two large Landing optical assets through content-addressed,
year-long immutable cache URLs without caching dynamic responses.

**Architecture:** A shared JavaScript manifest owns canonical paths, complete
SHA-256 digests, and versioned URLs. Next.js exact rewrites preserve the source
files while exact header rules enable safe Edge caching.

**Tech Stack:** Next.js 14, React, Vitest, Node.js crypto.

## Global constraints

- Do not cache HTML, API, authentication, workspace, or other personalized data.
- Do not rename or delete canonical assets.
- A changed asset must fail tests until its digest and URL are updated.
- Preserve the existing API rewrite.

### Task 1: Content-addressed optical assets

**Files:**

- Create: `apps/web/lib/optical-lab/asset-manifest.mjs`
- Create: `apps/web/test/optical-cache-contract.test.ts`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/components/optical-lab/AcceptedOpticalSurface.tsx`
- Modify: `apps/web/lib/optical-lab/ogl/asset-interaction-renderer.ts`
- Modify: existing optical SSR tests whose URL assertions become versioned
- Modify: `docs/runbooks/deployment.md`

- [x] Add a failing contract that computes real asset digests and expects exact
  immutable headers, rewrites, SSR URLs, and shared renderer URLs.
- [x] Run the focused Vitest file and record the expected RED.
- [x] Add the shared manifest and minimally wire Next, SSR, and WebGL consumers.
- [x] Run focused tests, Web typecheck, build, lint, and docs gates.
- [x] Start a production server and verify versioned assets return immutable
  cache headers while `/`, `/api/*`, and canonical asset paths do not.
- [ ] Deploy only after the user separately confirms the production operation.
