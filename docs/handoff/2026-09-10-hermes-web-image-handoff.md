# Hermes / Workbench CURRENT Handoff

> 唯一交付树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release，branch release/onchip-production-line。根 main 仅导航；旧 codex/onchip-video-release 缺 journals/学术身份，不得发版。历史详细证据保留 Git 与下方交接，不能按旧 next action 重跑。

## 目标与执行边界
- 用户2026-09-21最新纠正：目标是未读论文者也能通过视觉叙事理解论文核心思想和关键点，兼顾美感；先全文理解与叙事设计，再按需选择单/多图、原图或生图。视频同目标但尚未进入执行阶段。原图裁剪/生成/发布跑通均不等于交付；稳定要求见需求基线§18.2。截图中Fig.1原样展示被明确否定，需返工。
- 用户本轮要求完整实现链路的HTML审查稿：[视觉叙事方案](../proposals/2026-09-21-visual-narrative-review.html)已获用户批准并进入实施，含8环节、媒体选择、读者体验、字段/组件影响、成本恢复和A–D实施顺序；独立High只读架构审阅已纳入。静态稿可展开/导出意见，不调用业务API；浏览器视口/交互尚未实测，文件打开请求已入Codex队列。不据此称功能实现，未生图/测试/部署。
- 用户最新纠正：用户看最终六维内容/图片和阅读效果，中间分析、分镜、媒体选择及首张检查都由系统决定，不设置用户逐步确认。HTML/需求§18.2/任务5已改为自动制作并内部审校→完整成果→用户反馈；原地增强science/art，不新造分析模块。sourceMapRef只证明权限/文件身份，需绑定同版本内部审校结果；现有人工状态前置与成图内审的自动编排尚待补齐，不直接改approved或伪造用户认可。本轮候选实现与未观测项见下方检查点。
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
| 论文视觉叙事 · 5 | 用户否定v2原样Fig.1的美感/独立解释能力，只有9f/aa41有用户认可依据。HTML已按“用户只看最终成果”纠正：同次规划形成主旨/有序场景，自动制作与内审，六维内容/整组图片一起呈现；中间不等用户批准。读者标题/说明/顺序随发布保存；自动状态编排候选已接线，仍待审查与真实运行。 |
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
- 本轮静态定位：reuse-only在illustration-planner.ts本地组装、illustration-review.ts直接接受，handler.ts复制原字节；这只能证明来源复用。通用planner/项目Skill以单个关系/默认单图为起点，缺少面向整篇论文的读者叙事组织。需求、Taskmaster和能力台账已纠正，候选已原地增强planner/Skill；公开版本尚未变更，不声称叙事质量已通过。
- 既有三风格逐图选择、figurePlan确认/提交、科学符号保留、图像下载后恢复均已部署。自有科研插画Skill/科学Skill进入规划/美术/审阅；配图末审经Gateway MiniMax结构化池。Skill安装、注入和科学质量分别判断。
- 新标准化候选从四边RGB采样取主色、单色背景合成且保留完整画面/alpha，复用原512MiB无网renderer。服务器以9f原始1448×1086 PNG实际执行两段filtergraph，输出1280×720/484210字节、色fefefe、原图字节相等；/opt/openscience-chatgpt-browser/observations/normalization-20260921/receipt.json。新深色图/纹理边界仍待真实成图观察，不批量重算旧结果。
- 本机codex-chatgpt-web仅用于Pro代码合作，不支持网页聊天内生图；服务器image provider独立。Desktop委派/压缩续接补丁117+6项定向回归/类型/CLI构建通过但未安装：共享桥忙且单覆盖cli会被launcher校验回退，必须完整一致包、空闲切换及真实工具回合；不让此项阻塞已可工作的CLI方式。
- 新发布快照对原图来源加publicationIncluded:false，保留全部historyMedia及来源引用保护；公开列表/下载/hash使用同一集合。旧公开快照无字段保持原集合。预览与提交前复核同样排来源；不是删除资产或替用户批准新图。
- 两篇确认来源已补索引，任务8920bf4f/2135cd87成功，dense58/58与42/42；真实Weyl hybrid检索召回两篇，未重解析/重耗LLM。新正常论文六维凝练/claimSuggestions确认仍须实际产品观察，不能由索引成功代替。
- CUA本机policy初始化恢复已耗尽，不重试；沿用服务器Playwright/CDP。Langfuse已登录，额度/cost未知不算免费；SMTP/SSO/定时备份等原缺口保留，但不扩成本轮治理工程。

