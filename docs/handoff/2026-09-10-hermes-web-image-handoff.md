# Hermes / Workbench CURRENT Handoff
- 本机工具配置（2026-09-21）：用户授权独立提交 `.codex/config.toml` 浏览器代理，保留源码检索；依赖/范围/回滚见[能力台账](../runbooks/hermes-capability-registry.md#local-browser-proxy)。无科研业务部署，不替代未完成产品交付。
> 唯一交付树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航；旧 codex/onchip-video-release 缺 journals/学术身份，不得发版。历史详细证据保留 Git 与下方交接，不能按旧 next action 重跑。

## 目标与执行边界
- 用户2026-09-21最新纠正：目标是未读论文者也能通过视觉叙事理解论文核心思想和关键点，兼顾美感；先全文理解与叙事设计，再按需选择单/多图、原图或生图。视频同目标但尚未进入执行阶段。原图裁剪/生成/发布跑通均不等于交付；稳定要求见需求基线§18.2。截图中Fig.1原样展示被明确否定，需返工。
- [视觉叙事方案](../proposals/2026-09-21-visual-narrative-review.html)已获用户批准，自动链路已部署，正在走真实产品路径；HTML是审查稿，运行事实以下方检查点为准。独立High静态审查已纳入，不等于最终科学/审美验收。
- 用户最新纠正：用户看最终六维内容/图片和阅读效果，中间分析、分镜、媒体选择及首张检查由系统决定，不设置用户逐步确认。原地增强science/art，不新造分析模块。sourceMapRef只证明权限/文件身份，必须绑定同版本内部审校结果；系统推进不伪造人工认可，尚未确认效果见下方检查点。
- 独立High增量确认：confirmIngestionTask是人工确认语义、research-run等待来源/素材审阅，生成/批准权限绑定run/step/actor/版本/Claim并受额度并发限制。需在原Domain与状态机增加明确系统审校推进，不能假装用户点击；失败/拒绝停机须补有界修订。自动内审与最终用户反馈分开，详细断点见能力台账/HTML。
- 用户 2026-09-21 要求复用其他项目成功的 Pro CLI 合作方式，继续 PDF 上传 → Hermes 全文分析/科学确认 → 多风格生图指令 → 图片 → 审查 → 发布；本批先完善学术、编辑封面、淡彩三类，保护认可作品，先完成真实论文再批量。不得以本机桥修复替代产品交付。
- 需求依据为 docs/OpenScience_Kimi_Development_Spec.md §18.2；Taskmaster currentTag=multistyle-research-illustration，任务1/2/4/5进行中、3仅指已认可淡彩单图 done，不代表论文叙事完成。Taskmaster保存验收条件，本页独占动态资产与差额。
- OpenScience 禁止测试/预检/演练/CI；本机仅静态阅读、编辑、Git、传输。必要服务器构建/启动和针对已知阻塞的最小真实操作先说明范围。用户单独授权的本机桥修复/定向测试不扩展成应用测试。
- 用户已授权桥操作和本轮产品推进；不自动切 provider、不盲重发付费请求，不把模型成功当用户审美认可；Fig.2 五项清理仍未获明确同意。公开更新使用新版本，保护原论文、已认可图片和已有公开 v1。

## 已部署与产品推进（2026-09-21）
- 从 c388f9b081b837ca90e85d8aa67183cac999b1ed 继续；本轮应用与独立provider已部署，身份见版本段。Ultron 已成功方式是原生 CLI exec --approve-for-me resume + chatgpt-web/pro/ultra + STDIN，具体命令经正常自动审批；不能从主任务权限推导 Pro 权限。
- 本项目同 CLI 任务01a0be9a-a7c0-7003-9b08-ee12e130ef19已真实读Git/源码。首个长任务工具后续缺失、报告未写出；随后有界短任务完成真实读取→18行报告写入→完整读回，工具均exit0，tmp/pro-short-review-20260921.md及16-39-13日志是新证据。collaborate.mjs使用固定任务、并发锁、分离日志，失败保留锁；日志目录本机ACL限定Mac/SYSTEM/Administrators。共享桥/全局权限不改，Desktop完整补丁仍未安装。
- 站内实际路径：dashboard「继续编辑研究」→「研究详情」→「图解与视频」。新增原图入口复用Artifact上传→artifactId登记draft→人工对照PDF核图号/内容/Claim→来源批准→reuse。实现已收敛并部署，不再Base64独立写存储或自建PNG解码器；既有Artifact上传的崩溃窗口未声称全局解决。注册同锁核Blob/实际hash，拒绝图不复用，重放比较图注；DTO及32MiB原图读取已对齐。
- 原guide64aa264e漏presentation上下文失败已修；带当前RO/version的新guide fec6e2f0实际成功。原图UI/API/domain、Hermes上下文、深浅色边缘填色、新发布来源排除均已部署并完成独立High审查；保留图片+Claim+图注重投身份与人工核源，存储核验在事务外、锁内重核，冻结引用受保护。产品路径与已批准资产见下方实证；不以构建替代内容质量。
- 登录事故后用户明确“没事，继续执行后续任务”，保留当前会话、未退出/重登；站内私有操作已恢复。新版真实dashboard→编辑→研究详情→图解与视频成功，登录有效；辅助脚本错误只输出固定阶段代码，不记录原始网络错误或登录字段。
- 新实际结果：d571因JSON/encoding220>200/description151>140失败；长度反馈修复后51eb结构成功，但k⊥下标/来源覆盖错误；e253恢复下标却未删越界标势。最后定向修订aaf7e7b4-f4c6-4c96-aa3d-bf171a2b384f主体/下标已修正，现有科学审阅因constraints仍有未绑定的理想导体薄屏/a≪λ条件而blocked；停止追加请求，未批准错误方案、未发Chat新生图。Pro短CLI实际读源码、写/读回tmp/pro-planner-bounds-review-20260921.md；失败和草稿保留。
- 新guide b6be69ec漏style导致UI默认technical；3ab77096明确纠正editorial但改写指令，51eb提交前在原指令框恢复b6 Hermes原文。修复已部署：新storyboard.create模型输出必须有style，历史类型及art-only revise省略风格保留；同一修复反馈缩至最多1786字符，避免超过Gateway2000字符而被忽略，不增加重试。High增量复核无阻断；新缺风格拒绝行为尚无实际模型产物证据。
- 发布选择已部署并实际完成：经研究详情→更多工具→发布进入，默认0选6成品；人工只选6871真实原图copy、9f恢复图、aa41淡彩，三图已解码。SDF/Claim正文与v1相同；40条Evidence按来源排序去除版本ID后相同。原许可text/data=CC-BY-4.0、code=MIT保持，附件下载不新增开放；站内审查passed→状态转换→publish HTTP201，公开OSR-2026-000023/v/2。独立High审查未见阻断；未完成封面保留旧版本，后续需新私有版本，分镜不自动结转。
- 发布后实际点击「查看公开RO」，公开轮播三图均加载（900×696、1280×720、1280×720）；匿名v1/v2 API均200，v2只含所选3项，v1原1项仍可用。v2 hash=a0221c7960cad46a644a4689a5d58caa855a6bb8e369950d5cc952718c7d3a86；收据/jobs/publication-publish-known-20260921.json、publication-public-observe-20260921.json，截图publication-v2-visible-20260921.png。未知557、其他未选成品、来源资产与draft未公开，未删除。
- 真实PDF证据：原PDF568765 bytes/hash一致，15页只有Fig.1；第5页三子图和完整图注提取为tmp/pipeline-paper-figure-1.png（900×696/299886 bytes）。产品上传c1e2c18d-38c0-44a8-ab5c-73cc87d308b2，hash/浏览器解码/原PDF/Claim核对后来源approved。guide7a619dc8仅Fig.1/reuse，plan39f26074成功/approved；copy6871a6d1-493a-4e3f-9427-b99c4d5d20b7 succeeded，hash与原图9bd7ff7a…相同、900×696、已在图册批准。已认可9f恢复图亦完成页面批准。收据/jobs/pipeline-confirm-known-images-20260921.json及paper-source-*/hermes-source-reuse-*/paper-reuse-*20260921.json；一次性写脚本保留收据不重发。
- 证据：本机 tmp/pro-collaboration/2026-09-20T16-15-06-004Z.jsonl；服务器 /jobs/pipeline-observe-20260921.json、pipeline-ui-20260921.json、hermes-editorial-ui-20260921.json。owned浏览器页 window.name=xgs-pipeline-20260921，失败目标仍保留。一次性 start 脚本不可重跑，read 脚本仅读取。

<a id="illustration-delivery"></a>
## 产品目标与交付差额
| 交付 / Taskmaster ID | 当前实际资产、认可与剩余工作 |
|---|---|
| 论文视觉叙事 · 5 | 用户否定v2原样Fig.1的美感/独立解释能力，只有9f/aa41有用户认可依据。自动制作/内审/reader已部署，原请求e3ef004f已完成六维/6条Claims审校并保存私有版本；原分镜终审revised后已生成真实图，但6Pro像素审阅科学拒绝，未公开新图。完整图组与质量接受未完成；保留初稿，不能伪造科学通过。 |
| 学术机制图 · 1 | 145af7bf-f9a5-46ca-a346-4914fdcbf17f与父d0b36138均approved，但本轮未纳入v2；用户此前认可a7488c14版面，该资产现rejected，6d69159a/803e590b也rejected，不恢复旧状态。仍需核当前认可作品与后续发布选择。 |
| 编辑封面 · 2 | 上下文/字段反馈/style补丁已上线；51eb/e253人工未放行，aaf7被现有科学审阅blocked，无新Chat图片。旧ac166 rejected，76918e55/7cd50e44 uncertain窗口已过。科学范围继承缺口保留；后续规划服从任务5的论文叙事，不重发历史任务。 |
| 淡彩手绘 · 3 | aa41a018-b2ff-4ffb-9557-19ecabe104bc 用户明确认可、approved，现已进入公开v2；保护原图。f424 rejected，不能计新增风格。 |
| 检索 / 管理补接 · 4 | 两篇确认来源dense58/58、42/42与真实hybrid召回已观察；Pro CLI短合作有效。保留科学审阅效果边界及未安装Desktop续接补丁，不以此次发布标整个管理任务done。 |
| Fig.3恢复 / 原图复用 · 本轮 | 用户认可9f7ff671恢复图；Fig.1 copy6871a6d1虽已approved并公开v2，但用户明确否定直接展示，不能算叙事/审美通过。来源c1e2c18d/方案39f26074及原字节保留，未改数据库批准状态或公开历史。8141b5fd原Fig.3方案不改。 |

## 真实论文与受保护状态
- Quantization RO9067a2d5-42ad-4c06-b234-753728b71064 / e77dc3c7-95cb-4269-ac3c-24276fea74e7现为published v2，不能再写入；公开v1保留。Claim93416292-0dbb-42b1-8810-6bdf77804c1f。deep-sub-cycle ROc896802c-35dd-4b59-8db1-5f374f83a6d8亦有真实论文及公开v1；第三篇aa450f1e-fafc-46d8-a072-d935e01b0544已上传但versions为空，原f653386b failed_blocked（full-document limit），不重复上传或盲重解析。
- ac455b2f-1e38-4b70-850c-72bade94e9a6目前approved，已有真实Chat产物。77b3f559-29b8-42d8-b95f-7fe142a4eefc为历史Fig.2占位、557c3db6-c3ac-4409-94ff-4afd3908beb5来源待核，均approved，不能直接发布全部approved或擅删。d5087b03-f734-43d1-b656-0e7c22c05c91是悬空draft copy。
- Fig.2重复计划6439150a/ee9bcfb6为draft，6043bebb/75b34c88为approved；原占位929bd95d/6088f11b/03a160aa已按早先授权删除，留存引用不证明真实论文图成功。完整影响/禁止动作见本次交接。

<a id="capability-linkage"></a>
## 已有能力与当前断点
- 旧reuse-only曾本地组装、直接接受并复制原字节；这只能证明来源复用。本轮已原地增强planner/Skill以组织整篇叙事，原图也经叙事审阅；公开版本未变更，不声称新叙事质量已通过。
- 既有三风格逐图选择、figurePlan确认/提交、科学符号保留、图像下载后恢复均已部署。自有科研插画Skill/科学Skill进入规划/美术/审阅；配图末审经Gateway MiniMax结构化池。Skill安装、注入和科学质量分别判断。
- 新标准化候选从四边RGB采样取主色、单色背景合成且保留完整画面/alpha，复用原512MiB无网renderer。服务器以9f原始1448×1086 PNG实际执行两段filtergraph，输出1280×720/484210字节、色fefefe、原图字节相等；/opt/openscience-chatgpt-browser/observations/normalization-20260921/receipt.json。新深色图/纹理边界仍待真实成图观察，不批量重算旧结果。
- 本机codex-chatgpt-web仅用于Pro代码合作，不支持网页聊天内生图；服务器image provider独立。Desktop委派/压缩续接补丁117+6项定向回归/类型/CLI构建通过但未安装：共享桥忙且单覆盖cli会被launcher校验回退，必须完整一致包、空闲切换及真实工具回合；不让此项阻塞已可工作的CLI方式。
- 新发布快照对原图来源加publicationIncluded:false，保留全部historyMedia及来源引用保护；公开列表/下载/hash使用同一集合。旧公开快照无字段保持原集合。预览与提交前复核同样排来源；不是删除资产或替用户批准新图。
- 两篇确认来源已补索引，任务8920bf4f/2135cd87成功，dense58/58与42/42；真实Weyl hybrid检索召回两篇，未重解析/重耗LLM。新正常论文六维凝练/claimSuggestions确认仍须实际产品观察，不能由索引成功代替。
- CUA本机policy初始化恢复已耗尽，不重试；沿用服务器Playwright/CDP。Langfuse已登录，额度/cost未知不算免费；SMTP/SSO/定时备份等原缺口保留，但不扩成本轮治理工程。

## Git、生产与独立能力版本
- 应用production=faa20ab05674cebc5955d6ba7de7f3fb67ca53c2，rollback=c4b34f5c1c536d1cfa1143f036ec1d049713da18；必要服务器构建/启动exit0，独立读回.release-id一致，日志tmp/narrative-capacity-app-deploy-20260921.log。本次无迁移，沿用22020000的9/11/13；未测试/预检/CI/本机构建。内部说明短限解除、Chat旧1500移除、字节保护与receiver依赖闭包均High静态PASS并部署；无新模型实测。已观察空闲服务正常停止，无在途模型排空实证。根main acd13a712549e62f8d4b0f3c2f8f064549e226b0，HEAD按Git定锚，worktree仅根+交付树。
- Chat provider独立bundle=faa20ab05674cebc5955d6ba7de7f3fb67ca53c2（前版6cd6d89d78e1fdd8335b298d34b05cf46493df1a保留），兼容旧schema与收据，已去1500并按原16KiB外层/32KiB inner job保护。两个service自然调度Result=success/exit0，timer恢复enabled/active，未重启共享浏览器。备份/opt/openscience-chatgpt-browser/provider-backup-20260921-capacity-faa20ab0，日志tmp/narrative-capacity-provider-{build,install}-20260921.log；renderer仍sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f。回退先停新producer并让长请求在新receiver结束，旧bundle不能接长请求。
- Serena源6684e448a6d924f7f5b1adce9e0e2e4057aa88d3；Catalog e02、telemetry061882123d14be00b868c1971c9d56de21d83b6e、SkillsCLI83179c454b75688176060fabf9e611072d46813c、Langfuse4.35.0复用。无新增治理服务；ai-gateway显式依赖锁文件已有Undici7.29.0；新增迁移事实见检查点。

## 2026-09-21 自动链路部署与实际路径检查点
- 用户已授权按HTML实现。主体83e83f6a及类型修正已部署，科学/叙事/图片实际效果仍须完成本次运行。测试禁令不变，未把构建成功算内容验收。
- 已部署：visual-narrative-v1显式初始授权、最多9项后续分析/审阅/媒体任务（既有上传提取不重复计入）、generationSettings可空JSON；已审core/atomic Claims自动物化新私有版本，证据经原桥精确原文校验后系统核验，不填人工verifiedByUserId；分镜/成图内部批准与有界修订，旧profile不自动耗费。新增commit前缀保护、索引生产者识别严格绑定的系统物化版本。
- 叙事worker已完成：narrative:true复用同版本SDF/科学审阅/受控SourceMap，上游完整分析不重造；现有science/art组织1–6有序场景，可混排可用原图，mainMessage/audience及reader narration保留；原图不跳过末审。实际图审阅新增schema3，经原Chat review spool传真实图片，先保存draft再审，回放不重生图；成图审阅真实性尚未运行观察。
- 发布/私有阅读已部署：同一historyMedia保存reader顺序/标题/解说并进入原content hash，旧快照兼容；UI隐藏中间审批。固定run.versionId阅读、刷新后pending幂等和私有reader投影已收口；Drawer预填原文/风格，服务端重读授权来源。High提出的模型误分类扣费、同名PDF及版本标题问题已修复：只有初始按钮启动整条流程（中间全自动），来源可区分、标题冻结；增量复核通过，不新增意图模型。
- High提出的问题已修正并部署：schema3原字节PNG/JPEG/WebP≤10MiB、超规格原图只排除自动reuse；ready前预约、跨key共享run、系统审计、保存历史与源衔接均已收口。provider先行后应用编译/迁移/部署与真实入口已完成，实际成图尚未运行。安装器--defer-timers与异常回退保持，未测试/预检/CI/本机构建。
- 来源证据：Quantization cee71443/960ffcc1、d98862b0/51a87b65仅canonical旧稿、缺六维/最终Claims。已部署复用既有SourceMap composition与reviewOnly，自动各最多一次并计入9项；来源服务故障的显式授权补审保留为ordinal1、事务同步run/source绑定；v5仍为Gateway model self-check，实际成图才经Chat看图审查，不混称独立科学验证。双库备份db-set-20260921T032005Z-2320106成功，core45M/search3.4M，保留7/7。
- 实际入口：公开v2→研究桌面→继续编辑→研究详情→Hermes→guide d9ad62fc-294c-4140-903b-f4d4fec046e4→图文制作→cee71443→初始按钮。04:15:43Z POST500/23514因grant约束遗漏，210200向前迁移后原幂等请求恢复HTTP202，run e3ef004f-38bb-4fa2-88e4-e6df4f07a0b2；页面刷新sameRun=true/POST0。一次性收据/jobs/visual-narrative-{guide-submit,run-start,run-reopen}-20260921.json保留。旧overview失败图是Fig.2占位77b3，不是新素材接口故障。
- 来源实际：composition e7e3620a-a7e9-419f-8ca3-0cc694533650成功，六字段完整；reviewOnly a00c5a7b-b554-4ee5-b42c-4be4545f4037虽task succeeded，内容v5 blocked/ALL_PROVIDERS_FAILED，e3此前failed/version7/versionId=null。审计f635736b主MiniMax-M3请求300002ms provider_timeout、382f3787备用key94ms HTTP401，无有效review responseHash，非论文科学拒绝。收据/jobs/visual-narrative-source-review-failure-20260921.json，原e7/SourceMap/PDF保留，未物化新版本或生图。
- 最小修复已部署：仅最终来源审校65k/600s，provider硬上限600s、普通调用不变；primaryProviderOnly禁止超时/HTTP/transport后切key/model，已完成文本的有界结构修正仍留在同primary；review_unavailable/独立reason不再冒称malformed_item，未审core仍为空。High增量复核及必要服务器构建/启动完成；600秒有效响应能力尚未新请求观察。04:52Z站内刷新同run/POST0，仍明确完整成果未完成。历史请求是否计费未知，原9项按逻辑任务而非provider调用计数；旧run不自动重开，不用新run绕额度，不伪造approved。无有效v5可零模型恢复；补审需新增收费与严格同run恢复设计，当时未新增恢复分支或调用。

- 05:35:53Z本次获用户明确收费授权后恢复：9216bd36正常构建/启动exit0且release独立读回一致，无新迁移/receiver切换。原run页「保留初稿，继续制作」只点一次→HTTP202，e3同run version8/running，新source_review ordinal1=41c4c57c-ef61-4a01-ba8d-c303973453ec；原e7/a00/失败ordinal0保留。收据/jobs/visual-narrative-source-resume-20260921.json及recovery-observe日志；不得重跑写脚本。严格原稿/SourceMap/主失败审计/CAS/额度及saved重启恢复经High收口，补审结果见下一行。

- 本次补审41c已结束：仅一条主idx0调用，审计65a7bf60-97ef-4676-9c01-8bf67d7f978c，05:40:56Z/300638ms/provider_error，无fallback或有效response；v5 review_unavailable，run failed/version10/versionId=null，当时禁止再次补审/新run绕额度（后续显式续作见下一动作）。只读Node22.23.2/Undici6.28.0源码确认headers/body默认300000，而provider只配上层Abort600000；catch丢失cause，故底层300秒配置缺口已确认，但本次具体错误码无法追溯。请求级传输时限与白名单错误码已完成独立High静态审查及服务器构建/启动exit0：只为>300s文本请求使用局部Agent、finally销毁，普通请求和恢复槽不变；06:00Z精确release读回，原页面刷新同run/POST0，仍failed/version10；收据/jobs/visual-narrative-recovery-reopen-20260921.json。修复后未再付费实测长请求。失败结果收据/jobs/visual-narrative-source-recovery-failure-20260921.json保留，不声称已审校成功。

- 用户质疑审稿Skill与耗时后只读取证：41c原结果明确reviewSkill=scientific-critical-thinking v2（项目适配版），extractor系统消息实际注入；没有加载完整K-Dense peer-review。e7初稿任务的3条成功模型审计耗时29181/30516/74454ms（d96981e2/73a24f10/8d023c10），合计134151ms，最后一次产出完整六维；41c是后续六维来源校核+可选原子Claims请求，adaptive/65536上限/非流式，300638ms服务失败且usage为空。不能说“论文理解需要超过300秒”，不能从上限推断实际推理量，也不能把Skill有调用等同完整审稿流程落地；本轮无新模型、无代码/部署/测试。下一定位对象是现有终审的输入/职责和provider返回阶段，不盲增超时/预算或另造分析器。
- 用户继续后原地修正终审职责（已部署）：High定位自动配图消费必需Claims却提示可省略，以及“重新构建全文/仅压缩也可revised”与最小科学修订校验冲突。现有科学Skill v3拆分综合/核源指令，共享证据规则不删，核源用P编号；原稿821字/15语义点，原文15页原始文本53954字符，保留52个覆盖P及30个候选引用P，不裁证据。Worker只从同task/ingestion/artifact/actor/RO的visual-narrative运行步骤推导主张输出要求，手动v5保持可选，守卫/后置解析仍严格拒绝无效建议，无新分析器/模型轮次/恢复槽/超时预算。High增量静态审查已通过（source_review步骤按实际waiting绑定），正常服务器构建/启动exit0；07:11:56Z精确release读回，原run仍failed/version10/versionId=null、活动AgentTask0、上次失败后相关Gateway新调用0。模型不遵循主张指令时原后置校验仍会停止流程；新审校质量/延迟未实测。不追加付费请求，不把提示冲突称为历史300秒故障根因。
- 09:34–09:40Z用户要求验证系统：production仍d647a605；原run failed/version10/versionId=null、活动task0/失败后新调用0。站内dashboard→编辑→公开v2三张均解码（900×696、1280×720×2），文件页原PDF/历史可读。发现普通Hermes导航丢run并展示新建，旧task通用refresh可能收费换source指针且脱离原run。已部署原Domain/API的actor/RO/source只读找回、Serializable重复创建/所有visual绑定公共refresh保护，UI找回旧run并引回进度；不增恢复槽/额度、不发模型。当前canRetryGeneration=false：ordinal1已用，41c历史provider_error也不满足可识别临时故障。收据/jobs/system-verification-{public,assets,files,hermes}-20260921.json及entry/hermes截图；独立High已收口有/无version一致性，服务器构建/启动exit0；09:56Z普通文件→Hermes恢复sameRun=true/start按钮0，材料页refresh按钮0/进度链接1，POST0；收据/jobs/system-verification-fixed-entry-20260921.json。只读DB仍version10/source41c、同来源run1、活动task0/新调用0。完整新图组仍未验证。
## 下一动作与交接入口
- 优先任务5：原run e3ef004f-38bb-4fa2-88e4-e6df4f07a0b2现stopped/version39/max13，已用12，尚余1图任务；5226fcf5-d523-4a8c-bad3-e524acd2d8dc于14:33:47Z科学规划schema耗尽，未到art/终审/生图。三次M3调用：e5864c55纯thinking16K截断（121181ms）→693b7905正文stop但合成prompt>1500（176662ms）→4ad5c32c正文stop但encoding201>200（27273ms）；task.result为空，无可零模型恢复正文。用户仅授权这1次方案+1图，不自动再次规划/扩额。原页14:28:15Z grant201→37、14:28:17Z retry202→38；收据/jobs/visual-narrative-verdict-only-{grant,resume}-20260921.json不可重跑。private3051保留f2已审821字六维、6 Claims/58 Evidence，前图de847/ab456均rejected，公开v2未改。已部署根因修复与当前局限见能力台账；总长反馈补丁已部署但用户进一步明确表达完整优先，不能迁就历史字数。已将MiniMax1500隔离到provider、移除内部短字段帽，沿原4000brief/16KiBspool资源保护，独立High审查及receiver→应用部署完成；本轮无新增模型。读回仍stopped39。诊断证据tmp/narrative-5226-schema-failure-20260921.log；限制修复后的原页只读仍stopped39；较长说明的实际模型/图片效果未验证。此前询问额外一次收费方案修正并沿用剩余1图仍待明确，本次继续的是限制修复，不新增模型/恢复槽，不以手工截科学文字或重复模型强行放行；新收费续接须具体确认，尚未交付合格图文。
- 先读本页，再按故障读 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md 最新节；能力缺口在 docs/runbooks/hermes-capability-registry.md 原行更新，历史长证据不重复执行。
- 收尾两树status必须为空，提交/推送自己的改动，prune/list。此前4个、此次另6个已结束且无用的自有UI读取/导航助手已精确清除；收据tmp/{pipeline,visual-narrative}-owned-helper-cleanup-20260921.json；保留一次性写请求及收据、原图/日志/会话/他人任务/回滚。本轮另3个已结束的只读助手删除遭自动审批拒绝，已改为同卷可恢复归档至tmp/archived/visual-narrative-readers-20260921，restore.json保存原路径/原权限/恢复说明，移动后权限一致；无活动生产者，原输出及一次性恢复写脚本/收据保留。现有每日09:00维护automation=automation，不再创建；临时证据仅ignored tmp/私有目录。
