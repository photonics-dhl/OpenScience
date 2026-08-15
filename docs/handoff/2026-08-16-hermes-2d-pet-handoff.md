# Handoff — 2026-08-16 Hermes 2.5D 星图宠物

## Current truth

- 当前唯一 Hermes 视觉候选是分支 `codex/hermes-2d-pet` 的 2.5D 星图宠物；旧 `hermes-constellation-dragon` Blender worktree 已被用户判定 NO-GO，不得按旧计划继续建模或接入运行时。
- 形象为暖纸书页质感的少年星图龙：紧凑 S 形轮廓、深墨证据脊、六个 SDF 证据节点、额外头顶 Hermes 核心与朱砂引用尾。它不是通用机器人、摄像头、Live2D/Wanko 或 3D 模型。
- 本轮只完成 Personal Workspace / Dashboard 的轻量候选；未部署 ECS，未修改 Hermes 权限、配额、工具或任务状态模型。

## Implementation

- `HermesPetPortrait.tsx` 使用三张 824×824 原生 RGBA PNG；idle、blink、working 共享完全相同的 Alpha 摘要，blink 只替换眼区，working 只增加节点光。
- `HermesVisualAdapter` 继续拥有真实 task deep link、六状态和 pointer；位移向量不超过 6px，倾角不超过 2deg，离开回中。
- CSS 提供 idle 呼吸/漂浮/眨眼、guiding/suggesting 节点脉冲、scanning working/扫描线、approval/failed 单一朱砂信号；reduced-motion 与 approval 静止，failed 不抖动。
- 当前活动帧未加载或失败时 SVG fallback 保持可见；E2E 通过人工触发 working error 证明 scanning 不会空白。

## Evidence

- 资产：三张 RGBA PNG 合计 1,472,269B；824×824；Alpha 摘要一致；来源 README 已登记。
- focused Vitest：5/5；完整 Web Vitest：245/245；Web typecheck 与 production build GREEN，Dashboard first-load 129kB。
- 外部单 Next 服务 Playwright：2/2，覆盖六态 desktop、390px、reduced-motion、pointer 上界/回中、审批静止、active-frame fallback、主内容可见、无水平溢出与无 console/page error。
- 截图位于忽略目录 `apps/web/test/visual/out/hermes-dashboard/`；桌面与移动端已人工检查完整，无旧审查报告所称空白页。

## Next action

1. 用户只判断最终 Workspace 视觉是否达到品牌要求。
2. 若用户批准，再单独决定是否合并与部署；不要把自动化 GREEN 当作审美批准。
3. 若用户否决，只迭代 2.5D 母版/呈现，不恢复旧程序化 3D，除非用户明确改变路线。
