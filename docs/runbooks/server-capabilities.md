# 服务器能力与复用清单

> 2026-09-20 按需 renderer 恢复：Chat image broker 配置原镜像已缺失，已按用户 A 恢复标准化依赖，原图真实处理并入库待审；新镜像/配置备份/恢复边界见 [Figure 3 交接最新节](../handoff/2026-09-18-figure3-image-and-cleanup-handoff.md)。无常驻容器不代表可删除，应用 release 与 provider 不变。

> 最新2026-09-15：/dev/shm真实页面加载瞬间用满512MiB，已定位Mojo管道失败；1GiB已运行，同六页首次加载峰值882MiB、资源错误0。原页面、登录、草稿正文恢复，Chat段落格式不同，私有原文备份保留；精确运行/回滚容器仅见CURRENT。清理前盘点38个发布目录合计15G、镜像可回收标记11.4GB，磁盘可用61G；这些是操作前容量，不能解释为本轮释放空间。

> 后续用户已授权清理确认不再需要的服务器内容：36个过期一次性容器已按精确ID删除，保留其私有metadata/log.gz与全部挂载；27个运行/回滚容器和发布标记读回不变，现存33容器。镜像/release/卷没有删除。特别注意：当前按需renderer没有常驻容器，仍必须保留；Docker“无容器引用/可回收”不足以证明无用途。详细范围与授权延续只见CURRENT。

> Chat执行器已有先选模式再插字、同请求恢复及一次性刷新标记修复；首批atlas/editorial实际成功入库，但修订封面7cd仍uncertain且下载恢复已过期。共享内存与终态误关后来草稿本轮已修复，新Library结果绑定仍未收口；不得盲重发或宣称全面稳定。精确应用、独立provider/单文件patch与Serena版本见CURRENT handoff。

