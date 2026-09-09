# Hermes Research Intelligence CURRENT Handoff

## Goal and authorization
- 当前目标：上传PDF→服务器OCR/全文理解→凝练六字段和独立原文证据→Hermes内容驱动图解规划→服务器Codex生图→结果画廊。当前先停在图片，不运行视频。
- 用户禁止测试/预检/演练/CI测试、本机构建/运行；只编辑、静态阅读、传输及必要服务器构建/部署/启动。不得用手写论文内容冒充服务器生成。
- 保留来源、权限、确认、计费、回滚和parser无网络无secret非root只读512MiB边界；不删除文件、不打印凭据。

## Version tuple
- Worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- 代码HEAD/production 62e71a86f7c529ce6273674377f212626cd99912；canonical --no-tests部署exit0，rollback5b724c0b。后续文档commit不代表新部署。
- 部署日志1788940513640-798ed351-568a-4382-96ce-6a198d852fb0；首轮上传EPIPE，5c393844应用构建API漏output失败，c00c6233修复后部署成功。
- root main和其他worktree有独立改动，不覆盖。

## Current implementation
- 旧extractor错误地core=quote，summary被丢弃。本轮改grounded-summary-v1：中文凝练与1–3段原文分离，唯一精确/空白定位后回读原文；每block单一连续range、最多32段/8k证据，summary≤4k；不支持则保留缺口。
- 内置research-understanding skill实际加入server extractor系统提示并记录id/version；全文输入≤120k字符，不再静默仅选24k头尾；更长文档显式停下，尚无分层长文聚合。
- 未确认exact-quote-v1结果可按现有scope/consent/credit/CAS/幂等入口一次升级；grounded-summary本身不能无限付费刷新。
- OCR候选：隔离sidecar返回有界PNG，worker复核任务/上传同意/成员权限后调用官方MiniMax视觉识别；公式信号触发定向修复。主key保持，结构化额度耗尽才切备用。
- production worker实读AI开启、vision关闭、imageProvider=codex；主/备用均已配置（只读bool，未读secret）。候选compose明确开启vision。8/27凭据轮换旧记录未确认，不据此声称当前key已轮换或仍是旧key。
- 新content-driven-image-v1/7任务profile，1–6幅图片规划无动画/时长要求；图片审批齐全直接succeeded，不创建video；旧video profiles保留。
- storyboard/scene planner读取已审核EvidenceRecord原文，与摘要分开；生成前及落盘核对证据身份，图片须匹配父规划证据。每图真正调用Hermes生成≤1500字符科学绘图brief再交服务器Codex。
- 页面以结果画廊为主，来源/规划折叠，视频次级，保留修改、审批、错误恢复和完整尺寸入口；待服务器部署后实际观察。

## Actual paper state (processing; not confirmed)
- RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion7a28a7c8-90f7-429b-a519-53397cf58856；artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。
- Paper: Quantization of a Deep-Subwavelength-Aperture-Confined Optical Near Field.pdf，15页。
- 旧Agentf286cc57保留未确认partial；部署后通过服务器domain.refreshIngestionAnalysis正常scope/consent/credit入口创建新Agent1eafa17f-e31b-4932-9683-740ef9d5ec1a，返回parser needs_review/unresolved pages remain，未进入理解；审计无OCR调用。发现root误把vision flag加到API而非worker；已改正确worker区，待部署。未重复上传、未直接改DB。
- 先前不同论文run13e3fcd5-a6f0-48d6-82d7-33263e06fe33曾SUCCEEDED，四图/23.459秒视频，但仅方法Claims且有人工审批/恢复；不能充当当前全文自动能力证据。

## Browser and routing
- 用户已登录产品。用户回复浏览器已恢复后，CUA getState仍nodeRepl.fetch request failed，apps/browsers为空；失败在控制连接，不是网页HTTP。重置亦无效，本轮没有Chat回复或截图，不能声称网页复核。
- 沿用已批准产品方向。Sol/medium负责OCR、Terra/medium负责图片合同/UI、Sol/high定向静态复核，主线程集成摘要/来源和部署。没有可证明的本轮tokens节省比例。

## Next action
- 62e71a86已部署exit0（日志1788941404324-a4c83871-6710-4386-90ae-54b662621072）。worker实际visionEnabled=true且未禁用；原Agent1eafa17f通过正常retryIngestionTask入口queued/retry1，复用原credit，audit保留前次parser结果。实际retry1后4次minimax-vision provider_status失败，0文本；公开配置发现text token-plan origin为api.minimaxi.com而vision默认global。候选修vision缺省地区继承已配置text origin并记安全数字状态码；parser恢复最多2次，CAS/owner/原credit保持，不再扩次数。无测试/预检。
- 浏览器恢复后从现有任务正常重新分析，确认可读摘要/公式与证据，按正常授权生成图片并观察展示；不重复上传、不改DB强过、不制作视频。
- 如浏览器控制仍不可用，如实记录已部署与未观察到的产品结果，不反复要求用户登录。

## Read-first
- docs/OpenScience_Kimi_Development_Spec.md §5.4/§9；docs/plans/2026-09-05-integrated-research-product-plan.md当前范围。
- infra/scripts/deploy.sh；docs/runbooks/deployment.md §2.0 no-tests。
- 历史逐轮日志在Git历史，不恢复旧exact-quote产品目标。