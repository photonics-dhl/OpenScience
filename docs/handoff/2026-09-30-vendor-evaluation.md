# 公司上线与年度运维评估材料（固定快照）

> 一次性对外评估证据，不是第二份运行 CURRENT。后续应用/回退/功能状态仍从 [Hermes CURRENT](2026-09-10-hermes-web-image-handoff.md) 读取。
>
> 10-03新版UI已随组合ef9e44d6正常发布；Browser访问已恢复，常用官网入口/窄屏交互已实际观察。新Word和固定脱敏ZIP见文末10-03节；10-01/02证据保留为历史，不代替本次全部角色或科研质量验收。运行身份仍见Hermes CURRENT。

## 用户范围与交接边界

- 2026-09-30 用户要求固定代码包供公司评估，不授予个人 GitHub 协作者权限；首轮仅屏幕共享网站、部署、资源与数据位置。
- 用户确认：公司只做正式上线和年度运维；功能继续由我方开发。未完成论文审校、成图、视频质量不进入公司的功能开发报价。
- 首轮固定包任务未发送公司、未共享生产凭据/登录/数据，也未部署；下文版本均为当时快照。

## 固定来源与取证

- 只读取证始于 2026-09-30 15:03:36 北京时间；前后核应用 SHA `90da3e98d7cf9e70cae7c7d380953f3891964819` 稳定，可在 Git 解析且远端交付分支包含。
- 独立 units 对应定点源码：Chat `ae4579216a627dda08edfb332fe5fd7673befea8`；Codex `0905884780c56aafb7ee507450d2c38fc70e7a2e`；视频 `0df87c9bee98c2280396551ed522e66230eaf381`。补丁 bundle 不冒充整套应用。
- 只从 Git blob 导出固定内容，排除其他会话未提交候选；逐文件 CSV 记录源提交、路径、模式、大小，无 Git 目录和历史。
- 生产者/取证/审查/包统一在 ignored `tmp/vendor-evaluation-20260930/`；包内有阅读入口、项目架构、报价/屏幕共享清单、版本检查说明、脱敏服务器摘要。

## 本轮观察

- ECS：Alibaba Cloud Linux 4，16 逻辑 CPU，30.07 GiB RAM、0 Swap；根盘 60%，可用约 57.52 GiB；未观察 NVIDIA 设备。
- 11 个产品常驻容器；有 healthcheck 者 healthy，Web running。公开首页、公网/源站版本均 HTTP 200；不等于全业务路径或模型质量验收。
- 七天 Netdata 请求有 168 个桶，但 CPU/load 49、RAM/disk 48 个有效小时样本，实际覆盖 09-28 至 09-30；缺失不计 0。有效 CPU 均值 14.52%，RAM used 均值 18.37 GiB；先前把缺失计 0 的 4.2% 已明确纠正，不进入对外材料。
- core/search 在同 PostgreSQL 实例的独立逻辑库，物理卷 `openscience-prod_postgres-data`；附件/图片在 SeaweedFS 的 `openscience-prod_seaweed-data` 卷，不是 Web public。
- 每日 `0 3 * * *` 双库备份，近期 7 套原子集合，最新 09-30 03:00。仅核文件元数据，未读 dump、校验或演练。每日任务不含 `--objects`，对象备份/异地副本/RPO/RTO 未证实，列入公司评估。

## 检查与问题处置

- worktree 缺 `.env`，首次 SSH wrapper 在本地停止；使用已有 `XGS_CONFIG_ROOT` 指向根配置后正常成功，未读取/输出凭据。不是认证失败。
- 首次全目录 `du -sx` 超过 35 秒，放弃广泛递归；改用 `df`、指定 Docker 挂载与现有监控，不扩大磁盘扫描。
- 裸 loopback HTTP 跟随 HTTPS 地址失败；正确域名公网与 `curl --resolve` 源站均 200/精确版本匹配，证书校验保持。
- 所有导出文本做凭据模式/邮箱检查，逐项分类测试假值、环境引用与模板，并独立 High 复核；不把检查数或构建冒充无泄漏保证。
- 最终独立 High GO：1879 个源文件、3份环境样例51行明确占位脱敏、918条文本模式命中均已分类；不改合成测试邮箱的域名语义。首页代码/公开产品依赖保留，真实研究演示整组裁剪，variants附各自根锁与manifest但明确不能独立重建整套系统。
- 对外包 `tmp/vendor-evaluation-20260930/OpenScience-evaluation-20260930-app90da3e98.zip`：1886条目、约10.59MiB；1872可读文件扫描，manifest/路径/字节/CRC/执行位均通过。最终重压仅03审查状态与06包内清单变化，源码零变化、扫描多重集合零变化；`completion-receipt.json`与`final-delta-check.json`留证。
- ZIP SHA-256 `d333c864fdf5f3d50abc51f2ea53e03230024d8b2cb278776fa1fa03a26a5519`，同名`.sha256`侧件核传输身份；混合/脱敏ZIP无法只用一个Git SHA标识，CRC不能区分错发版本，因此仅增加交付物校验值，不新增项目门禁。
- 文档同步8项与结构检查通过，265份Markdown检查无问题；首次索引遗漏已按原索引格式修复。凭据规则不能保证未知编码/动态拼接；未做产品构建、压力或恢复测试。
- 原候选删除遭自动审批policy拒绝（blocked by policy）；已按明确所有权安全归档到本任务ignored `archive/original-unapproved-candidate/`，旧生产者已改指reviewed新空目录并拒非空重导出。原候选与High绑定PENDING压缩包均为私有证据，不外发。

