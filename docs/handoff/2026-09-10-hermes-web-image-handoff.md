# Hermes / Workbench CURRENT Handoff

> 唯一交付树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航；旧 codex/onchip-video-release 缺 journals/学术身份，不得发版。历史详细证据保留 Git 与下方交接，不能按旧 next action 重跑。

## 目标与执行边界
- 用户 2026-09-21 要求复用其他项目成功的 Pro CLI 合作方式，继续 PDF 上传 → Hermes 全文分析/科学确认 → 多风格生图指令 → 图片 → 审查 → 发布；本批先完善学术、编辑封面、淡彩三类，保护认可作品，先完成真实论文再批量。不得以本机桥修复替代产品交付。
- 需求依据为 docs/OpenScience_Kimi_Development_Spec.md 的图片能力推进条款；Taskmaster currentTag=multistyle-research-illustration，任务1/2/4进行中、3依据用户已有认可 done。Taskmaster保存验收条件，本页独占动态资产与差额。
- OpenScience 禁止测试/预检/演练/CI；本机仅静态阅读、编辑、Git、传输。必要服务器构建/启动和针对已知阻塞的最小真实操作先说明范围。用户单独授权的本机桥修复/定向测试不扩展成应用测试。
- 用户已授权桥操作和本轮产品推进；不自动切 provider、不盲重发付费请求，不把模型成功当用户审美认可；Fig.2 五项清理仍未获明确同意。公开更新使用新版本，保护原论文、已认可图片和已有公开 v1。

## 已部署与产品暂停点（2026-09-21）
- 从 c388f9b081b837ca90e85d8aa67183cac999b1ed 继续；本轮应用与独立provider已部署，身份见版本段。Ultron 已成功方式是原生 CLI exec --approve-for-me resume + chatgpt-web/pro/ultra + STDIN，具体命令经正常自动审批；不能从主任务权限推导 Pro 权限。
- 本项目同 CLI 任务01a0be9a-a7c0-7003-9b08-ee12e130ef19已真实读Git/源码。首个长任务工具后续缺失、报告未写出；随后有界短任务完成真实读取→18行报告写入→完整读回，工具均exit0，tmp/pro-short-review-20260921.md及16-39-13日志是新证据。collaborate.mjs使用固定任务、并发锁、分离日志，失败保留锁；日志目录本机ACL限定Mac/SYSTEM/Administrators。共享桥/全局权限不改，Desktop完整补丁仍未安装。
- 站内实际路径：dashboard「继续编辑研究」→「研究详情」→「图解与视频」。新增原图入口复用Artifact上传→artifactId登记draft→人工对照PDF核图号/内容/Claim→来源批准→reuse。实现已收敛并部署，不再Base64独立写存储或自建PNG解码器；既有Artifact上传的崩溃窗口未声称全局解决。注册同锁核Blob/实际hash，拒绝图不复用，重放比较图注；DTO及32MiB原图读取已对齐。
- 一次真实 Hermes 编辑封面目标提交创建 workspace.guide 64aa264e-e1a2-4224-8509-7061b6babdce，失败“presentation draft 不在允许的版本上下文中”。原 POST context 仅 tasks/researchObjects，漏 presentation；没有提交图片。ResearchPresentation 独立 Drawer 已补当前RO/version并随版本重建，worker既有作用域诊断已接入结构化guard；修复已部署但站内新请求尚未提交；保留原失败，不盲重试。
- 所有候选已完成：原图UI/API/domain、Hermes上下文、深浅色边缘填色、新发布来源排除。独立High完成源码边界审查；最终保留图片+Claim+图注的完整重投身份，允许合法修正说明后新建draft，始终需再次人工审核。存储核验移到事务外、锁内重核；源Artifact清理引用保护与批准时可用性检查补齐。服务器必要编译/部署完成、独立provider安装完成；没有OpenScience测试/预检/CI/本机构建，尚未新生图/审批/公开，新增UI路径未在登录下观察。
- 登录事故：一次下载工具报错意外带登录会话字段进入本任务工具输出，已向用户说明并询问退出/重登；未获答复前暂停私有站内操作。错误输出已改固定代码，后续仅匿名获取已有公开PDF；不另存或再次转述字段内容。代码与服务器交付可继续，不能称端到端已完成。
- 真实PDF证据：匿名下载已公开Quantization PDF，568765 bytes，与原Artifact hash一致；15页全文提图号只见Fig.1，第5页已渲染/视觉核对。手动提取原Fig.1三子图+完整图注为tmp/pipeline-paper-figure-1.png（900×696/299886 bytes），服务器/jobs/pipeline-paper-figure-1-20260921.png及observations/paper-source-20260921/paper-figure-1.json；未上传产品。此PDF没有Fig.3原图，已有9f图是生成计划产物，不得冒作原文图3。
- 证据：本机 tmp/pro-collaboration/2026-09-20T16-15-06-004Z.jsonl；服务器 /jobs/pipeline-observe-20260921.json、pipeline-ui-20260921.json、hermes-editorial-ui-20260921.json。owned浏览器页 window.name=xgs-pipeline-20260921，失败目标仍保留。一次性 start 脚本不可重跑，read 脚本仅读取。

