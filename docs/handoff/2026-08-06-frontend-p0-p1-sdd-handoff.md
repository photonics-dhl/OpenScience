# 前端 P0/P1 SDD 执行交接（7.1–7.3 已完成，7.4–7.11 待续）

> 日期：2026-08-06 · 交接原因：Kimi 会话 token 预算，后续任务移交 GPT 执行
> 读者：下一个执行 agent（GPT）。先读 AGENTS.md，再读本文件。

## 任务来源（不要重复造文档，全部已存在）

- **实施计划（你的需求全文）**：`docs/plans/2026-08-06-frontend-p0-p1-plan.md`（11 个 Task，含逐步骤与代码片段）
- **设计 spec（定稿）**：`docs/specs/2026-08-06-frontend-visual-system-design.md`
- **三方定稿决策（D1–D9）**：`docs/proposals/2026-08-06-frontend-design-direction-v1.md` 文末「v2 终稿决策层」
- **SDD 工作区与台账**：`.superpowers/sdd/2026-08-06-frontend-p0-p1-plan/`（`progress.md` 是恢复地图，含已完成任务与 deferred minor 清单；task-N-brief.md 由脚本生成）

## 当前状态

| Task | 状态 | Commit |
|---|---|---|
| 7.1 Tailwind v4 接入（theme+utilities 降级，无 preflight） | done | `2bacb65` |
| 7.2 token 层 + WCAG AA 门禁（accent-primary-strong #256BFF→#2A6DFF） | done | `fd46359` |
| 7.3 Noto Serif SC 字体（preload:false，CJK 分片按需）+ LocaleSwitcher 样式 | done | `61d19a4` |
| 7.4–7.11 | pending | — |

task-master：任务 `7`（11 子任务）已登记，7.1–7.3 = done。**每个子任务完成时同步 set_task_status，并在 commit 时带上 tasks.json**。

## 执行工作流（每个 Task 固定循环）

1. `bash .agents/skills/subagent-driven-development/scripts/task-brief docs/plans/2026-08-06-frontend-p0-p1-plan.md <N>` 生成 task-N-brief.md。
2. 派 implementer subagent：简报路径 + 全局约束 + 报告写 `.superpowers/sdd/.../task-N-report.md`。**implementer 不得 git commit**。
3. 生成 review package（未提交改动用 `git status` + `git diff -U10` + 新文件全文重定向到 task-N-review-package.txt），派 reviewer subagent 做规格+质量双审。
4. 审查干净 → 台账追加完成行 → task-master 置 done → **问用户是否 commit**（仓规：git 变更每次先问；本计划用户已建立的节奏是每 Task 审查过后问一次）。
5. 有 Important 以上发现 → 回 implementer 修复 + scoped re-review（最多 5 轮）。

## 全局约束（violation 即返工）

- pnpm 一律 `npx pnpm@9.15.0`；安装只动 apps/web（`--filter @openscience/web`）。
- 文案零硬编码：全部走 `apps/web/messages/{zh,en}.json` 的 `landing.*`（frontend-design 第 11 条）。
- 无 preflight（7.1 决策）：不能假设 UA 默认样式被重置；globals.css 只追加不改已有规则。
- 暖橙 `#FFB454` 只表 diff；禁大面积紫渐变；`prefers-reduced-motion` 全静态；装饰元素 `aria-hidden` + `pointer-events: none`。
- token 值以 tokens.css 为准（7.2 已 WCAG 验证）；改 token 必须同步 spec §3。
- 不引入 Three.js、Live2D/pixi（P3 的事）、不做双主题切换。
- 验证三绿：`npx pnpm@9.15.0 --filter @openscience/web test / typecheck / build`。

## 遗留 minor（终审时复核，台账有记录）

- Tailwind 自动探测出 4 条惰性 utility（.flex/.grid/.border/.outline），当前无元素使用。
- LocaleSwitcher 深色语境样式在浅色页面对比度不足——裁定：P3 产品壳统一解决。
- tokens 解析正则对 :root 内注释敏感；hexToRgb 仅支持 #rrggbb。

## 出口（Task 7.11 用户验收门）

Playwright 截两变体 × 三尺寸（1440×900 / 1920×1080 / 390×844，deviceScaleFactor 2）+ reduced-motion 组 → 用户选定符号变体 → 冻结 token（回写 spec §3 去"方向值"标注）→ progress.md 置顶条目 + project_index.md 登记 + `node scripts/docs/check-docs-sync.mjs` 与 `npx pnpm@9.15.0 docs:lint` 全绿。

## 建议技能

`subagent-driven-development`（继续执行循环）、`test-gate`（每个 Task 验证）、`docs-sync`（收尾登记）、`api-contract`（P2 的 GET /explore，不属于本计划）。