## 后续与所有权

- 向用户交付复核 ZIP/说明，由用户发送公司并安排屏幕共享；报价、SLA、环境数量、恢复目标与后续授权另行约定。
- 裁剪包不含内部 docs/会话/真实视觉样例，部分总仓门禁不可复现；公司先列隔离环境所需依赖。
- 交付树有其他活跃会话的论文审校源码改动，不能删除、暂存或混入资料提交；本轮仅提交自己负责的说明。原临时发布树与并行代码由原任务负责。

## 评估问题核查与修正

- 用户随后提供23页PDF/21项问题，授权核查、修正服务器、验证和书面回复；原包90da仅为历史评估样本。本次在Codex管理的`vendor-launch-fixes/XGS`隔离树、`codex/vendor-launch-fixes-20260930`执行，已整合canonical已提交a7af0663；其他会话未提交Hermes源码保持。
- 已确认统一额度并隐藏free标签；保留期刊/Live2D、优化加载、完善站内状态，不加任务邮件；保留现ECS、需要隔离测试环境、每周发版、12430020审批、日期待定。
- 发布前只读快照55a8/rollback c299；没有running/pending AgentTask。32个published Version均有Publication且publicVersionId一致；2个team只有owner。近7天仍needs_review3个、六维全空2个，不能当总体失败率。ClamAV生产配置与调用已核，干净/EICAR实测分别接受/阻断，无业务写入。
- 候选包括角色/生命周期/ORCID/下载/登录、账户隔离取数复用、路由/导航/账户/额度/任务显示、延迟Live2D、Nginx、真实余额、普通/期刊上传ClamAV。原生产只有Worker解析接完整扫描，普通/期刊上传缺口由本候选补齐。额度19、Nginx9、协议2、Fork8、确认角色3项通过。首次CI发现账户切换后错误接收旧actor结果，已修正，相关Web83项通过；不能以旧CI失败结果当通过。
- 10-01集成High发现扫描期间权限撤回、后续导入事务窗口和锁顺序问题：Artifact扫描后锁会员再空间复核；导入batch/session/task/扣费/审计在同一Serializable事务复核并持锁，提交后入队。9个扫描/准备后降权、撤员、归档回归和3扫描基本项通过；普通/期刊恶意451与扫描不可用503的实际HTTP四项通过。Domain新构建、相关四套件112项、定向ESLint、docs-sync8项和Markdown检查通过；最终集成High GO、精确CI36799844261 success；正常干净已推精确源无迁移发布exit0，发布身份只见Hermes CURRENT。
- 权限解释按既有需求：Author首发和撤回保留R3/科学约束，恢复已被收窄的公开可见性仅Owner/Maintainer；这是实现判断，不冒称用户新决定。创建者降权不保留特权；Contributor只提交贡献分支。Fork旁路三角色越权已红绿修正；导入确认已有嵌套Commit守卫，新增三回归通过，无新增生产确认逻辑。
- 核查限制：一般VisibilityRequest扩大仍仅pending，未找到审批落地消费者；部分非事务审计、全链路科研质量和长期SLA未验收。公开版本一致性核查不等于RO.status是出版状态，空六维不冒称PDF解析失败。
- 原PDF/text/server-before保留在canonical `tmp/vendor-findings-20260930/`；全部新证据、生产截图及6页Word回复已归档到其`verification-20261001/`，临时生产者已结束，生成脚本按自身目录读取资料。生产实证：公网/源站精确版本一致，API/Web/Worker restart0/OOM false，各healthcheck服务healthy；登录后工作台→设置→个人主页可用，余额/500发放额及低额提示显示且free隐藏，auth/me从2降1，两个ingestion为不同scope均200；安装后的API扫描factory clean接受/EICAR阻断，路由307/指南200/404/匿名401/管理302及nosniff通过。首次HTTP脚本尾部Windows管道CR导致exit127，仅本地脚本问题，改用Git Bash原生管道后exit0；未改业务状态。09:40北京时间复查时应用运行约11分钟，各healthcheck服务healthy、主应用restart0/OOM false；六维全空材料从站内进入后提示清楚且采用按钮禁用，无业务写入或新AgentTask。Word经本机现有Word渲染及6页全检，21项齐全。