<a id="illustration-delivery"></a>
## 产品目标与交付差额
| 交付 / Taskmaster ID | 当前实际资产、认可与剩余工作 |
|---|---|
| 学术机制图 · 1 | 2026-09-21 API读回145af7bf-f9a5-46ca-a346-4914fdcbf17f approved，父d0b36138-e66e-4f4d-9f49-ff60095f7eeb approved。用户此前认可a7488c14版面，但该资产现为rejected；6d69159a/803e590b也已rejected，旧draft表已纠正，不恢复旧状态。仍需核当前认可作品与发布选择。 |
| 编辑封面 · 2 | 旧ac16631b现rejected。76918e55方案已审，但其7cd50e44出图uncertain且原恢复窗口已过，不可重发旧恢复。当前新目标64aa264e失败于UI漏版本上下文，修复后一次创建新待审方案，沿已审科学关系推进封面。 |
| 淡彩手绘 · 3 | aa41a018-b2ff-4ffb-9557-19ecabe104bc 用户明确认可且当前approved；保护原图，不默认重画。f424现rejected，不能计新增风格。 |
| Fig.3恢复 / 原图复用 · 4 | 8141b5fd-fd47-4c8e-b9f3-4b6558009095 approved，Fig.3/editorial/re-render；同task 9f7ff671-bf9e-4062-a3df-8236f7431975下载后恢复 succeeded，真实1280×720图入库draft且用户已认可，待按真实页面审批。真实论文原图从未通过reuse，上传候选/原图来源/独立审核及发布排除来源资产仍待闭环。 |

## 真实论文与受保护状态
- Quantization RO9067a2d5-42ad-4c06-b234-753728b71064 / draft e77dc3c7-95cb-4269-ac3c-24276fea74e7 / 已有公开OSR-2026-000023/v/1；已成功Claim93416292-0dbb-42b1-8810-6bdf77804c1f。deep-sub-cycle ROc896802c-35dd-4b59-8db1-5f374f83a6d8亦有真实论文及公开v1；第三篇aa450f1e-fafc-46d8-a072-d935e01b0544私有研究对象已上传但versions为空；原f653386b任务failed_blocked（full-document limit），不重复上传或盲重解析。
- ac455b2f-1e38-4b70-850c-72bade94e9a6目前approved，已有真实Chat产物。77b3f559-29b8-42d8-b95f-7fe142a4eefc为历史Fig.2占位、557c3db6-c3ac-4409-94ff-4afd3908beb5来源待核，均approved，不能直接发布全部approved或擅删。d5087b03-f734-43d1-b656-0e7c22c05c91是悬空draft copy。
- Fig.2重复计划6439150a/ee9bcfb6为draft，6043bebb/75b34c88为approved；原占位929bd95d/6088f11b/03a160aa已按早先授权删除，留存引用不证明真实论文图成功。完整影响/禁止动作见本次交接。