当前版本与暂停状态统一见[CURRENT handoff](../handoff/2026-09-10-hermes-web-image-handoff.md)；产品目的、调用关系、真实效果查[能力索引](hermes-capability-registry.md#当前能力索引目的调用效果)。本轮新工具实际交付见紧接的表；更早日期段是历史操作收据，不作为当前release或下一步指令。健康不代表内容质量。

## 2026-09-14 底层开发能力（实际运行）

源码/安装脚本位于`infra/development-platform/`，独立于科研应用部署；精确image/source/release见CURRENT，不从本页历史猜版本。

| 入口 | 现有运行方式与实际证据 |
|---|---|
| Backstage目录API | `openscience-development-catalog-catalog-1`；标准实体实际返回Hermes owner/deps、当前交付分支需求/CURRENT及同一Taskmaster state/tasks链接，匿名401；SQLite独立state，只读Token身份，无Docker socket/生产DB |
| Serena只读MCP | `openscience-development-serena-serena-1`；实际三工具列表、Gateway符号及extractor调用返回；快照按CURRENT区分候选与生产，缓存独立，不加载仓库脚本/Secret/测试/依赖目录 |
| Langfuse | `openscience-development-langfuse-*`六个独立服务，官方v4.35.0；独立PG/Redis/ClickHouse/MinIO，登录页200，实际API读回已有调用；无provider keys、外部AI任务或论文正文 |
| Gateway元数据 | `openscience-development-gateway-audit`；专用只读`xgs_telemetry.gateway_calls`视图/角色，无原表SELECT；真实配图25215cd1六次调用已在Langfuse全部按taskId关联。120秒提交延迟、60秒轮询及分页不是丢日志；采集checkpoint和凭据持久保存；现有query支持--task UUID并已读回实际规划/审阅和失败guide的调用 |
| 模块依赖 / 技能CLI | 复用现有dependency-cruiser18.1.0，真实19模块/4跨包边；Vercel Skills1.5.26 list/find已实际使用，不安装搜索结果 |
| 访问 | `ssh-run.sh --development-tunnel`在SSH中解析固定容器内部IP，本机127.0.0.1:3130/3131/3132；不增加服务器listener或外网network。容器重建后重开隧道。Docker24纯internal网络的ports声明不会生成映射，不能据compose配置声称可访问 |
| Langfuse账号 | 与OpenScience独立；2026-09-15按用户明确要求完成单账号改密，同事务密码比对成功并使旧会话失效，私有凭据文件同步0600。用户已确认网页登录成功；交接说明见`infra/development-platform/langfuse/README.md`。未配置SMTP，不能依赖忘记密码链接 |
| 代理兼容 | 原ALinux Squid7.2加官方Bug5520单文件补丁，现包`7:7.2-1.alnx4.openscience.1.x86_64`；原RPM/配置/unit备份在`/opt/openscience-development/squid-compat/ce02ee5273aa7fb9de2a7e9679b480485ae46939/`，`native-rpm.sh rollback`可恢复；数字起始R2 CONNECT修复后真实镜像下载完成，ACL/路由不改 |

复用已有Node full/slim、Python3.12、PG/Redis、代理与共享缓存。仅补独立工具依赖、Langfuse必要镜像和ALinux原生RPM构建镜像；编译器仅在隔离builder中。没有安装BuildKit、第二个代理或新模型供应商。

初次接入顺序错误已纠正：connector13:42的首个pending早于Langfuse首次创建13:47；停connector后完整备份checkpoint，仅清除此确定未到达的pending，目标就绪后恢复，随后50回执、无pending。不是通用自动盲重试；今后先启动Langfuse再启动connector。

元数据适配器只有两个internal network，生产DB重建后须经同一installer恢复专用网络连接，不重放数据；state保留。Langfuse自动保留期限、定时备份、SSO/SMTP未配置；复用既有磁盘监控，备份脚本手动可用但未演练。不将这些能力当作模型/论文质量保证。

## 历史操作收据

- 2026-09-14历史应用及 Chat bundle e2cccb4d/rollback ea43696d：自有通用科研配图 skill v1、上游原文支撑的结构化画面意图、直接编译与真实 Chat style PNG 输入已部署；复用原镜像/浏览器/代理，必要 build/start 与 provider 安装 exit0。清理器同源安装只扩展精确 reference.png，无新清除请求。产品页面/__release 实读一致，首个真实结构化方案 f3c75142 已由 API202 排队，图片上传与质量尚待观察；无测试/预检/CI/迁移/Codex调用。以 CURRENT 后续结果为准。

- 2026-09-14历史应用ea43696d/rollback dd4c935a；三套原版baoyu设计技能已随release安装，Hermes image storyboard/scene-image读取原文章节，固定路径/最多2风格1布局，provenance记录实际消费。必要build/start exit0；真实私有方案141f42d3一次成功且来源可追溯，但科学域/公式仍混乱，High及根agent拒绝出图，已API200标rejected。无新图片/公开变更/测试/迁移/新后端；image runner114与Codex runner090保持。Figma两配置disabled，仅调查。最新结果/限制见CURRENT及tmp/design-skills-*。

- 2026-09-14历史应用6504c004/rollback f8e44815：仅个人空间CSS重排，首行等高双卡、后续整行和紧凑导入；必要build/start exit0，桌面/窄屏已实看。没有新增能力、依赖或运行器代码，Codex仍runner090/base1ad，受限清理代码沿用f8；不重跑生成或清除。当前状态见唯一CURRENT handoff。

- 2026-09-14历史应用f8e44815/rollback9a36c1e0：回收站Node符号链接身份修复、安装有界等锁、前端自动更新；原4项已purged，旧RO/两会话不存在、笔记清空，共享对象保留。Codex仅runner090补丁/base1ad54c72运行环境，正常SIGTERM退出0，精确信号自然排空切换，原unit与配置保留；受限清理bundle f8。整块证据关闭约59px，Dashboard只显示处理中任务，已实看空回收站/公共/工作台/窄屏；两公开v1科研字段/证据/图同原数据。必要build/start exit0，无测试/新模型/迁移；细节及自动刷新未动态观察边界见CURRENT。

- 2026-09-14历史应用9a36c1e0/rollback1f7032a3：首页/Explore科学公式及内部编号、公开和工作台的同版本结构化折叠证据已统一；22六字段默认关闭、23四原章节，原Claim/Evidence/图保留。22指定行政勘误已执行为首发v1/DHL并授予原PDF下载，audit6c93436f，原日期/发行收据保持；旧v10临时307/no-store，未来正式v10优先。两端来源200/PDF原件一致，最终双卡/六字段/展开/窄屏截图已看。两次必要服务器build/start exit0，无测试/预检/新服务/模型/迁移；源码通用，人工历史数据勘误不冒称自动科学审校。详细状态与限制见唯一CURRENT handoff。
- 2026-09-14应用6af9c984/rollback59c8cebf：证据主张/原文统一科学Markdown，40来源按文件页码分组，原记录不变；API文档复用公开视觉，线上原文curl/Python已执行成功。原Python默认UA被Cloudflare1010拒绝，示例显式应用User-Agent修复；无防护/权限/模型/依赖变更。主张57式源码全等、来源按钮200及桌面/窄屏已实际查看。服务器必要build/start完成，无测试/预检/迁移/科研写入；详细证据见CURRENT。
- 2026-09-14历史应用a7214fc9/rollbacke7f95180：外部AI可按公开文章ID读取最新完整JSON或固定公开版；/developers提供中英文档/导航，统一OpenAPI3.1描述8个GET，HTML JSON alternate及API Link/Content-Location完成发现。复用原权限/冻结记录/限流，无新模型/服务/依赖/迁移/科研写入；High静态PASS及必要服务器build/start exit0。匿名文档/规范/23最新与v1/22v10/来源均200，内容保留；web工具域名安全拒绝未作网络根因结论，客户端兼容边界见CURRENT。
- 2026-09-14历史应用e7f95180/rollback0931cf12：公开附件授权及单结论发布修复已部署，服务器完整build/start exit0，独立High PASS，无测试/预检/新服务/模型/依赖/迁移。第二篇真实公开23/v1，DHL、文字/数据CC-BY-4.0、代码MIT，匿名页面/API/PDF200，原PDF568765字节/hash24d11cc8保持；40来源/原图保留。原context.request绕Chrome代理EAI_AGAIN改页面fetch后成功，不是产品登录故障。具体收据与尚未观察范围见CURRENT。
- 2026-09-14历史应用0931cf12/rollback02d67ddf：带图草稿保存500已修复（Prisma复合关联拆为同事务create/createMany），无新服务/依赖/迁移/模型调用。独立High静态PASS，必要服务器build/start exit0。真实第二篇重复附件整理201、private/revision7/72c315af；正文/40来源/已批配图继承已实际核对，预览与工作台截图已看。作者/许可/PDF权限待确认，未公开；02d回退会恢复此保存故障，当前细节见CURRENT。
- 2026-09-13历史应用02d67ddf/兼容rollback ef9e6e97：生命周期在ef9部署，02d完成真实页面发现的标签与弹窗显示修正。宿主受限清理队列 `/opt/openscience-private-cleanup/{inbox,results,state}` 与systemd timer已安装，复用现有Node/供应商锁；Worker只可写队列、只读结果，Parser保持隔离。独立搜索库按核心存续状态过滤/重试同步。必要服务器build/migrate/start exit0，私有图文、旧公开v10、编辑历史、Hermes来源、80项管理和空回收站均实读。无真实删除/新公开/新生成，清除与30天到期未观察；c0bc及以前禁止回退。
- 2026-09-13历史应用c0bc653d/rollback871ed702：阅读层隐藏Hermes内部来源编号并去媒体制作长文，原文/公式/后台数据保留。必要服务器build/start及独立High复核完成；实际四阅读入口编号0、10式正常，原数据/图片不变。第二篇仍private/内部快照5/revision6；未公开，无测试/CI/迁移/模型调用，浏览器与媒体runner不变。证据和下一步见CURRENT handoff。
- 2026-09-13历史应用871ed702/rollback80809452：现成admin_reviewed_import复用第二篇图86ffe至私有v5，原字节/hash及原资产完整来源保留；generator前缀误判已修复，同图审批由400恢复200。真实预览/工作台正文、新图、公式已读；无新增服务/依赖/模型调用，无测试/CI/迁移，必要build/start完成。浏览器/provider/media runner不变；来源引用边界和下一步见CURRENT handoff。
- 2026-09-13阅读修复已部署80809452（rollback08ed3b35）：edit顶部贡献、overview与VersionRecord正文统一ScientificText，CoreEditor/版本页内部核查面板和链接移除；核查API/资料/保存内容保留。实读lead5式、正文/概览10式，0错误，六字段逐字等API、sourceLinks0、auditPanel=false；桌面与375物理像素窄屏截图已看，Chrome125%导致早期element clip裁切，采用完整viewport截图并正常关闭移动Hermes遮层后确认5式完整。RO仍private/draft/revision4，SDF及冻结record与before逐字一致。无测试/CI/模型重跑。
- 2026-09-13六字段落地：71→服务器60d52/4c45两稿仍有科学/引用问题，停止重生成并明示人工校正；无模型save得到f34d8ee2（1523字符/23引用、user_edited），独立High PASS。经版本锁写入私有SDF revision4，六栏逐字等API、10式/0渲染错误、23引文一致；同工作台轮播3/3显示新图86ffe。原71/旧稿/媒体version2保留，尚未定稿/公开；用户审阅后须新建正确图文发布快照，不发布旧version2。
- 2026-09-13图解质量推进：同一已审71正文/40引用/Claim848，方案aa05→2a1（未批）→606b99fc（已批）；真实新版图片86ffe202-928e-49fd-8877-7ec0787b69f6于09:05:56Z→09:07:13Z单次自动succeeded100%/draft，retry0、attempt1，无人工恢复或新部署。原图1672×941，产品1280×720完整可见且不横向溢出；独立看图PASS为用户审阅候选，无必要修正，未批准/公开。上轮生图稳定性修复在本次真实任务生效。
- 2026-09-13生图稳定性：原5260任务单次提交已生成并回收，产品succeeded100%/draft，实读1280×720；b78修复原图下载及旧late marker跳过已完成结果，501部署自有target连接前回收/三锁安装，d369补Chrome异步关闭确认。image/review runner501、helperd369、brokerb78，base bundle d163；应用08ed/rollback df94不变。独立High PASS，无测试/预检/新依赖，具体图片质量/操作证据见CURRENT handoff。
- 2026-09-13第二篇Quantization复用既有SourceMap；08ed共享kind/parser并逐片保留confidence，使来源JSON353628→143941字符、53954全文/2201片段不丢，180k预算/授权/locator保持。两次模型前budget失败已保留；e758f33f现可生成、来源准确，但科学/引用复核失败（连续脚注误绑等），e758→918→b66→71ed6fae三次来源指导修订后，3643字符/40引用经独立科学/引用PASS；实读正文/quotes等API、57/57 TeX源一致、Markdown27609字符完整，RO仍private/draft/version3。无新Parser/OCR/服务/依赖，不称自动科学质量解决。

历史应用80809452117fdb9a71382c28de95c3c4ff84392e / rollback08ed3b35113a512fbd414524ab8958ec4f87deeb；reading-ui-clean-deploy-20260913.log exit0，必要服务器build/start完成，/__release实读同SHA。浏览器broker b78/runners501/helperd369不变；无测试/CI/本机运行。

- 2026-09-13第一篇已验证结果：笔记63e→74→3f68d30b两次来源指导的服务器修订，1745字符/19引用，独立科学/引用PASS。实际截图定位Markdown吞掉TeX反斜杠，0685复用现有公式识别保护数学源后已部署；同一稿件26/26公式源逐字相等、6处间距正确，正文/引用等API，Markdown20620字符与部署前完全相同。无新模型供应商/依赖/OCR；代码与服务器日志见CURRENT handoff。通用机制已有，独立科学复核仍由本会话承担，602初次来源选择已实际传递；跨论文自动质量未通过。
- 2026-09-13后续无新部署：现成writingDraft精确基稿来源修订4bed→797→867ce8b9已实际完成；867方法笔记1605字符/19引用，经独立High原文核对PASS、真实页面正文/引用逐字等API，点击导出Markdown13420字符完整。无人工正文替换/新依赖/OCR/新服务；这是来源引导局部修订成功，六字段自动凝练质量仍未解决，未采用/发布。证据/jobs/hermes-grounded-method-{revision,final}-*。
- 2026-09-13：1bf reviewOnly复用旧SourceMap/bridge作真实字段审校，d5c6f699仍科学失败，保留未采用。停止整稿自省/重生成循环。
- 既有workspace.guide完整来源写作可用于具体问题回读：4bedbb4b方法链独立High核心科学PASS；五问63e2acc5仍错，不能泛化成自动质量通过。8ff局部共编仍丢前提，a8修正其原推理关闭配置，复用科研synthesis选项；实际10799ba3仍被High原文复核拒绝（删起始链/漏√I与同步），不再重试，不以配置修改冒充质量修复。
- 写作意图漏识别有修饰语的“写一篇…笔记”，a8修复明确命令路由；权限/否定/保存/引用合同不变，High静态复核通过。
- 浏览器压缩解码Mojo data-pipe创建14/324失败，底层分配原因未明；空编码override已清理。旧generatingPages=1来自整页历史关键词，不能证明活动。复用review-runner可见Stop/停止判断，14页stop/composer/dirty均0、三锁取得/队列空/profile和jobs持久化后，仅重启浏览器一次成功（2026-09-12T18:55:50Z），登录保留；镜像仍8aa21251，勿混同provider bundle d163。
- 恢复后current-ingestion UI六字段与API一致，35条来源完整、revision11；私有92目标页实际暴露“摘要92/正文最新63e”选择错误。1e627已修复部署并独立High复核；实际打开92后1118字符/17引用逐字等保存API与此前原文复核稿，user_edited保留、无63e替代。证据/jobs/hermes-explicit-writing-reading-20260913.{json,png}。Playwright CDP握手仍偶发超时，已有raw target-CDP可用，不代表长期稳定已修复。
- 私有92cafb82六字段人工审校稿（1118字符/17引用）及40e23948长稿保留；公开v10/revision11/已批图不变。自动稿未采用/发布，视频/批量暂停。
- 下文为能力与历史操作记录，涉及当前科学质量/浏览器状态以CURRENT handoff和Hermes台账为准。

- 历史a1c0da49原P语义整理成功42191tokens/124574ms，final空正文/备用HTTP401且旧Adapter失败usage未知。当前097已通过显式来源+stage复用成功产出六字段，但科学质量仍需审校；不能把历史失败视作当前功能状态。
- paper-analysis v8/scientific-summary v6、M3显式adaptive、Docling CPU1.30/CodeFormulaV2、安全KaTeX、XLSX/PPTX/HTML已部署。模型返回成功不代表科学正确。
- 私有笔记40e23948经M3生成修订与独立原文核对、4处人工局部校正后已真实保存/重载/下载；2696字符/41引用，57式排版0错误，保留user_edited。完整原文100563字符/306段无遗漏；自动首稿科学准确性不能称已稳定。
- 已部署空响应诊断记录安全usage/finish/block数量，缺失usage为null；明确length时不原预算fallback。不能反推旧空响应原因。
- 9f后097显式仅续final实证0OCR/map/bridge，一call5057out/53017ms；v5仍有条件省略/结论夸大未采用。API/web统一既有64段/24000字符及same-block范围后，实际六栏新结果与引用全部显示；不是新增上限或绕过来源验证。
- 最终私有六字段92cafb82基于既有editorDraft两次服务器共编与人工校正，独立原文复核通过，1118字符/17引用、user_edited；真实UI保存/新页重载/来源/下载完成，正文逐字等复核稿，RO仍revision11。原40e23948笔记与正式v10保留。
- 旧阅读页真实6个JS ERR_INSUFFICIENT_RESOURCES阻断业务加载；同认证context新标签页首次成功并完成下载。旧页保留、未重启，资源根因尚未定位，不据此声称长期稳定。
- 没有新增服务、供应商、浏览器或OCR；艺术/叙事runtime与video locale/style传递已随0df87c9b部署。现有独立video-runner active，TTS/renderer镜像和模型可复用，升级走infra/codex-image-runner/install.sh --confirm-video；未生成新视频。
- 当前任务/状态以[CURRENT handoff](../handoff/2026-09-10-hermes-web-image-handoff.md)和[Hermes台账](hermes-capability-registry.md)为准。下文历史部署只用于能力复用，不能覆盖当前事实。
- 2026-09-12媒体部署：独立video runner bundle已更新0df87c9bee98c2280396551ed522e66230eaf381，install exit0并启动；TTS镜像a2158409、renderer镜像ff6042f6、qwen3-tts-customvoice-0c0e305原样复用，无新增生成任务。旧service备份/opt/openscience-video/service-before-0df87c9bee98c2280396551ed522e66230eaf381，先回退应用至68a0再按需恢复service，不让新Worker对接旧runner。

## 2026-09-12 文档与公式能力接入

- 实际观察更正：旧warnings=[]漏掉4条坏公式；ScientificText实际28/32可渲染，第2/3页两个代表式已对照原页。已部署parser-image/worker的KaTeX0.16.47依赖，格式失败保留orig并标confidence0/low_confidence；不改变网络/Secret/512MiB边界，不宣称已修正4条公式的物理内容。
- 第2项复用现有Worker/Gateway/MiniMax-M3，并发仍为2：paper-analysis/research-understanding v6、scientific-critical-thinking v2按阶段加载。Chat6Pro实际复核后补强运算对象/相位/来源冲突与非普适性；宿主skills目录仍不自动注入产品，本次是TS runtime显式导入，无新服务或模型。初次结果/parser-jobs/hermes-reading-stage2-final-20260912.json，原map候选同目录hermes-reading-stage2-candidates-20260912.json供本次恢复复用。
- 缺失公式权重已下载到`/opt/openscience-models/docling-codeformula-v2/docling-project--CodeFormulaV2`；模型`docling-project/CodeFormulaV2`，revision`ecedbe111d15c2dc60bfd4a823cbe80127b58af4`，权重630993616字节，CDLA-Permissive-2.0，来源及revision留在父目录`SOURCE.json`和模型卡。复用已有Docling镜像与宿主代理，仅下载此模型配置/权重/tokenizer；未下载另一套OCR、浏览器或完整工具栈。
- 部署compose只读挂入既有模型缓存的同名子目录，不遮住镜像中的布局/表格/OCR模型。`HF_HUB_OFFLINE=1`，解析服务仍仅内网、无Secret；原2worker/3threads、6CPU/8GiB不变。document-parser启用`DOCLING_FORMULA_ENRICHMENT=true`。回滚应用363257aa的compose可恢复关闭状态，保留缓存无需删除。
- Docling识别公式写入TextItem.text；应用保留页码/bbox并补明确TeX分隔符。空识别/乱码保留原文并标low_confidence；高级解析失败的普通文本回退标partial_result/low_confidence。不会根据识别状态声称物理正确。
- Web复用锁文件已有KaTeX0.16.47，新增应用直接依赖及统一ScientificText；仅渲染明确公式、不信任HTML/链接命令，失败保留原文。研究理解skill v6经现有Worker真实导入，强调公式/单位/条件与来源核对、六字段保持凝练。
- 实际论文解析原结果/parser-jobs/formula-reading-20260912.json：26页/32公式，旧warnings=[]不能作为正确性证据。ScientificText同组件阅读HTML与截图位于浏览器/jobs/formula-reading-20260912.html、formula-reader-20260912.png；未写入RO。5个真实map复用后单次reduce用47秒，未重跑PDF；这不是已交付自动断点缓存。

以下为开启前定向盘点，保留其判定依据：

- `paper-analysis`运行镜像`ghcr.io/docling-project/docling-serve-cpu:v1.30.0`，不是旧candidate；依赖元数据包含docling-core2.91.0、docling-ibm-models3.13.3、docling-parse7.10.0、RapidOCR3.9.2、torch2.13.0+cpu。这些是包存在证据，不表示每个模型都在每次任务中调用。
- `document-parser`实际`DOCLING_SERVE_URL=http://paper-analysis:5001`、`DOCLING_FORMULA_ENRICHMENT=false`、并发2；高级服务workers2、threads3。源码`ingestion-parser.ts`先走Docling异步PDF路径，保留JSON页码/bbox/公式标签；请求关闭Docling整页OCR，难读页交既有页质量/OCR路由。`detectLayout:false/grobid:false`控制另一路可选阶段，不能推断Docling未启用。
- Node轻量解析镜像通过mammoth/pdf-parse/yauzl和Tesseract解码；本次两个解析容器包元数据及产品源码未发现MarkItDown接入。宿主PATH未发现Pandoc/TeX/FFmpeg；已有媒体镜像可含FFmpeg，不能由宿主PATH缺失判全服务器未安装。
- 生产论文理解加载`apps/agent-worker/src/skills/paper-analysis.ts`和`research-understanding.ts`，由extractor显式导入；没有自动扫描`/opt/hermes-agent/skills`的产品通用加载器。宿主已有MIT `research/research-paper-writing/SKILL.md`（Orchestra Research、偏ML/AI稿件），属于文件可复用，尚非产品撰稿能力。
- 应用源码未发现KaTeX/MathJax/remark-math/rehype-katex统一数学渲染；现有`manuscript/paper.md`导出是六字段拼装，不是独立论文写作与精美排版产品。
- 本轮运行列表包含web/api/agent-worker/document-parser/paper-analysis/embedding-worker/scansci/browser及DB/Redis/对象存储/扫描/运维服务；旧dev/migration容器未出现在运行列表，不据此推断已删除。
- 开启前未触发解析；关闭公式增强是已确认缺口，不是所有乱码的已证实唯一根因。新模型实际运行结果以后续CURRENT记录为准。

## 历史产品回传（早于当前 release，保留复用依据）
- 最新产品任务fd719902已在原服务器会话成功生图100%并入库，旧3814f844限额不能代表新任务不可用；图片科学问题见CURRENT handoff。用户指定新Chat账号后已正常退出旧账号；随后已完成登录（见本页最新更新）。
- Google OAuth bridge补丁：仅在/opt/openscience-chatgpt-browser/scripts/host.mjs加入accounts.google.com与www.gstatic.com两个精确443域（日志与认证页脚本证明必需），Sol High复核通过；bridge重启active，浏览器/应用未重启。备份host.mjs.before-google-oauth-20260911。无Google通配符扩展、无新安装。
- production `f909c3a48a3c75e952735d8c71aeead393a404dc` / application rollback `8c2832f01136fd47a62fe6f4a4e5e07c2a994c63`；browser provider `f48324870f25b50c3a21eaad898beea87fb0aa1d` / provider rollback `48d9fa65db134575f53cf2a30724aa47a14eeea4`。
- 服务器必要构建/启动完成；连续工作台可打开，Hermes实际单字段共编、撤销、用户修订并确认v2已成功。无新增服务/安装；仍复用MiniMax/Gateway。
- 已部署默认分支提交后草稿同步、未改内容选择性保留审核和制作/发布两栏布局。v3实际保存刷新一致、5条已有材料可选。v2一次性状态恢复已审计：5 Claim/50 Evidence，原pending和改动problem保留，冻结记录未改。
- 旧v1两图8b0ca4c9与36a4已被标approved，但科学/视觉问题未消失，尚未发布；旧六图run仍failed。当前只要求一张合格核心图，不继续凑六场景。
- CDP与已授权服务器浏览器可用。截图先bringToFront；后台截图超时不代表网络或Chat不可用。Chat6Pro规划已收到，追加复核明确限流，未重试/换账号。
- 真实v3图片任务3814f844提交网页会话6aa3963b后明确rate limit；无新图，未发布。无新服务/安装。f909c3a4新增小屏两行header与三步导航，方案确认入口自动展开，服务器实际页面已观察。
- 高级paper-analysis/document-parser及BGE/ScanSci继续使用；无新OCR，视频暂停。用户已授权代为科学审核发布，不能放行已知错误。

## 使用规则
- 所有服务器相关任务先读本页相关条目。新增下载/安装前，依次查已有服务、镜像、共享缓存；优先原入口调用、复用镜像层或只读运行文件。
- 仅对缺失或与当前任务冲突的部分定向取证；安装前说明缺什么、为什么不能复用。不得仅因宿主 PATH 找不到就认定服务器未安装。
- 不复用生产登录态、Secret或可写数据卷，不改变已有服务。新增/升级/停用后原地更新本页和能力台账；不新增自动测试门禁。
- 不记录密码、key、Cookie、订阅文件内容。旧版本镜像存在不等于可删除。

## 已有位置与边界

| 能力 | 已有位置 / 入口 | 状态与复用方式 |
|---|---|---|
| 生产应用 | `/opt/openscience`；`openscience-prod-{web,api,agent-worker}-1` | application `ea43696d…` / compatible rollback `dd4c935a…`；三套原版设计包安装及Hermes只读加载已部署，真实方案消费可追溯；方案质量仍未通过，见CURRENT |
| 主机资源 | ECS 16 CPU、30 GiB RAM、无 NVIDIA GPU | 盘点时约22 GiB可用；CPU解析器必须有界并发。Marker/MinerU等GPU高质量模式不能按GPU吞吐数据推断本机效果 |
| 完整图形 Chrome | 宿主 `/opt/openscience-tool-cache/playwright/chromium-1234/chrome-linux64/chrome`；ScanSci镜像内 `/opt/scansci-browsers/chromium-1234/chrome-linux64/chrome` | 已静态确认完整二进制。可复用现有镜像与配套资源；不是只存在 headless shell |
| 无头 Chromium | 宿主 `/root/.cache/ms-playwright/chromium_headless_shell-1234/` 与共享缓存同名目录；ScanSci镜像 `/opt/scansci-browsers/chromium_headless_shell-1234/` | 现成截图/渲染资源；不能用“仅此目录存在”的旧记录推断没有完整浏览器 |
| 浏览器运行依赖 / Xvfb | `openscience-scansci-mcp:7f8e47d931b751cc28c1000325128c2ca86566cb`；镜像 `/usr/bin/Xvfb` | 已有图形库与Xvfb；独立浏览器可派生镜像，不启动或修改生产ScanSci服务、不挂载其登录卷 |
| 网页远程桌面、生图与科学审阅 provider | `infra/chatgpt-browser/`；`/opt/openscience-chatgpt-browser` | bundle `d1630135…`；原生Create image与6Pro科学审阅分开，b19核心图已取回并在正式RO公开。复用原浏览器/登录、独立图片及科学审阅锁；人工恢复参与与边界见[浏览器手册](chatgpt-browser.md) |
| Node / Python | 宿主 `/usr/bin/node`、`/usr/bin/python3`；现有 `node:22-bookworm`、`python:3.12-slim` 镜像 | 已有；必要时复用镜像中的Node。不要默认全局安装 |
| 视频 / 字体 / FFmpeg | `openscience-media-demo:b361f4f7781b760583b3a312829877c4d6310e8a` 等已有media镜像；源码 `apps/media-demo/Dockerfile` | 镜像包含FFmpeg、CJK字体与无头浏览器；demo镜像可复用运行依赖，不代表Hermes完整视频产品链路通过 |
| 语音模型 | `/opt/openscience-models/qwen3-tts-customvoice-0c0e305`；`openscience/tts-audition:qwen0.1.1` | 目录与镜像存在，本轮未调用；不要重复下载模型，也不推断生产已接入 |
| PDF解析 / OCR | `openscience-prod-document-parser-1`、`openscience-prod-paper-analysis-1`；Docling Serve CPU v1.30.0及Node/Tesseract轻量链 | 公式增强true，KaTeX损坏识别/原文保留已生产；真实26页/32公式中4条语法坏式，具体选用阶段按任务来源判断，不以运行正常代替正确性 |
| BGE-M3 | `openscience-prod-embedding-worker-1`；模型卷 `bge-m3-5617a9f61b028005a4858fdac845db406aefb181-08cc5a668e89` | 容器运行；既有模型卷复用。BGE生成向量，实际存储由现有检索/数据库链路负责 |
| ScanSci | `openscience-prod-scansci-mcp-1`；项目 `apps/scansci-mcp` | 容器运行；复用MCP取文献，不另装一份；认证状态不读取或打印 |
| Hermes / MiniMax | 生产agent-worker及AI Gateway；另有 `/opt/hermes-agent` 源码目录 | 源码目录存在不等于独立服务已启用；经现有Worker/Gateway调用，限额以实际供应商响应为准 |
| Codex订阅生图 | `/opt/openscience-codex`；runtime base `1ad54c72` / runner补丁 `09058847` | 已有runner/预设skill；最新真实任务报usage limit，无新图。不得重新安装或重新登录当作额度恢复 |
| DB / 缓存 / 对象存储 / 文件扫描 | `openscience-prod-{postgres,redis,object-storage,malware-scanner}-1` | 本次列表显示运行；复用内部服务，不暴露公网，不读取环境变量凭据 |
| 历史非生产容器 | `openscience-dev-{postgres,redis}-1`；`xgs-hermes-migration-a72b5e1c` | 2026-09-12未在docker ps运行列表出现；停止/删除状态未另查。不得据旧条目称仍在运行，也不因名称直接删除 |
| 出网与访问 | 宿主Squid `127.0.0.1:7891`；项目SSH wrapper；Cloudflare Tunnel | 既有出网仍依赖本机上游（CURRENT研究记录）；远程浏览器界面仅SSH localhost6081。服务器驻留不等于出口已独立 |

## 本次取证与教训
- 读取Docker容器/镜像名称、定向文件路径、已安装包名及项目Dockerfile；没有运行测试、模型任务或读取Secret。
- 漏查 `/opt/openscience-tool-cache/playwright` 与ScanSci镜像，导致重复下载Chromium。已中止重复构建，改用已有完整浏览器与依赖。不要重复该路径判断错误。
- 本清单不是自动扫描脚本；只在相关能力发生变化时更新，避免每轮全盘扫描与重复消耗。

- 2026-09-10历史记录：用户接受现有本机出口；直接Chat会话接口与服务器网页执行分别判断，CUA失败不能推断Chat不可用。浏览器pids上限512。2026-09-11已授权代为审核发布；具体图片仍须核对，旧36a4存在指令外露、新8b的几何表达待确认，均未公开。
