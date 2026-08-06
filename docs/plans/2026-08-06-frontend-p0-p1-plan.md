# 前端 P0 地基收尾 + P1 首页视觉原型 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按已定稿 spec（`docs/specs/2026-08-06-frontend-visual-system-design.md`）完成前端技术地基（Tailwind v4/shadcn/token/字体），并产出首页 Header+Hero+#latest 的可运行原型（核心符号两版变体 + 三尺寸截图供用户拍板）。

**Architecture:** Next.js 14 App Router 单页落地页 `/`（`apps/web/app/page.tsx` 当前是占位）；全部文案走 next-intl `landing` 命名空间；核心符号为纯 SVG React 组件（分层辉光、reduced-motion 静态化）；视觉验证用 Playwright 脚本截 1440×900 / 1920×1080 / 390×844。

**Tech Stack:** Next 14.2.35 + React 18 + next-intl 4（已接通）+ Tailwind CSS v4（新引入）+ shadcn/ui copy-in（新引入）+ next/font（Noto Serif SC）+ playwright（新引入，仅截图）。

## Global Constraints

- pnpm 一律 `npx pnpm@9.15.0 <cmd>`；安装只在 `apps/web`（`--filter @openscience/web`）。
- 文案零硬编码：界面字符串全部进 `apps/web/messages/{zh,en}.json` 的 `landing.*` 命名空间（frontend-design 第 11 条）。
- `prefers-reduced-motion`：一切装饰动画退化为静态；装饰元素 `aria-hidden="true"` + `pointer-events: none`。
- 暖橙 `--accent-diff:#FFB454` 只表示 diff/新增/合并，不作普通按钮色；禁大面积紫渐变。
- token 值以 spec §3 为准；冻结前过 WCAG AA（Task 2 的对比度脚本必须全过）。
- 不引入 Three.js、不引入 Live2D/pixi（P3 的事）、不做完整双主题切换。
- 每 Task 结束可独立验证；git commit 前必须问过用户（本仓纪律）。
- 完成后更新 `project_index.md` + `docs/progress.md` 置顶条目，跑 `node scripts/docs/check-docs-sync.mjs` 与 `npx pnpm@9.15.0 docs:lint`。

---

### Task 1: Tailwind v4 接入（不破坏现有 1397 行 globals.css）

**Files:**
- Modify: `apps/web/package.json`（devDeps）
- Create: `apps/web/postcss.config.mjs`
- Modify: `apps/web/app/globals.css:1`（文件头加导入）

- [ ] **Step 1: 安装**

```bash
npx pnpm@9.15.0 --filter @openscience/web add -D tailwindcss@^4 @tailwindcss/postcss
```

- [ ] **Step 2: 建 `apps/web/postcss.config.mjs`**

