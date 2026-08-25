# Hermes Orbit Actions Implementation Plan

> 执行依据：`docs/specs/2026-08-19-hermes-wanko-live2d-design.md` §13.2。用户已于 2026-08-25 明确批准实施与部署。

**Goal:** 把当前单列页注菜单升级为围绕真实 Hermes 展开的 12 项情境动作系统，并让 Dashboard 两段式短句、动作反馈、移动端分组与安静工作场景形成一个不遮挡研究内容的连贯体验。

**Architecture:** Radix Context Menu 继续唯一负责右键、Shift+F10、Menu 键、焦点循环和关闭语义；新增纯数据动作目录作为文案、图标、真实路由和 Live2D action ID 的单一来源。`HermesWorkspaceStage` 负责动作与短句反馈的时序，`HermesVisualAdapter` 只负责菜单和口部锚定气泡的呈现。视觉使用暖纸、墨色、朱砂以及离散动作点，不继承 shadcn 默认皮肤。

**Stack:** Next.js 14、React 18、next-intl、Radix Context Menu、Lucide、Vitest、Playwright。

## Task 1 — 锁定 12 项动作合同

**Files:**

- Create: `apps/web/lib/hermes/context-menu-actions.ts`
- Modify: `apps/web/test/hermes-state.test.tsx`

1. 先增加失败测试：动作目录必须恰好包含 8 个陪伴动作和 4 个研究动作；每项有唯一 key、已有 `HermesActionId`、翻译 key、可访问标签；研究动作提供真实目的地解析。
2. 运行目标 Vitest，确认因目录缺失或合同未实现而 RED。
3. 实现只读动作目录及上下文相关的研究路由解析，不引入新 API 或隐藏写操作。
4. 重跑目标测试至 GREEN。

## Task 2 — 实现动作反馈与两段式 Hermes 发言

**Files:**

- Modify: `apps/web/components/hermes/HermesWorkspaceStage.tsx`
- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/lib/hermes/performance-beat.ts`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`
- Test: `apps/web/test/hermes-state.test.tsx` and relevant performance tests

1. 先增加失败测试：反馈携带被选动作的 action ID 和唯一一句口部短句；菜单与气泡不能同时存在；Dashboard presence/context 两句按顺序而非同时出现。
2. 将 `menuFeedback: boolean` 收敛为带 action/copy 的反馈状态；选择动作后关闭菜单，触发对应现有 Live2D action，再显示短句；研究动作同时执行真实导航或打开 assistant。
3. 输入、dialog、quiet、审批与 reduced-motion 场景停止自动发言；reduced-motion 仅取消位移/角色动作，不丢失菜单和文案语义。
4. 重跑目标测试至 GREEN。

## Task 3 — 实现桌面环绕动作点与移动端紧凑分组

**Files:**

- Modify: `apps/web/components/hermes/HermesVisualAdapter.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/test/e2e/hermes-dashboard.spec.ts`
- Modify: `apps/web/test/e2e/hermes-field-guide.spec.ts`

1. 先增加失败的浏览器/结构断言：桌面菜单显示 12 个离散动作点、至少 44px 命中区、清晰的 14px 以上标签、焦点态和来源连线；移动端显示“陪伴 / 研究工具”分组切换并可达全部动作。
2. 将 ContextMenu content 改为透明空间中的不规则环绕布局，利用 360px Hermes 上方和两侧留白；不画圆盘、不做独立卡片、不覆盖角色主体或页面主要文字。
3. compact/mobile 使用 200px 角色比例和单组列表；编辑、输入、diff、review、approval 场景使用更安静的紧凑呈现，并保留 compact/original/quiet 用户控制。
4. 用键盘、右键和长按逐项验证打开、聚焦、选择、关闭、反馈和普通点击 drawer 不回归。

## Task 4 — 质量门禁、视觉证据、文档同步与 ECS 发布

**Files:**

- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
- Modify: `project_index.md`
- Modify: `docs/runbooks/deployment.md` after successful deployment

1. 运行目标 Vitest、Hermes browser gates、Web typecheck/lint/build，再运行项目 `audit:docs-sync` 与 `docs:lint`。
2. 在 Dashboard desktop、hover/keyboard focus、动作后反馈、mobile long-press、editor quiet 五个状态采集高保真截图，人工检查文字可读性、气泡嘴部连续性、菜单来源与内容避让。
3. 执行差异审查、安全/架构边界复核和 completion verification；保持 worktree clean、HEAD 与 release ref 一致。
4. 按 immutable release runbook 部署 ECS，不执行迁移或 seed；验证服务器 build、容器状态、运行时资源、公网健康与 Hermes focused browser gate，并记录 release/rollback 元组。
5. 同步 progress、handoff、project index 和 deployment runbook；提交最终证据后向用户提供公网验收入口与需要重点判断的视觉维度。
