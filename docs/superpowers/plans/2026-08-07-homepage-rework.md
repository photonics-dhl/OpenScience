# Homepage Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the landing page so it matches the approved visual direction more closely: stronger primary visual, real content sections, and working navigation targets.

**Architecture:** Keep the existing landing route and i18n contract, but split the page into three explicit modules: hero, latest content band, and trust band. Use a project-local raster hero asset for the main visual, then layer small motion and SVG details on top rather than relying on a component-library collage.

**Tech Stack:** Next.js 14 App Router, next-intl, Tailwind CSS v4, shadcn/ui base components, CSS transitions, Playwright screenshots, local image asset generated into `apps/web/public/`.

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；安装只在 `apps/web`（`--filter @openscience/web`）。
- 文案零硬编码：界面字符串全部进 `apps/web/messages/{zh,en}.json` 的 `landing.*` 命名空间。
- `prefers-reduced-motion`：一切装饰动画退化为静态；装饰元素 `aria-hidden="true"` + `pointer-events: none`。
- 暖橙 `--accent-diff:#FFB454` 只表示 diff/新增/合并，不作普通按钮色。
- 不引入 Three.js、不引入 Live2D/pixi；`motion` 已试装评估，因首页首包从 106 kB 增至 156 kB 后撤回，保留 CSS transitions。
- 完成后更新 `project_index.md` + `docs/progress.md` 置顶条目，跑 `node scripts/docs/check-docs-sync.mjs` 与 `npx pnpm@9.15.0 docs:lint`。

---

### Task 1: Rework landing page structure

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/landing/Hero.tsx`
- Modify: `apps/web/components/landing/LatestResearch.tsx`
- Create: `apps/web/components/landing/TrustBand.tsx`

**Interfaces:**
- Consumes: `searchParams.symbol`
- Produces: `data-landing-module` markers and real `#latest` / `#trust` targets

- [ ] **Step 1: Write the failing structure test**

```tsx
expect(markup).toContain('<section id="latest"');
expect(markup).toContain('<section id="trust"');
expect(markup).toContain('data-landing-module="hero"');
expect(markup).toContain('data-landing-module="latest"');
expect(markup).toContain('data-landing-module="trust"');
```

- [ ] **Step 2: Implement the module split**

```tsx
<main>
  <Hero />
  <LatestResearch />
  <TrustBand />
</main>
```

- [ ] **Step 3: Verify landing structure**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- test/landing-page.test.tsx`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/page.tsx apps/web/components/landing/Hero.tsx apps/web/components/landing/LatestResearch.tsx apps/web/components/landing/TrustBand.tsx apps/web/test/landing-page.test.tsx
git commit -m "feat(web): rework landing structure"
```

### Task 2: Generate and consume a project-local hero bitmap

**Files:**
- Create: `apps/web/public/hero/landing-hero.png`
- Create: `apps/web/scripts/generate-landing-hero.mjs`
- Modify: `apps/web/components/landing/Hero.tsx`

**Interfaces:**
- Consumes: project-local generated PNG
- Produces: hero asset used as the main visual layer

- [ ] **Step 1: Render the hero asset**

```js
// Generate a high-resolution hero image with dark space, blue object geometry,
// and a visible content band composition that echoes the approved prototype.
```

- [ ] **Step 2: Verify file exists and is referenced**

Run: `Get-Item apps/web/public/hero/landing-hero.png`

- [ ] **Step 3: Use the bitmap as the hero base**

```tsx
<Image src="/hero/landing-hero.png" alt="" fill priority />
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/hero/landing-hero.png apps/web/scripts/generate-landing-hero.mjs apps/web/components/landing/Hero.tsx
git commit -m "feat(web): add landing hero asset"
```

### Task 3: Replace dead-end navigation with real targets

**Files:**
- Modify: `apps/web/components/landing/SiteHeader.tsx`
- Modify: `apps/web/messages/zh.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Produces: working `/#latest` and `/#trust` navigation

- [ ] **Step 1: Keep the nav targets real**

```tsx
<a href="/#latest">探索</a>
<a href="/#trust">关于</a>
```

- [ ] **Step 2: Add trust band copy**

```json
{
  "landing": {
    "trust": {
      "title": "开放，但可信",
      "subtitle": "版本、许可、评审和证据都可追踪。"
    }
  }
}
```

- [ ] **Step 3: Verify no dead anchors remain**

Run: `npx pnpm@9.15.0 --filter @openscience/web test -- test/landing-page.test.tsx`

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/landing/SiteHeader.tsx apps/web/messages/zh.json apps/web/messages/en.json
git commit -m "feat(web): fix landing navigation targets"
```

### Task 4: Screenshot and validate the new homepage

**Files:**
- Modify: `apps/web/test/visual/shots.mjs`
- Modify: `apps/web/.gitignore`
- Modify: `docs/progress.md`
- Modify: `project_index.md`

- [ ] **Step 1: Capture desktop and mobile screenshots**
- [ ] **Step 2: Check for layout overlap, false anchors, and empty hero space**
- [ ] **Step 3: Run `typecheck`, `test`, `build`, `lint`, `docs:lint`**
- [ ] **Step 4: Update progress and index**
- [ ] **Step 5: Commit**
