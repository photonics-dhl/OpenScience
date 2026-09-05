# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-06 +08。应用d6507ea已部署，rollback64ae872。后续文档提交不改变生产。

## Sourced storyboard delivered

- PR93：RO内Hermes分镜创建、自然语言修订、原稿/新稿对比与审批；媒体先于分镜、分镜全宽，中英文与手机可用。复用Gateway/任务/素材/Claim失效，无新依赖或迁移；计划不是生成图片/视频。
- 全仓build/typecheck/lint/test通过（现有search storage.integration8项需测试库而跳过）；最终Web503+5测试、11项浏览器通过，独立后端与前端复审、PR93和最终main CI通过。
- ECS最终d6507eaa07edfdacabe135fd30ff9f91183e0c02，rollback64ae87252ebf183742bb0cdfa96941be0fea3cf6；全build、Parser精确报告、BGE真实向量、ScanSci运行/OA、公网/loopback通过。core36/search2迁移最新，13容器运行/10健康，约94GiB磁盘可用；journal清除、retention完成。
- 受控私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78：3分镜任务、4次MiniMax-M3调用（1次结构化重试）、3扣额/3审计。旧两稿draft，纠正稿74ef00f4-be7e-4a95-9256-c22dbee7ad33 approved，六幕45秒规划。美元成本未提供，不编造金额。
- 内容审阅纠正了模型把平台来源说明误推成论文无独立复核的说法，改进研究者称谓与波前表达后再审批；JSON有效不代表科学正确。公网4组视口/语言、对比、批准刷新/重放、旧图解码与旧视频播放通过；测试会话注销。
- 证据ignored science-video目录：storyboard-browser-evidence.json、storyboard-audit-evidence.json、storyboard-approved-{1440,390}.png、storyboard-parser.log、storyboard-deploy.log。

## Existing foundations

- PR91媒体优先布局、PR88/89受审图片/视频导入/单Range/审批/Claim失效已部署；原媒体两资产保持历史失效测试rejected，没有公开论文或改变用户权限。
- 淡彩demo381705a/run381705a-20260905T121000Z保持；2172×724五层/十探测区域图，41.292秒视频3,203,000bytes，CPU渲染37.76秒。
- v4 Serena完整WAV41.28秒保留，未分段/补静音/变速。复用Chromium/Canvas/Qwen；torch基础约0.97GB、Qwen子镜像约2.04GB含基础、模型4.52GB。无新模型安装或本轮图片/视频调用。

## Next and limits

- 下一步让已核对分镜驱动可溯源图片和隔离CPU视频渲染，再接全局Hermes对话目标；当前只有RO内专门分镜入口。自动全文理解、生图、视频与语音对话不能标完成。
- 所选RO Claims及条件/限制是本轮输入，没有新增Evidence/SourceMap检索。现有PDF流程仍缺method/results/reproducibility自动提取，演示主张为人工核对。
- 并发撤权/来源失效可扣额后阻止落库；模型返回到素材提交之间故障可能重复provider调用，幂等重放产品只扣一次；Storage孤立对象/公开review digest历史债务保留。
- 唯一CURRENT交接docs/handoff/2026-08-16-hermes-2d-pet-handoff.md；根目录旧checkout与用户资料未动。已有前端分支定期巡检，不重复创建。
