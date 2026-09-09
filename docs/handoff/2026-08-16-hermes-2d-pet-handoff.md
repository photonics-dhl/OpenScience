# Hermes Research Intelligence CURRENT Handoff

## 最新用户纠正与候选
- 六维是展示组织，不是论文章节模板。method可隐含在推导、结果、图注或附录；先全文综合，再组织六维与核对来源。不能把来源格式失败称为论文缺失。
- 本轮浏览器恢复：getTab用60秒成功，实际发送原Chat对话，网页6 Pro回复已读取，主张同次调用全文综合→六维组织→来源核对，来源失败保留草稿待核对。后续可复用CUA directChat.playwright.domSnapshot（比AX快）。
- 已部署Hermes runtime skill v2和extractor提示；unverifiedSummaries只保留有界未绑定摘要，不写core/evidence；UI明确来源整理失败与待核对草稿，自动展开诊断。服务器部署成功；未重新处理当前论文。

## Goal / constraints
- PDF→服务器OCR/全文理解→六字段凝练+独立原文→Hermes规划→服务器Codex生图→画廊。视频暂停。
- 用户禁止测试、预检、CI测试、本地运行/构建。允许本地编辑/静态阅读/传输及必要服务器构建部署、实际产品处理。不删除文件、不读取打印密钥，不手写论文结果冒充服务器能力。
- Parser保持无网络/Secret、非root、只读、512MiB；保留权限、来源、计费、确认与回滚。

## Version
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- production/code release a9b6c1545905a94b5d330c6cb91bd5f13f7a4f1a；rollback 11ae62000e59fa07f1c556f76e1b73638198c048。
- canonical --no-tests部署exit0，日志1788949130443-30772096-3fba-4f5f-b77b-e4a344100593。
- 后续仅状态文档提交不代表新production。其他worktree/main有独立改动，不覆盖。

## Actual paper and current blocker
- RO9067a2d5-42ad-4c06-b234-753728b71064；ingestion7a28a7c8-90f7-429b-a519-53397cf58856；artifact4b94c626-1748-4c5a-934b-2bb94585bd9c。
- Quantization of a Deep-Subwavelength-Aperture-Confined Optical Near Field.pdf，15页。
- 当前Agent5dba592b-62f5-4bbd-ba80-97d2c5cc4aab，retry1，status succeeded但reason canonical_partial_validation_exhausted；grounded-passages-v2，sourceMapReused=true。
- 已返回problem/insight/results/limitations/reproducibility，method为空，诊断passage_ids_required。未确认、未进入Hermes生图。不能把Agent succeeded称为论文处理成功。
- 更重大问题：模型摘要不忠实。原文Eq40明确applies from near field to far field；limitations却把两种极限写成公式成立条件并声称范围外未讨论。results把j1(x)≈x/3混称为完整形式因子的极限；来源中完整因子是3j1(x)/x。局限还从特定模型假设过度推出不能推广，而所选结论原文明确讨论可推广。必须修复语义忠实性再确认，不能仅放宽schema或手改内容。
- 所选证据保存精确但可能不充分：results/limitations来源文本已实际读到。来源可定位并不等于摘要有充分支持，需要服务器语义复核/定向修复。

## Delivered implementation
- OCR已实际成功：native公式标记→sidecar PNG→worker权限绑定→MiniMax视觉，4页串行批、最多32修复页；原native和OCR独立provenance均保留，OCR为页级bbox。
- 已修worker vision开关位置、refresh session误约束、CN/global视觉endpoint与同key文本endpoint不一致。没有读取更改key，备用仅明确quota时切换。
- grounded-passages-v2：模型输出摘要+来源编号；每P≤5原blocks/1200chars，全文≤120k无静默裁剪；来源最多6IDs/32blocks/8k、摘要4k。同原block多个片段按首尾连续原文展开，再locator roundtrip，不能省中间。
- 提示包含每段blocks/chars、完整六字段JSON形状、字符串ID与转义说明；JSONparse失败固定格式修复反馈；同一次结构化重试保留此前已验证字段，最后JSON错误不会丢弃有效partial。固定最多3次调用未增加。
- 正常analysis refresh按旧contract版本升级，保持owner/active session/RO/artifact/hash/存储digest、CAS、稳定付费idempotency key，保留旧Agent/results。v2不进入现有refresh或passageBudgetRecovery。不要再为单篇失败不断增版本或扩大免费重试。
- 旧grounded-summary→passage-v1、passage-v1→v2升级复用成功SourceMap，实际sourceMapReused=true，无重复OCR。新analysis正常扣1平台credit；已有一次retry复用原reservation，审计保留旧partial。
- content-driven-image-v1 profile（最多7tasks）及1–6静态场景、Hermes真实绘图brief≤1500chars、审核后原文绑定/生成前来源identity重验、结果画廊均已部署。当前论文尚无新图片。

## Browser / routing / validation
- 本轮已恢复原Chat并获得6 Pro规划复核，未做产品改后截图；旧nodeRepl超时记录不代表当前浏览器不可用。
- Sol/medium extractor/OCR、Terra/medium UI、Sol/high定点静态复核，root集成部署。整体token节省比例无基线，不能编造。
- 没有测试/本机构建；必要服务器编译首次4d499743发现两处类型遗漏，913002b8修正后后续发布成功。静态复核不能代替运行结果。

## Next
- 首先解决科学忠实性与method来源选择：字段总结须与选中证据逐项对照，纠正适用条件/极限、物理量身份和原文未声明的排除性结论。需要服务器正常处理路径的能力，不能Codex手写稿或盲目重复付费调用。
- 复用当前上传/OCR和保留旧结果；不要再加单篇专用contract版本/免费重试。设计可重复的用户发起重新分析与服务端语义修复边界后实施。
- 内容正确后正常confirmIngestionTask→Hermes run/source/claim review→image profile规划与服务器Codex图片。不要执行视频。
- 浏览器控制恢复后再观察登录页、Hermes跨页闪烁与画廊布局；用户登录状态不需重置。
- 需求基线 docs/OpenScience_Kimi_Development_Spec.md §5.4/§9，UX方向见docs/plans/2026-09-05-integrated-research-product-plan.md。