## Git、生产与独立能力版本
- 应用production=ea6b655f666c248a2b3495beb947bbda190561ae，rollback=ad486b86b095c72f9e85dadc39caca8c9003a5a5；服务器编译/构建/启动完成，deploy exit0，独立读回.release-id与匿名/__release HTTP200一致。命令带--no-tests --skip-migrate --reuse-unchanged-capability-images，日志tmp/pipeline-style-deploy-20260921.log；无OpenScience测试/预检/CI/本机构建。HEAD按Git定锚；根main acd13a712549e62f8d4b0f3c2f8f064549e226b0，worktree仅根+交付树。
- Chat provider独立bundle=6bbf266cfc4758237db79179c4f31e794fa945a9，image/science-review两个service源读回一致，两个timer均active。第一次安装被已有锁拒绝、未切换；暂停售时轮询并等待在途退出后原installer成功，按原状态恢复timer，未停浏览器/取消任务。备份/opt/openscience-chatgpt-browser/provider-backup-20260921-6bbf266c保存此前7a3配置引用/units/live文件；旧bundle与配置保留。renderer保持sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f，应用/provider分别回退。
- Serena源6684e448a6d924f7f5b1adce9e0e2e4057aa88d3；Catalog e02、telemetry061882123d14be00b868c1971c9d56de21d83b6e、SkillsCLI83179c454b75688176060fabf9e611072d46813c、Langfuse4.35.0复用。无新依赖/迁移/治理服务。

## 2026-09-21 已批准实施的候选检查点（尚未部署）
- 用户“没问题，可以继续执行”已授权按HTML实现。基线563f4d6994c59a1f20a9622365a9bdad8a958479；本轮候选提交见Git，生产仍为版本段原版本。运行/测试禁令不变；不要将候选当已完成。
- 候选：visual-narrative-v1显式初始授权、最多9项后续分析/审阅/媒体任务（既有上传提取不重复计入）、generationSettings可空JSON迁移；既有已审core/atomic Claims自动物化新私有版本，证据经原桥精确原文校验后系统核验，不填人工verifiedByUserId；分镜/成图内部批准与有界修订，旧profile不自动耗费。新增commit前缀已保护、索引生产者已识别严格绑定的系统物化版本。
- 叙事worker已完成：narrative:true复用同版本SDF/科学审阅/受控SourceMap，上游完整分析不重造；现有science/art组织1–6有序场景，可混排可用原图，mainMessage/audience及reader narration保留；原图不跳过末审。实际图审阅新增schema3，经原Chat review spool传真实图片，先保存draft再审，回放不重生图；成图审阅真实性尚未运行观察。
- 发布/私有阅读候选：同一既有historyMedia保存reader顺序/标题/解说并进入原content hash，旧快照兼容；UI新run隐藏中间审批。固定run.versionId最终阅读、刷新后pending幂等和私有reader投影已收口；自然语言Drawer复用同一入口：原文/风格预填、唯一论文默认选择、多论文沿用材料选择，服务端重读授权来源。High提出的模型误分类自动扣费、同名PDF与版本标题问题已修复：只有初始按钮启动整条流程（中间全自动），来源可区分、版本标题冻结；增量复核通过，不用额外模型或意图关键词门禁。
- High提出的问题已修正：图审阅4MiB PNG与已有输出不兼容，已改为schema3原字节PNG/JPEG/WebP≤10MiB、超规格论文原图在规划前排除自动reuse（原资产保留），schema1不扩限；ready前提前占预约已修；跨幂等key共享run优化已移除；commit/Claim系统执行审计已补；无key历史读取已改为最新有效人工/系统版本。协议3、planner、来源投影和迁移静态复核未见阻断，源衔接及自然语言最终差异均通过High静态增量复核。仍须服务器必要编译/迁移/provider receiver先行/应用部署与真实产品路径。provider安装器另补可选--defer-timers，避免半安装提前启动；本次wrapper可恢复units/live与原timer状态，异常保持停止，独立High复核通过。未运行任何测试/预检/CI/本机构建。
- 新只读证据：生产仍ea6b655f；Quantization cee71443/960ffcc1、d98862b0/51a87b65成功但仅canonical旧稿，无scientificReview/atomic建议且六维缺项。当前默认compose也只给v4自检，不能直接通过auto v5门槛。候选复用既有SourceMap composition与reviewOnly刷新，分别最多一次、计入9项、事务同步run/source绑定；v5来源审查沿用Gateway model self-check，实际成图才经Chat看图审查，不能混称独立科学验证；不新造分析器、不手填core。完整小范围元数据收据在ignored tmp/visual-narrative-source-*-20260921.cjs；RO仍draft且这两来源无其他活跃run。迁移前双库备份db-set-20260921T032005Z-2320106成功，core45M/search3.4M，既有保留7/7。

## 下一动作与交接入口
- 优先任务5：按纠正后的HTML接通自动链路；A叙事/B代表成图/C整组是开发增量，不是用户审批关卡。复用sourceMapRef受控读取，核同版本内部审校结果，并通过原Domain补齐自动保存/状态推进/成图内审。新叙事不受reuse前置影响，公开Gallery消费保存的title/caption/order；定量重绘未接通。Quantization需新私有版本，不向e77写入或盲重发aaf7；全文上限、旧约束继承/深色标准化债务保留。
- 先读本页，再按故障读 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md 最新节；能力缺口在 docs/runbooks/hermes-capability-registry.md 原行更新，历史长证据不重复执行。
- 收尾两树status必须为空，提交/推送自己的改动，prune/list。本轮已精确删除4个已结束且无用的只读UI临时助手，收据tmp/pipeline-owned-helper-cleanup-20260921.json；保留一次性写请求及收据、原图/日志/会话/他人任务/回滚。现有每日09:00维护automation=automation，不再创建；临时证据仅ignored tmp/私有目录。