```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

- [ ] **Step 3: `globals.css` 第一行插入**（其余 1397 行原样保留）

```css
@import 'tailwindcss';
```

- [ ] **Step 4: 回归验证**——`npx pnpm@9.15.0 --filter @openscience/web build` 通过；`next dev` 起服后人工/截图核对 `/research/[publicId]` 公开页与协作页无样式崩塌（Tailwind preflight 会重置默认样式）。
- [ ] **Step 5: 若 preflight 破坏现有页面**——降级为只引工具层（把 Step 3 换成 `@import 'tailwindcss/theme'; @import 'tailwindcss/utilities';`），并在本文记录选择。
- [ ] **Step 6: Commit（先问用户）**：`chore(web): add tailwind v4 via postcss`

### Task 2: 设计 token 层 + WCAG AA 对比度门禁

**Files:**
- Create: `apps/web/app/tokens.css`（CSS 变量 + `@theme` 映射）
- Modify: `apps/web/app/globals.css:2`（`@import './tokens.css';`）
- Create: `apps/web/test/tokens-contrast.test.ts`

- [ ] **Step 1: 写 `tokens.css`**——spec §3 全部变量落到 `:root`，并用 Tailwind v4 `@theme` 暴露为工具类：

```css
:root {
  --hero-bg: #03060b; --hero-surface: #08101c;
  --hero-text: #f4f7fb; --hero-muted: #99a5b5;
  --accent-primary: #4c8dff; --accent-primary-strong: #256bff;
  --accent-diff: #ffb454;
  --canvas-bg: #f6f7f9; --paper-bg: #fcfbf7;
  --ink: #18202b; --border-subtle: rgba(148, 163, 184, 0.18);
}
@theme {
  --color-hero-bg: var(--hero-bg); --color-hero-surface: var(--hero-surface);
  --color-hero-text: var(--hero-text); --color-hero-muted: var(--hero-muted);
  --color-accent-primary: var(--accent-primary);
  --color-accent-primary-strong: var(--accent-primary-strong);
  --color-accent-diff: var(--accent-diff);
  --color-canvas-bg: var(--canvas-bg); --color-paper-bg: var(--paper-bg);
  --color-ink: var(--ink); --color-border-subtle: var(--border-subtle);
}
```

- [ ] **Step 2: 写对比度测试**——纯函数实现 WCAG 相对亮度/对比度（不引依赖），断言以下配对 ≥ 4.5：`hero-text/hero-bg`、`hero-muted/hero-bg`、`hero-text/hero-surface`、`ink/canvas-bg`、`ink/paper-bg`、`accent-primary-strong/hero-bg`（大文本可 ≥3，按 4.5 从严）。颜色常量从 `tokens.css` 正则读出，防两处漂移。
- [ ] **Step 3: 跑 `npx pnpm@9.15.0 --filter @openscience/web test`**——若某配对不过，微调该 token 明度并在 spec §3 同步新值（spec 声明"方向值，以验证后为准"）。
- [ ] **Step 4: Commit（先问用户）**：`feat(web): design tokens + WCAG AA contrast gate`

### Task 3: 标题字体（Noto Serif SC 子集化）+ LocaleSwitcher 样式收尾

**Files:**
- Modify: `apps/web/app/layout.tsx`（next/font）
- Modify: `apps/web/components/LocaleSwitcher.tsx`（补样式，清偿 P1 地基遗留）
- Modify: `apps/web/app/globals.css`（`.font-display` 工具类 + body 系统栈变量）

- [ ] **Step 1: layout.tsx 引入**（next/font/google 构建期自托管，CJK 按 unicode-range 分片，浏览器只拉用到的分片）

```tsx
import { Noto_Serif_SC } from 'next/font/google';
const displaySerif = Noto_Serif_SC({
  weight: ['600', '900'], display: 'swap', variable: '--font-display',
});
// <html lang={locale} className={displaySerif.variable}>
```

- [ ] **Step 2: globals.css 增加**——`body { font-family: system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif; }` 与 `.font-display { font-family: var(--font-display), 'Songti SC', serif; }`。
- [ ] **Step 3: LocaleSwitcher 补样式**：按 hero 深色语境给 `select` 加 token 化样式（bg-transparent、hero-muted 文字、focus 可见 ring），保证键盘可达。
- [ ] **Step 4: 验证**——build 通过；`next start` 后检查网络面板首屏字体分片数量与体积（若首屏拉取 >150KB，记录并改手工 pyftsubset 子集方案，更新 spec §5）。
- [ ] **Step 5: Commit（先问用户）**：`feat(web): display serif font + styled locale switcher`

### Task 4: shadcn/ui 底座（button/card/badge/skeleton）

**Files:**
- Create: `apps/web/components.json`、`apps/web/lib/utils.ts`（`cn`）
- Create: `apps/web/components/ui/{button,card,badge,skeleton}.tsx`
- Modify: `apps/web/package.json`（`class-variance-authority clsx tailwind-merge @radix-ui/react-slot lucide-react`）

- [ ] **Step 1: 安装依赖**（上列五个 runtime deps，全部进 dependencies）。
- [ ] **Step 2: 手写 `lib/utils.ts`**（`cn = twMerge(clsx(...))`）与 `components.json`（style: new-york，cssVariables: true，aliases 指向 `apps/web` 内）。
- [ ] **Step 3: copy-in 四个组件**——从 shadcn/ui 官方源复制 button/card/badge/skeleton，把其中的 slate/zinc 色改为引用 `@theme` token（如 `bg-accent-primary text-hero-text`），不加其他组件。
- [ ] **Step 4: 验证**——`typecheck` + `test` + `build` 全绿；写一个临时 storyless 渲染断言（在 Task 9 的 skeleton 用到即覆盖）。
- [ ] **Step 5: Commit（先问用户）**：`feat(web): shadcn base (button/card/badge/skeleton)`

### Task 5: 落地页 i18n 文案（`landing.*`）

**Files:**
- Modify: `apps/web/messages/zh.json`、`apps/web/messages/en.json`

- [ ] **Step 1: 加 `landing` 命名空间**（zh/en 对称），键清单：

```text
landing.nav.explore / nav.create / nav.about / nav.login
landing.hero.title（让研究，持续演化。/ Let research keep evolving.）
landing.hero.subtitle（将论文、数据、代码与讨论，组织为开放、可验证、可演化的研究对象。）
landing.hero.ctaExplore（探索研究）/ hero.ctaCreate（创建研究对象）
landing.hero.hermesStatus（Hermes 正在解析）
landing.latest.title（最新研究）
landing.latest.empty（暂无公开研究，敬请期待。）
```

- [ ] **Step 2: 跑 test**——现有 i18n zh/en 键对称门禁自动覆盖。
- [ ] **Step 3: Commit（先问用户）**：`feat(web): landing i18n messages`

### Task 6: Landing Header 组件

**Files:**
- Create: `apps/web/components/landing/SiteHeader.tsx`（client component）

- [ ] **Step 1: 实现**——左 logo（`public/logo.svg` + wordmark）；右四项导航（探索→`/#latest`、创建→`/login?next=/research-objects/new`、关于→`/#trust`、登录→`/login`）+ LocaleSwitcher；首屏 `bg-transparent`，`window.scrollY > 24` 后切 `bg-hero-bg/80 backdrop-blur`（scroll listener 挂 `useEffect`，`{ passive: true }`）；语义 `<header><nav>`，焦点可见。
- [ ] **Step 2: 验证**——typecheck + build。
- [ ] **Step 3: Commit（先问用户）**：`feat(web): landing site header`

