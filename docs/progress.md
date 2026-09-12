# OpenScience 当前进度

## 2026-09-12 — 实际产物与最终成稿续作
- branch codex/onchip-video-release，交付树.worktrees/onchip-video-release；应用f2a53383/rollback0be34695，video runner0df87c9b，网页生图provider d1630135。根main旧且有其他改动，不作为生产基线。
- 用户明确要求继续落实与实际校验，不能部署即结束；未运行测试/CI/预检/本机构建。必要服务器build/start成功，原v10公开稿、PDF与已批准核心图保留。
- 真实私稿40e23948《深亚周期光脉冲：机制与适用条件》2696字符/41引用，M3全文生成、修订后仍有错引和中心/边缘阈值误比，最终经真实UI局部校正保存，保持user_edited。独立按原文内容复核通过，不代表自动首稿已可靠。
- 实际页面完成打开、改标题、4处正文校正、保存、重载、来源展开与Markdown下载，57式无渲染错误，下载正文与保存稿一致。发布后首次页面加载多次停留，失败时未发API且部分JS资源status0；再次刷新后JS/API全200，根因仍未知。
- 当前未确认ingestion840e24f9，agent0a9555bc的bridge成功（报告in32/out12858/93822ms），semanticStage reduction已实际保存。final失败STRUCTURED_OUTPUT_TRUNCATED：in16287/out32768/108584ms/length/text0/thinking1，六字段空，未采用。
- High独立审阅后候选只在final调用点增至65536上限，继续adaptive/300s/原guard；不修改共享预算，不禁用原文核对思考。下一次同源应直接复用stage，不重跑bridge。
- KaTeX下标容器实际右溢2px：vlist-t2负margin与vlist-s占位引起。width:max-content已部署但不足，候选补2px末端padding，待真实阅读观察。
- 下一步服务器发布这两项小修，续同源final并按原文审核真实六字段，同时观察公式显示。自动首稿准确性、页面加载稳定性、多格式实样与新媒体质量尚不能宣布全部完成。

唯一接续入口：docs/handoff/2026-09-10-hermes-web-image-handoff.md；历史记录查Git，旧“待批准”不覆盖当前授权与服务器事实。