# Hermes Research Intelligence CURRENT Handoff

## Goal and constraints
- 当前目标：PDF→服务器OCR/全文理解→六字段凝练+独立原文证据→Hermes规划→服务器Codex生图→结果画廊。先停在图片，不执行视频。
- 用户禁止测试/预检/演练/CI测试和本机构建/运行；只编辑、静态阅读、传输及必要服务器构建/部署/启动。不得手写论文结果冒充服务器自动能力。
- 保留科学来源、权限、确认、计费、回滚与parser无网络/无secret/非root/只读/512MiB边界；不删除文件，不读写打印密钥。

## Version tuple
- Worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- 当前production/代码HEAD40e78370a7425008a64b8df2d2db7cbf91719e27；rollback62e71a86f7c529ce6273674377f212626cd99912。
- canonical --no-tests部署exit0，日志1788942112589-01cc12db-cd07-420c-a3b8-00ffe5dee2cc。新passage-ID候选未提交/未部署。
- main和其他worktree为独立任务，不覆盖。

## Deployed capability and actual corrections
- 已接通受控OCR：native公式标记→sidecar有界PNG→worker同task/actor/session/RO/artifact/member校验→MiniMax视觉；每批4页串行、每文档最多32需修复页；原native保留，OCR有独立页级bbox/processor provenance。
- 已修root compose flag误放API：worker当前visionEnabled=true且未禁用。已修refresh新session被错误要求等于初始batch session。
- 已修地区：文本token-plan endpoint是api.minimaxi.com，视觉未配置地区时原默认global导致provider_status；现在沿同key的显式text CN origin，仍允许vision region override。最近text primary成功，不换key；备用仅明确quota切换。
- 新content-driven-image-v1/7 profile：1–6幅静态图，无视频时长/动画要求，图片审批齐全直接succeeded；旧video profiles保持。
- storyboard/scene planner读审核后的EvidenceRecord原文，与摘要分开；生成前/落盘与父规划来源identity绑定；每图真实调用Hermes凝练≤1500字符brief后交服务器Codex。
- runtime research-understanding skill实际进extractor系统提示并返回id/version；≤120k全文，不静默只选24k头尾。更长文档尚无分层聚合。
- 画廊、场景标题、完整尺寸入口、折叠来源/规划、图片优先文案和错误恢复已部署；浏览器控制不可用，未做本轮截图观察。

## Current real paper (not confirmed)
- RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion7a28a7c8-90f7-429b-a519-53397cf58856；artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。
- Quantization of a Deep-Subwavelength-Aperture-Confined Optical Near Field.pdf，15页。
- 旧Agentf286cc57保留；正常refresh创建Agent1eafa17f-e31b-4932-9683-740ef9d5ec1a；两次正常parser retry复用原credit，旧parser结果在audit，无重复上传/手工DB重置。
- retry2真实OCR接通，多页minimax-vision succeeded（每页7–11s），SourceMap parserStatus=succeeded。
- 随后grounded-summary-v1仍partial：仅insight成功；problem/method/results/limitations quote_not_found，reproducibility missing_requires_empty。不可确认、不称论文处理完成，尚无这篇论文的新图片。

## Active fix: server passage IDs
- Sol/medium负责extractor：模型输出summary+sourcePassageIds，不再逐字复制quote；服务器从全文自然段/句生成编号，再按选中ID精确回读证据。最多6 IDs/field，≤8k证据/32原块，保留科学条件。
- 同块多个passages按明确合同覆盖首尾连续原文范围，绝不拼接省中间；缺失字段规范化为空，不为缺失解释浪费重试。
- root负责新grounded_passages_v1升级入口：仅旧grounded-summary-v1 partial+成功SourceMap，旧retry0..2且attempt对齐，同owner/RO/artifact/未确认/事务CAS；新任务正常计费，旧结果保留，新contract不能无限刷新。
- root index候选只对该升级验证current ingestion→newAgent、previous同owner/RO/旧contract/succeeded及成功SourceMap的artifact hash和存储digest，复用成功OCR只跑理解，不重复OCR调用。
- Web helper已改读public sourceMapAvailable（私有sourceMapRef被API删去），按对应旧contract显示升级入口。

## Browser and routing
- 用户已登录产品。回复“已恢复”后CUA getState仍nodeRepl.fetch失败；直接createBrowserTab也超时，未拿到可控tab。本轮无Chat回复/截图，不据此声称网站HTTP失败。
- Sol/medium OCR与extractor，Terra/medium图片合同/UI，Sol/high定点静态复核，root集成/服务器交付。没有可证明的整体tokens节省比例。

## Next
- 完成passage-ID候选及定点来源/权限复核，commit/deploy --no-tests，rollback取当前40e78370。
- 通过正常refresh升级现有Agent1eafa17f，必须看到sourceMapReused=true，读取实际六字段及来源再确认；不再增加parser retry次数、不重复OCR/上传。
- 正常Hermes image profile推进规划/图片。浏览器恢复后观察实际展示；没有真实图片前不能标记全流程完成。
- 精确需求读docs/OpenScience_Kimi_Development_Spec.md §5.4/§9，UX方案见集成产品计划；历史视频仅另一论文方法案例，不能代替当前全文能力。