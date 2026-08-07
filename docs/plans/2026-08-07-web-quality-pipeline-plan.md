# Web 品质管线实施计划（产品级网页 · 全入口）

日期：2026-08-07
状态：待执行
上游：`docs/specs/2026-08-06-frontend-visual-system-design.md`（视觉系统定稿）、`docs/plans/2026-08-06-frontend-p0-p1-plan.md`（P0/P1，task-master 任务 7 收尾中）

## 背景与目标

Landing 首页静态版已完成并部署生产（2026-08-07，commit 481b5c4），但距离"产品级质感"仍有差距。目标：把设计系统、动效、设计上游（Figma）、全站一致性和视觉回归门禁五件事管线化，覆盖整个 `apps/web`（landing 暗场 / 公开 RO 纸白 / 工作台深色壳三套视觉），不只是主页。

## 不可违反的设计契约

- token 唯一事实源 `apps/web/app/tokens.css`；暖橙 #FFB454 只表 diff；禁大面积紫渐变
- 文案零硬编码，全走 `landing.*` 等 i18n 命名空间，zh/en 对称（有 lint 门禁）
- `prefers-reduced-motion` 全静态回退；禁 scroll-jacking
- 三套视觉分区不混：landing 暗场 / 公开 RO 纸白 / 工作台深色壳
- 服务器拉取走隧道（`with-proxy`），部署链路：cloud-sync → 云上 build → compose restart

## Task 8：设计系统固化（token 补全 + shadcn 原语两套表面）

以 `tokens.css` 为唯一事实源补齐缺失 token（spacing scale、elevation/shadow、motion duration/easing、z-index 层级）。用 shadcn 生成器按需生成原语（Button/Card/Badge/Dialog/Input 等，底座依赖 radix-slot/cva/clsx/tailwind-merge 已装），每个原语给出深色（landing/工作台）与纸白（公开 RO）两套表面状态。i18n 门禁与 docs-sync 同步。

验收：token 表文档化；原语在两种表面下 storyless 渲染测试通过；lint/typecheck/test 全绿。

## Task 9：动效层（framer-motion 优先，Hero 循环视觉）

安装 framer-motion。迁移与新增：Hero 标题 stagger 进入、EvolutionPanel 的 stage 过渡、卡片 hover/进入动画、HermesBand 琥珀扫描线与 evolve 脉冲统一走 easing token；全部包 `prefers-reduced-motion` 回退。Hero 主视觉循环：首选 Gemini 图生视频（8–12s 循环，webm/mp4 + poster 回退，reduced-motion 显示静态 poster）；备选 OGL 级小 shader（懒加载单 canvas）。

验收：动画在桌面/移动两视口流畅（无布局抖动）；reduced-motion 下零动画；首包增量 < 30 kB（framer-motion 懒加载边界）。

## Task 10：Figma 设计上游 + MCP 接入

建 Figma 文件作为 landing 与公开 RO 页的设计稿源（与 tokens.css 同名变量）。开通 Dev seat（Professional，$12/月，远程 MCP 200 calls/day；免费档仅 6 calls/月不可用）。项目 `.mcp.json` 接入 Figma 远程 MCP（`https://mcp.figma.com/mcp`，OAuth）。配 Code Connect 把 Figma 组件映射到 `apps/web/components/ui/*` 原语——没有 Code Connect 的 MCP 输出会绕过设计系统，不可用于生产。

验收：AI 能通过 MCP 读取设计稿结构（spacing/typography/变量）并生成引用真实组件的代码；`.mcp.json` 变更登记 project_index.md 与 ADR（工具可移植性规则）。

## Task 11：全站一致性收口（三套视觉 × 全部入口）

按三套视觉分区逐个收口：公开 RO 页（纸白，套 token 统一排版/卡片/作者行）、工作台 SDF 编辑器（深色壳）、About/auth 页（当前裸样式）、Explore 入口（空态文案 + P2 `GET /explore` 后端 feed 排期）。每页建立 Playwright 截图基线。

验收：五个入口在两视口截图验收通过；三套视觉无 token 混用；i18n 对称。

## Task 12：视觉回归门禁（shots.mjs → CI）

扩展 `apps/web/test/visual/shots.mjs` 为固定 5 视口 × 关键页面集合，输出基线/对比双份截图；挂入 lint 或 CI（改视觉必出对比图）。清理闲置资产：`apps/web/scripts/generate-landing-hero.mjs` 与 `public/hero/landing-hero.png`（knip 已会报，删除需用户批准）。

验收：CI 中视觉对比步骤可跑通；knip 无新增告警；文档（AGENTS/project_index/progress）同步。

## 依赖关系

8 → 9（动效用 token 化 easing）→ 10（Figma 变量与 token 对齐，Code Connect 依赖 8 的原语）→ 11（全站用固化后的系统）→ 12（门禁覆盖全部页面）。9 与 10 可并行。