### Task 7: EvolvingRoSymbol 核心符号组件（两版变体）

**Files:**
- Create: `apps/web/components/landing/evolving-ro-symbol.tsx`（server-safe，无客户端依赖）
- Create: `apps/web/test/evolving-ro-symbol.test.tsx`

**Interfaces:**
- Produces: `<EvolvingRoSymbol variant="sculptural" | "interface" animated?: boolean />`——P2 四阶段面板复用同一组件（加 `stage` prop 属于 P2，本任务不留半成品接口，只保证 variant 机制可扩展）。

- [ ] **Step 1: 写失败测试**——渲染后断言：恰好 6 个 `[data-facet]` 且 `data-facet` ∈ {problem, insight, method, results, limitations, reproducibility}；恰好 1 个 `[data-diff-node]`；根元素 `aria-hidden="true"`；`prefers-reduced-motion` mock 下无 `<animate>`/CSS 动画类。
- [ ] **Step 2: 跑测试确认 FAIL**。
- [ ] **Step 3: 实现 SVG**——六面楔形绕中心开放缺口排布（path 手写，viewBox `0 0 800 800`）；每面三层描边（锐核 1.5px accent-primary / 内辉 6px blur / 外 bloom 16px blur，`<filter>` 区域 `x="-35%" y="-35%" width="170%" height="170%"`）；历史轮廓 = 同形放大 1.06/1.12 倍、opacity 0.15/0.07；蓝色轨迹 path 穿中心 + 一次分支 + merge；分支点 1 个暖橙 `data-diff-node`；动效仅 `opacity/transform`（呼吸 scale 1→1.015，10s ease-in-out infinite alternate），CSS `@media (prefers-reduced-motion: reduce)` 全停。variant=sculptural：面更大、填 `hero-surface` 渐变、少内部细节；variant=interface：面内含 2–3 条抽象内容刻线（rect/line，非文字）。
- [ ] **Step 4: 测试 PASS；build PASS**。
- [ ] **Step 5: Commit（先问用户）**：`feat(web): EvolvingRoSymbol svg (two variants)`