- 修正已合入canonical并推送，合并代码d41a3893的CI36802074205 success；服务器仍为CURRENT所记修正版本，未发布并行原生审校新增代码。Root main干净；本任务隔离树已由Codex archive归档，所需ignored证据已先迁移，已合并本地任务分支随后删除；canonical另会话仍在编辑原生来源审校相关源码，未删除、暂存或混入本任务的最终说明提交。资料可交用户发送公司，测试环境、对象备份恢复、SLA与科研质量按上方边界继续。

## 2026-10-02 UI 发布与公司回复更新

- 用户授权发布全部UI修改并交Word，报价仍为正式上线与年度运维；功能/科研质量由我方负责。保留ECS、独立测试环境、每周发版、12430020紧急审批、日期待定。
- 上午整轮界面发布的215 Web/55几何检查和33模拟浏览器流程保留为当时证据。本轮新纠正：首页取消浮动Hermes，其他页默认360px/帽沿左上角短尾；继续细化阅读/媒体/表单与控件，修复390px版本选择器横溢出。132定向检查、TC/lint/样式检查、两位独立High最终GO及精确CI通过；部署exit0，无迁移/新付费界面验收任务。随后并行科研修正保留全部UI，实际运行版本只见[Hermes CURRENT](2026-09-10-hermes-web-image-handoff.md)。
- 13:51与13:56 HTTPS只读复查：公网与正确TLS源站版本、3主应用源码挂载一致，12路径×两链路均预期，API/Worker healthy、Web running、restart0/OOM false、事务journal清除；不证明长期SLA。真实逐页/手机/帽沿气泡/角色浏览器因saved permissions核验故障未完成，不用模拟流程或HTTP代称视觉验收。
- 新证据归ignored tmp/ui-hat-polish-20261002/，旧tmp/ui-release-20261002/保留。Word资源记录13:51点时RAM总30.07/available7.52GiB、Swap0、根盘余45.28GiB；11:07库/对象聚合及每日03:00双库备份仍分别标原取证时间。对象备份、异地副本、恢复演练与SLA/RPO/RTO待交付。
- 正式Word tmp/vendor-delivery-20261002/OpenScience 上线评估问题核查回复.docx已原地更新，9页/21项/7表，qa/hat-polish/pages九页全检无溢出/重叠/缺字；bundled renderer缺soffice的诊断保留，改用现有Word只读PDF导出与bundled Poppler渲染。原PDF/旧Word（qa/hat-polish/previous-1126.docx）保留，未发送公司。首轮90da固定包为历史评估源，后续交接需明确新固定版本；不授予GitHub/服务器账号。本轮只提交自身UI/交付记录，并行科研工作由其会话负责；UI树为受阻视觉QA暂留，清理期限见CURRENT。

## 2026-10-03 UI组合发布和报价材料

- 应用源ef9e44d6aa09ee748e792b19005f831b564182f3，rollback29de74f2e8f53765283a34055850c1f40122575c；精确CI37125218586、UI/期刊修复及集成High GO。干净树正常deploy成功；首次备份持锁exit73未修改服务，释放后成功。Native同版本由生图会话配对，本UI验收未创建模型任务。
- 官网实际入口与字体/1440/390/单Live2D/展开/键盘焦点已观察；源站+公网12路径×2符合HTTP语义，精确版本一致。最终Web/API/AgentWorker/Redis均healthy、restarts0/OOMfalse，API及AgentWorker内存各2GiB；内存与swap合计限制另算。当前是短时观察，不是压力/SLA/全部角色/软键盘或科研产物验收。
- 对外Word `tmp/vendor-delivery-20261003/OpenScience 上线评估问题核查回复.docx`：10页、21项逐项答复、7表，原生Word导出与Poppler10页逐一实看；版本、原PDF核查、用户决定、页面职责、源码/服务器/数据库/上传位置、当前资源和上线/年度运维报价范围齐备。原始PDF与旧Word未改动。
- 对外ZIP `tmp/vendor-delivery-20261003/OpenScience 固定版本评估代码包 20261003 ef9e44d6.zip`：1854条目/11310357字节，单一固定应用源，无Git历史/旧运行器变体。1851源码与Git blob/mode一致，环境样例17非空敏感行显式占位，1835文本877候选；713来自旧已审相同blob，164新增逐项独立复核，最终ZIP CRC/路径/字节/mode/命中集合全部通过，High最终GO。校验侧件仅用于已有交付传输身份，不新增发布门禁。
- SHA256 `600db6266e03c6d695d69f49e1689c2fab047a2cadacf72f835afc762ca19dab`；复核/扫描/导出/包收据留本目录ignored JSON，私有截图与日志不进入ZIP。对外材料未通过消息工具发给报价商，也未提供账户或生产凭据。
- 本机对象备份967个/2812621957字节及逐文件验证由运维会话完成。3f490d7后继备份候选未包含在ef9e应用；定时对象新脚本未装，异机、整套恢复、测试环境和告警仍待交付，均在Word明确。开发功能及科学/图像/视频质量继续由我方承担。