<a id="capability-linkage"></a>
## 已有能力与当前断点
- 既有三风格逐图选择、figurePlan确认/提交、科学符号保留、图像下载后恢复均已部署。自有科研插画Skill/科学Skill进入规划/美术/审阅；配图末审经Gateway MiniMax结构化池。Skill安装、注入和科学质量分别判断。
- 新标准化候选从四边RGB采样取主色、单色背景合成且保留完整画面/alpha，复用原512MiB无网renderer。服务器以9f原始1448×1086 PNG实际执行两段filtergraph，输出1280×720/484210字节、色fefefe、原图字节相等；/opt/openscience-chatgpt-browser/observations/normalization-20260921/receipt.json。新深色图/纹理边界仍待真实成图观察，不批量重算旧结果。
- 本机codex-chatgpt-web仅用于Pro代码合作，不支持网页聊天内生图；服务器image provider独立。Desktop委派/压缩续接补丁117+6项定向回归/类型/CLI构建通过但未安装：共享桥忙且单覆盖cli会被launcher校验回退，必须完整一致包、空闲切换及真实工具回合；不让此项阻塞已可工作的CLI方式。
- 新发布快照对原图来源加publicationIncluded:false，保留全部historyMedia及来源引用保护；公开列表/下载/hash使用同一集合。旧公开快照无字段保持原集合。预览与提交前复核同样排来源；不是删除资产或替用户批准新图。
- 两篇确认来源已补索引，任务8920bf4f/2135cd87成功，dense58/58与42/42；真实Weyl hybrid检索召回两篇，未重解析/重耗LLM。新正常论文六维凝练/claimSuggestions确认仍须实际产品观察，不能由索引成功代替。
- CUA本机policy初始化恢复已耗尽，不重试；沿用服务器Playwright/CDP。Langfuse已登录，额度/cost未知不算免费；SMTP/SSO/定时备份等原缺口保留，但不扩成本轮治理工程。

## Git、生产与独立能力版本
- 应用production=6bbf266cfc4758237db79179c4f31e794fa945a9，rollback=7a3a6a85bdbe19f9bd63009c841087ba3e06e824；本轮服务器所有包编译、镜像构建/启动完成，deploy exit0，.release-id与匿名/__release HTTP200读回相同SHA。命令带--no-tests --skip-migrate --reuse-unchanged-capability-images；完整日志tmp/pipeline-deploy-20260921.log。收尾HEAD为本记录所属文档提交，按Git定锚。根main acd13a712549e62f8d4b0f3c2f8f064549e226b0，worktree仅根+交付树。
- Chat provider独立bundle=6bbf266cfc4758237db79179c4f31e794fa945a9，image/science-review两个service源读回一致，两个timer均active。第一次安装被已有锁拒绝、未切换；暂停售时轮询并等待在途退出后原installer成功，按原状态恢复timer，未停浏览器/取消任务。备份/opt/openscience-chatgpt-browser/provider-backup-20260921-6bbf266c保存此前7a3配置引用/units/live文件；旧bundle与配置保留。renderer保持sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f，应用/provider分别回退。
- Serena源6684e448a6d924f7f5b1adce9e0e2e4057aa88d3；Catalog e02、telemetry061882123d14be00b868c1971c9d56de21d83b6e、SkillsCLI83179c454b75688176060fabf9e611072d46813c、Langfuse4.35.0复用。无新依赖/迁移/治理服务。

## 下一动作与交接入口
- 先处理用户待答的会话退出/重登选择；恢复登录后，从站内新版本配图页提交一次新Hermes封面规划并核version上下文，上传已提取的真实Fig.1→人工来源核对→reuse→成品审查，再按合法新公开版本发布。复用已认可学术/淡彩与已恢复Fig.3，不盲重画；新封面还需用户审美认可。
- 先读本页，再按故障读 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md 最新节；能力缺口在 docs/runbooks/hermes-capability-registry.md 原行更新，历史长证据不重复执行。
- 收尾两树status必须为空，提交/推送自己的改动，prune/list；临时证据只放ignored tmp/私有应用目录。确认归属、生产者结束且不用后才清理；现有每日09:00维护automation=automation，不再创建。日志/登录/他人任务/独有资产/回滚均保护。
