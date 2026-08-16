# Handoff — 2026-08-16 Hermes 2.5D 星图宠物

## Current truth

- 用户已否决“仅轻微会动的链接角色”作为最终体验，并确认下一增量采用 **B — Hermes 情境引导员**：异步待机行为、真实上下文提示、右侧助手抽屉与正式 `workspace.guide` 任务闭环。新设计事实源为 `docs/specs/2026-08-16-hermes-contextual-guide-design.md`；当前尚未实施。
- 当前唯一 Hermes 视觉候选是分支 `codex/hermes-2d-pet` 的 2.5D 星图宠物；旧 `hermes-constellation-dragon` Blender worktree 已被用户判定 NO-GO，不得按旧计划继续建模或接入运行时。
- 形象为暖纸书页质感的少年星图龙：紧凑 S 形轮廓、深墨证据脊、六个 SDF 证据节点、额外头顶 Hermes 核心与朱砂引用尾。它不是通用机器人、摄像头、Live2D/Wanko 或 3D 模型。
- 本轮只完成 Personal Workspace / Dashboard 的轻量候选；未部署 ECS，未修改 Hermes 权限、配额、工具或任务状态模型。

## Implementation

- `HermesPetPortrait.tsx` 使用三张 824×824 原生 RGBA PNG；idle、blink、working 共享完全相同的 Alpha 摘要，blink 只替换眼区，working 只增加节点光。
- `HermesVisualAdapter` 继续拥有真实 task deep link、六状态和 pointer；位移向量不超过 6px，倾角不超过 2deg，离开回中。
- 运行时只显示一份 active frame；head/body/tail 使用不含角色位图的 CSS 观察光、呼吸晕和引用尾信号。待机为非同步周期，pointer 时 head 领先、body 跟随、tail 反向滞后；不存在底图加三份同源叠图的重复曝光与重影。
- CSS 提供 idle 呼吸/漂浮/眨眼、guiding/suggesting 节点脉冲、scanning working/扫描线、approval/failed 单一朱砂信号；reduced-motion 与 approval 静止，failed 不抖动。
- 当前活动帧未加载或失败时 SVG fallback 保持可见；E2E 通过人工触发 working error 证明 scanning 不会空白。

## Evidence

- 资产：三张 RGBA PNG 合计 1,472,269B；824×824；Alpha 摘要一致；来源 README 已登记。
- focused Vitest：5/5；完整 Web Vitest：246/246；Web typecheck、canonical root lint 与 production build GREEN，Dashboard first-load 129kB。
- 外部单 Next 服务 Playwright：2/2，覆盖六态 desktop、390px、reduced-motion、pointer 上界/回中、审批静止、active-frame fallback、主内容可见、无水平溢出与无 console/page error。
- 生命感增量 TDD：focused 先因缺少生命 signal 精确 RED；修复后 focused 5/5、完整 Web 246/246、重启后单服务 E2E 2/2 GREEN。真实 pointer signal X 位移约为 `7.89 / 3.94 / -2.96px`，idle 520ms 内三个局部 transform 均变化且互不相同；live `responsive → still` 同帧得到 `transition-duration: 0s` 与 `transform: none`。
- 独立复审最终为 `APPROVE`（0 Critical / 0 Important / 0 Minor）；重点确认单 active frame、still 对 engaged aura/node 的 CSS 级联优先级、pointer leave actual signal 回中与 readiness 去重。
- 截图位于忽略目录 `apps/web/test/visual/out/hermes-dashboard/`；桌面与移动端已人工检查完整，无旧审查报告所称空白页。

## Next action

1. 按 `docs/plans/2026-08-16-hermes-contextual-guide-plan.md` 直接执行 TDD，不再等待逐步批准。
2. 完成 `workspace.guide`、助手抽屉与待机行为语法后，运行纵向门禁与独立复审。
3. 自动化 GREEN 后仍需用户检查真实动态预览；不得恢复旧程序化 3D 或把未知 task kind 的 demo fallback 当成 Hermes。