### Task 8: Hero 区块 + 落地页组装

**Files:**
- Create: `apps/web/components/landing/Hero.tsx`
- Modify: `apps/web/app/page.tsx`（替换占位）

- [ ] **Step 1: Hero**——`min-h-screen`、左文案（`.font-display` 主标题、副文、双 CTA 用 ui/button：主=accent-primary 实色→`/#latest`，次=描边→`/login?next=/research-objects/new`）、右 `<EvolvingRoSymbol>`（读取 `searchParams.symbol`：`a`=sculptural / `b`=interface，默认 a）；`Hermes 正在解析` 轻量状态 pill（小字 + 2px 蓝点呼吸，非第三 CTA）；底部 `最新研究` 标题 + 卡片上沿露出（`#latest`）。
- [ ] **Step 2: page.tsx 组装**——`<SiteHeader/>`（client）+ `<main>` 内 Hero + Latest 占位；全部文案 `useTranslations('landing')`；页面 metadata 沿用 layout 默认。
- [ ] **Step 3: 验证**——build + `next start` 冒烟：zh 默认、en（Accept-Language）文案切换正确。
- [ ] **Step 4: Commit（先问用户）**：`feat(web): hero + landing assembly`

### Task 9: #latest 区块（skeleton 版）

**Files:**
- Create: `apps/web/components/landing/LatestResearch.tsx`

- [ ] **Step 1: 实现**——标题 + 3 张 skeleton RO Card（ui/card + ui/skeleton，字段占位布局即最终 RoCard 版式：标题/作者行/版本 badge/更新时间/计数/许可）；空态文案 `landing.latest.empty`；注释标明 P2 接 `GET /explore`。
- [ ] **Step 2: 验证**——build + 视觉走查。
- [ ] **Step 3: Commit（先问用户）**：`feat(web): latest research skeleton`

### Task 10: Playwright 三尺寸截图脚本

**Files:**
- Modify: `apps/web/package.json`（devDep `playwright` + script `"shots": "node test/visual/shots.mjs"`）
- Create: `apps/web/test/visual/shots.mjs`

- [ ] **Step 1: 安装** `npx pnpm@9.15.0 --filter @openscience/web add -D playwright && npx playwright install chromium`。
- [ ] **Step 2: 脚本**——启动时假定 `next start` 已在 :3000；对 `?symbol=a` 与 `?symbol=b` 各截三尺寸（1440×900、1920×1080、390×844，`deviceScaleFactor: 2`），输出 `apps/web/test/visual/out/{symbol}-{WxH}.png`（out/ 加 .gitignore）；另截一组 `reducedMotion: 'reduce'` 验证静态退化。
- [ ] **Step 3: 跑通**——8 张图产出且人工可读。
- [ ] **Step 4: Commit（先问用户）**：`test(web): landing visual shots script`

### Task 11: 用户验收门（P1 出口）

- [ ] 向用户展示 8 张截图（两变体 × 三尺寸 + reduced-motion）。
- [ ] 用户选定符号变体 → 冻结 token（把 Task 2 验证后的最终值回写 spec §3，去掉"方向值"标注）。
- [ ] 收尾：`project_index.md` 登记本计划与 spec、新组件；`docs/progress.md` 置顶条目；`check-docs-sync.mjs` + `docs:lint` 全绿。

---

## Self-Review 记录

- Spec 覆盖：P0 四项 → Task 1–4；P1（Header/Hero/#latest/两变体/三尺寸截图）→ Task 5–11。P2 的 `GET /explore`、四阶段面板与 P3/P4 不在本计划（P1 验收后另出计划，避免符号未定稿前过度规划）。
- 无占位符；类型一致性：`EvolvingRoSymbol` props、`landing.*` 键、`cn` 工具在 Task 间一致。
- 已知风险登记：Task 1 preflight 回归（有降级路径）；Task 3 字体分片体积（有手工子集降级路径）。
