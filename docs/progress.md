# OpenScience 当前进度

## 2026-09-12 — 以实际产物继续质量闭环
- branch codex/onchip-video-release，交付树.worktrees/onchip-video-release；当前应用0be34695/rollbackbff63acb，video runner0df87c9b，网页生图provider d1630135。HEAD另有待发布候选，以Git与CURRENT handoff为准。
- 用户明确要求继续落实与实际校验，不能部署即结束；本机不测试/构建，未运行测试/CI/预检。必要服务器build/start成功；保留原v10公开稿、PDF与已批准核心图。
- 真实笔记链：首次37ba18af schema失败；ee842ec4在100563字符/306段完整原文上生成；5cba07a6由M3按独立科学意见修订；仍有3处来源/阈值问题，最终在真实UI局部校正保存为40e23948。
- 最终《深亚周期光脉冲：机制与适用条件》2696字符/41引用，sourceStatus=user_edited。独立按原文内容复核通过；是经人工局部校正的稿件，不能冒充M3自动科学通过。
- 实际页面完成打开、改标题、4处正文校正、两次保存、重载、来源展开、Markdown下载；57个公式排版0错误，下载正文与保存稿一致。第一次有一次加载停留，刷新后核心API全200，原因未确认。
- 真实质量暴露并修复：48k范围遗漏193段；模型重复引用清单不一致；旧编号漂移；合并标记保存；论文refresh后旧稿来源关联；GET单任务漏RO编号导致稿件不显示。写作v3保留parser origin并补研究性质/几何/角积分/阈值/假设约束。
- 当前六字段未通过：未确认ingestion840e24f9当前f919d6fd，bridge两次schema拒绝（results_0_keys、total_points），无final/成功stage。前次f51c10ad也两次结构失败；不再只重申提示词后盲重跑。
- 当前已审候选：Gateway includeRejectedResponseOnRetry仅source_bridge开启，在原一次retry携带上一拒绝候选做结构修复；原source/guard/maxTokens不变，不强转/截断，不加调用/存储/正文日志。另修ScientificText行尾短公式shrink-to-fit出现小滚动条。
- 下一步发布这批必要修复，实际运行同一未确认论文，读取科学final/usage并按原文审核；同时观察行内公式换行。自动写作初稿准确性、长时页面稳定性、六字段续跑、多格式实样/新媒体质量尚不能宣布全部完成。

唯一接续入口：docs/handoff/2026-09-10-hermes-web-image-handoff.md；历史记录查Git，不以旧版本或旧“待批准”段落覆盖当前授权与服务器事实。
