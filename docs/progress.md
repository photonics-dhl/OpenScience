# OpenScience 当前进度

## 2026-09-12 — 实际科学质量仍在闭环
- branch codex/onchip-video-release，交付树.worktrees/onchip-video-release；应用236dfdb8/rollbackf2a53383，video runner0df87c9b，网页生图provider d1630135。根main旧且有其他改动，不作为生产基线。
- 用户明确要求继续落实与实际校验，不能部署即结束；未运行测试/CI/预检/本机构建。必要服务器build/start成功，原v10公开稿、PDF与已批准核心图保留。
- 私稿40e23948《深亚周期光脉冲：机制与适用条件》2696字符/41引用，经M3生成修订、独立原文复核与真实UI局部校正后保存/重载/下载完成，保持user_edited。该稿内容复核通过，不代表自动首稿已可靠。
- 57处公式无渲染错误；已定位KaTeX下标负margin引起的2px溢出，236dfdb8补末端padding后，实际原5处小滚动条全部消失。
- 当前未确认ingestion840e24f9，agent4099a967实际复用0a9555bc的成功stage，仅一次final in16282/out10724/104012ms/stop。前次32768 thinking-only截断后，仅final预算提高65536，仍adaptive/300s；未重跑bridge。
- 4099a967六字段结构通过但独立科学核读否决：THz光子数漏能量/耦合条件、串用Fig3边缘阈值、伪单变量比较、模型互证公式错引与过强复现声称；method抄式且漏同步。结果未采用。
- 当前source-only final候选已High复核：只传字段P并集及原始P，移除上游候选措辞/公式/分组/chosenCase；scientific-summary v3用通用同算例/条件相邻/阈值位置/复现范围规则，原guard/全部召回P/持久化保留。不硬编码论文，不增加模型轮次。
- 服务器浏览器首次加载多次停留，最新捕获7个JS的ERR_INSUFFICIENT_RESOURCES；刷新后JS/API全200。资源观察1.7/4GiB、454/1024pids、shm56%、OOM0，具体根因未证实。
- 下一步发布source-only候选，继续复用stage仅成稿并独立核读实际六字段。新媒体/批量冷启动继续暂缓；多格式实样和浏览器长期稳定性尚未确认。

唯一接续入口：docs/handoff/2026-09-10-hermes-web-image-handoff.md；旧“待批准”不覆盖当前授权与服务器事实。