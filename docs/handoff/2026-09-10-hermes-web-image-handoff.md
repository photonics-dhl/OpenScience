# Hermes / Workbench CURRENT Handoff

## 当前任务与授权
- 一站式Hermes：科学文档/公式 → 全文理解与凝练 → 科学写作/引用 → 精美笔记 → 多格式资料 → 图片/视频艺术风格、叙事与旁白。生产继续MiniMax-M3；Chat6Pro仅开发讨论。
- 用户2026-09-12明确允许按其写作指令，将当前研究私有草稿与必要摘录发送现有MiniMax。普通问答不自动触发全文写作，不包括无关研究或自动公开。
- 本机仅编辑/静态阅读/传输，无测试/预检/CI/本机构建；必要build/start在服务器。用实际论文推进，不循环重跑。

## 版本
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch codex/onchip-video-release；HEAD以Git为准，未合并main；根目录无关改动不碰。
- ECS应用 0df87c9bee98c2280396551ed522e66230eaf381；rollback 68a0e6b248891b308a963f75988bf230f1b832c4。工作树HEAD另有后续docs提交，以Git为准。
- 干净发布树 E:/Miscellaneous/XGS/.worktrees/deploy-m3-thinking。aa5d2e85写作/诊断在本次修复两处编译错误后已上线：Web漏SourceLocator导入/导出、Worker回调正文类型收窄丢失。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264；rollback 92cc416ee3fe921f62c75cbe6f69e48d0b55227d；浏览器/会话/出口路线未改。
- 独立video runner已更新0df87c9bee98c2280396551ed522e66230eaf381，install exit0、active/accepting；复用既有TTS/renderer镜像与模型，旧请求兼容。旧service保存于/opt/openscience-video/service-before-0df87c9bee98c2280396551ed522e66230eaf381，应用先回退68a0后才按需恢复旧service。
- 两批必要服务器build/start均exit0，公网/__release与.release-id一致、API/Worker healthy；日志 C:/Users/Mac/AppData/Local/Temp/xgs-hermes-writing-build-fix-deploy-20260912.log 与 xgs-media-direction-deploy-20260912.log。不等于真实写作/媒体质量通过。

## 最新真实论文结果
- 未确认ingestion 840e24f9-cf9b-471f-a38c-7331705b1003 当前agent a1c0da49-d2ea-4407-b3e6-b68eadd72ceb；任务succeeded、scientificReview blocked，六字段空，未采用/发布。
- a1ff补齐语义JSON契约后，原文bridge第一次通过：M3 21536输入+20655输出=42191 tokens，124574ms、stop。
- final主凭据182424ms返回provider_empty，备用凭据HTTP401。旧Adapter丢弃空正文响应usage/stop，Gateway错误记0；final真实用量未知，不能记0，也不能由耗时推断触顶/超时/纯思考。
- 结果 /jobs/hermes-semantic-contract-product-result-20260912.json（服务器浏览器）；只保存bridge元数据，不能由hash恢复已丢失正文。
- Chat6Pro同会话6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581最新回复已读：/jobs/hermes-provider-failure-diagnosis-20260912.txt。建议安全失败元信息、保留语义结果、来源约束成稿；不自动增加预算/换供应商。其建议不是新锁/契约的授权。

## 已部署能力
- Docling CPU1.30 + CodeFormulaV2缓存；保留TeX/页/bbox，安全KaTeX。26页32式中28可排版、4损坏保留低置信原文；核过两个代表式，不宣称全部物理正确。
- M3显式adaptive：分段16k/180s、整合32k/300s。默认长文map→semantic reduce→final，短文/旧候选原P bridge→final；paper-analysis v8/scientific-summary v2。
- XLSX/PPTX/HTML上传及原解析链已接入；外链/资源只清洗派生副本，原件保留，多样文件兼容尚未观察。没有另装OCR/浏览器。
- 单一创建对话/附件入口及首条Hermes接续、去除大小按钮；新建页实际portrait208×208/opacity1。未另造数据验证首次创建。
- 桌面静默任务更新、编辑资料在文末、公开图文/缩略图、SessionProvider已部署；短期观察不证明所有长期登录情况。

## 本轮写作与媒体已部署
- 科学写作backend：同用户/RO/当前membership校验，SourceMap程序引用，私有note/review/manuscript。明确写作/修订才加载全文，普通问答及否定指令不触发。
- 直接保存不调用模型；生成/修订maxRetries0（一次provider cycle，供应商fallback可能多次）。写作稿不覆盖SDF或发布。
- 笔记frontend：Hermes卡片进入宽阅读/编辑弹层，安全Markdown/公式、来源折叠、下载、真实保存。同用户/RO恢复；sourceTaskId是提取来源，baseDraftTaskId是写作任务。
- High静态审阅发现的误触发、普通提问携带整稿、旧task链接覆盖最新稿均已修复并上线；首份真实写作产物仍待用户选择。
- 空响应诊断High静态复核通过：失败usage缺失记null、记录规范化finish/block计数，无正文/thinking/Secret；明确length才停止同预算fallback，不能反推旧故障。
- 语义续跑两版补丁均遭自动审批拒绝（新增复用校验必要性不足），已停止并撤销extractor本轮片段。现已向用户说明具体故障/风险并请求明确批准；未收到前不重试或换工具绕过。
- 待批准方案：仅在现有私有semanticStage保留已成功reduction与P绑定，复用现有来源hash/授权/schema校验；同源原文时只续final。不新增存储层/hash/锁，不采用候选。
- 用户尚未选择首份写作产物（笔记/评述/暂不生成），不能把部署授权当具体生成指令。
- 第6项已部署0df87c9b：media-direction运行时艺术/叙事指令接入原分镜/图片规划，视频locale/style沿既有storyboard文件传递；独立High静态review无阻塞。先runner后Worker已完成；复用镜像/模型。content-driven风格影响现有纸色/强调色，不等于任意生成式镜头。中文视频入口保持，未生成新媒体；视频和批量冷启动暂缓。

## 保护内容
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，草稿修订11。
- 公开 https://openscience.428312321.xyz/research/OSR-2026-000022/v/10；PDF 7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批准图 b19a65bd-6497-4b61-bb81-0154b264d58c；plan 3a6ed136-002a-4301-8505-ca14e3dbbc53。
- 原确认ingestion 2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / sourceAgent 1e324308-fd26-4cc1-8612-8a1c269909a9受保护。
- 旧19/20/21可恢复归档，原文件/公共ID保留。一篇带图已发布；2–3篇精选、多图真实样本、视频未全部完成。

## 后续
1. 写作/诊断与媒体增强部署完成。当前等待首稿类型选择与语义续跑范围批准；不得以部署成功宣称整套真实旅程完成。
2. 续跑授权后再实现复用机制并审阅。从当前a1c做一次未确认refresh；旧bridge正文未存，不虚称可直接恢复。
3. 读实际final与usage/stop，核对原文科学关系；不合格不写原确认稿/公开版本。
4. 用户指定写作产物后经服务器实产，记录真实保存与阅读；媒体代码与上线不能代替新图/成片质量观察。

## 历史比较
- 62ae final40230tokens过长/条件泛化；0e final19380少51.83%但语义不合格：不是质量不降节约率，也非Codex总量。
- 5b bridge两次schema拒绝，时间窗79119tokens，无final；a1ff契约已修。
- 原文确有角积分/特定模型比较，不应一概判错；旧稿实错为运算对象替换、相位/幅值混淆、对照条件缺失和算例堆叠。
