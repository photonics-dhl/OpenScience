## 2026-09-11 — 成果已保存，收敛到产品体验
- production/provider 3ee10d6e，rollback36200a72；候选修复尚未部署。
- Deep-sub-cycle六维已确认；approved方案六图中36a4已为真实产品draft image。7d8网页明确rate limit，CDP可连接，不是网络/浏览器附着故障。
- Chat6 Pro实际GO：保存成果可见性独立于run失败，限流不重发，其他场景保存后再汇总失败。
- 正在落实：限流识别、同会话恢复匹配、已有图片进度、失败成果入口、提取页及run静默刷新。视频暂停，剩余五图未完成，不自动批准/发布。
## 2026-09-11 — Hermes全文理解语义纠偏已部署

- Chat 6 Pro明确复核：SDF六字段是整篇论文的用户精华，不是同名章节抽取；披露不完整与摘要不可靠、核心物理未解必须分开。
- production/provider `4b4e365c…` / rollback `d60ab631…`。science-v4加入跨段受约束综合、结构化`affectedFields`、字段软长度目标和用户SDF/内部MediaBrief分离；旧合同答复不会复用。
- Deep-sub-cycle真实任务`1e324308…`、6 Pro attempt`6cc0a17c…`成功；六字段110/129/182/206/143/191字符，均非空且无补证。服务器页面已观察六项textarea与数据库一致，尚未替用户确认写入。
- 本次合同升级在候选复用优化部署前对method/reproducibility各产生一次MiniMax定点修复；没有重跑OCR或全文map/reduce。后续已拆分候选复用与答复复用，合同升级可直接复核同一SourceMap草案。
- 未运行测试、预检或CI；两次部署均只执行发布必需构建/类型检查与服务启动。第一次候选`b1887444`在切换前因字面量类型失败，修正后部署成功，生产无中断。

## HISTORICAL 2026-09-11 四字段阶段（已被science-v4六字段结果取代）

- version tuple：branch/HEAD与production `codex/onchip-video-release` / `36e6a8c48ad4a67664ef3cd3b0fbeb36e6480a93`，rollback `3485e329325a97f64368ef34cfda51f42c1625c6`；网页provider bundle同为`36e6a8c4…`。
- 真实PDF `Deep-sub-cycle-ultrafast-optical-pulses.pdf`（3770010 bytes）经服务器产品链完成6 Pro初审与补证。初审`3420ed0e…`给出四个revised字段并只阻断method/reproducibility；补证`03bc4bee…`原始答复保留为invalid_response审计产物。
- 修复科学broker长任务期间`.ready`过期：实际运行超过60秒后心跳age仍为11秒；同任务补证不再1毫秒拒绝。补证attempt加入协议版本，刷新链从幂等键恢复父任务与初审attempt。
- task `103de6d5-a305-408c-8e0f-fa6e4d082803`在新增网页调用0次的情况下复用两份已有答复并完成：problem/insight/results/limitations分别398/471/1230/552字符；method/reproducibility保持待审且保存未验证草稿、问题和来源。真实编辑页显示两项缺口，确认按钮可用；用户确认前未写canonical、未生图或发布。
- Chat 6 Pro复核同意readiness根因、逐字段保留与幂等方向，要求不从模糊文本猜影响范围；实现只接受`【影响…】`显式范围，无法确认时整包待审但不删除内容。
- 未运行测试、预检或CI；仅执行生产部署所需构建/类型检查、容器startup health与真实产品任务。

## 2026-09-10 服务器网页生图已进入真实产品草稿

- version tuple：branch `codex/onchip-video-release` / HEAD与production `d850fadbbe579481f68ab4d57f53f6910dee4120` / rollback `0c635525e3bffcd7a30199b0770cc3af37d3bc1b`。
- Hermes真实任务/资产 `eb48809b-c402-4983-969d-ee82d0fe6200` 已由服务器 `chatgpt-web` provider完成并回传 `draft`；PNG 1280×720、971354 bytes，content hash `773ed60431c3f04c07463df0f24fae54db9f1ea5ab003c04d7e8907268ef76be`。
- canonical会话 `6aa23223-62f8-83e9-9b43-19d424eb51a6`；图片绑定source claim `7397c444-19d4-4900-b060-b9e1004261f4` 与approved storyboard `5076fcc6-54a8-4ee0-a40b-517c38e58090`。
- 已部署精确恢复：核对request/result/provider/task/prompt hash和PNG后复用原结果；提交后浏览器异常只重启一次并回到精确canonical续取，绝不重发prompt；失败仍打开circuit。
- 主画廊不展示rejected历史资产但保留审计；生产截图已观察当前单张草稿和审核控件。原文证据支持图中自由空间传播模、Bethe经典描述边界与局域孔径模式量子化问题；仍待用户视觉及科学批准，尚未发布。
- 服务器页面已确认规划会话为6 Pro；本轮同一请求及一次Retry均返回Chat网页平台错误，未取得新回复，停止重复消耗。此前6 Pro的单写入者、精确canonical、不重发、人工科学审核方案继续生效。
- 三条有效RO中两条为同一Quantization PDF；`deep-sub-cycle pulse`没有附件/ingestion/artifact。第二篇精选需用户上传不同PDF，不能把重复论文计作两篇。
- 本轮未运行测试、预检或CI；只执行服务器部署所需构建、启动与真实产品观察。当前执行入口见 `docs/handoff/2026-09-10-hermes-web-image-handoff.md`。

## HISTORICAL 2026-09-09 新分析已运行：精确来源区间修复中

production ea95e63c / rollback c2d11326。网页broker已安装、timer成功，API/worker已选择chatgpt-web；尚无产品图片回传。真实新分析task c22927f9已复用SourceMap并返回needs_review，method/reproducibility仍因8000字符/32段限制失败。根因之一是同一block的不连续passage被min/max扩成中间全文；正改为精确range union及所有消费者的有序不重叠校验。直接Chat正常并返回方案；本机Chrome控制桥重启后仍无法枚举标签页。

## 2026-09-09 部署故障已恢复

b9e326b2未上线：首轮SSH断开，重试Worker unhealthy自动回滚至c2d11326。已确认入口模块可加载；移除main自动fixture自检（用户禁止测试），保留真实请求校验，增加失败前私有日志保留。网页provider静态High复核已完成，仍待服务器实际回传。Chat6 Pro已收到真实截图并返回3项布局建议，代码已整理；原PDF15页预览已实际显示。

## 2026-09-09 全流程质量优先（进行中）

Chat已实际讨论；附件预览、图/视频选择、发布快照索引、公开页阅读顺序、提取来源恢复与可恢复归档已随c2d11326部署exit0，rollback7f8e47d9。34条旧数据已按固定目标正常domain归档并写系统维护审计；不删除文件/公开版本。先做2–3篇精选、暂停批量冷启动；完整产品队列回传/论文质量仍未完成。详细问题与状态见CURRENT handoff及integrated-research-product-plan最新节。

## 2026-09-09 服务器网页生图和保存实际成功
- 直接Chat接口list/read已验证可用；服务器Playwright也已实际接上已登录Chrome，完全不依赖本机CUA。用户接受本机出口。
- approved Hermes prompt只发送一次；正式会话6aa162f9-d0e4-83ea-afbf-243f7aae8a22，网页Save保存PNG1225x1284/1556710bytes，任务私有output/image.png。非Codex生图调用。
- 修ws.chatgpt.com白名单；pids256实际触顶，提高512并保留内存限制，恢复卡住的浏览器。截图确认有图。
- 图片添加了未获指令允许的孔板几何/场线，需修订；未批准或写入产品画廊。复用runner已保存，通用execute/resume尚未整体执行，生产Hermes队列/Gateway接入未完成。无测试。

## 2026-09-09 Chat接口可用性纠正
- 用户确认Codex直接Chat会话接口能够读取普通Chat；不能把CUA fetch失败写成Chat不能读写。根目录与交付AGENTS已固化接口隔离判断。
- 本轮服务器Playwright已实际连接已登录Chrome并读取首页/输入框；网页执行与直接Chat接口分开记录。

## 2026-09-09 登录页面资源白名单漏项已补
- 用户截图无样式且验证码提交无响应；实际auth-cdn.oaistatic.com被拒70次。补该域名与日志内3个OpenAI域名，只重启bridge并active，保留浏览器登录会话；待用户刷新远程Chrome，尚未确认登录/生图。

## 2026-09-09 本机远程桌面拒绝连接已修
- SSH connection reset导致原隧道退出，服务器bridge/browser/UI一直正常；新增browser-tunnel.ps1断线重连并隐藏启动，localhost6081实际页面HTTP200。等待用户刷新并在服务器浏览器登录，未生图。

## 2026-09-09 服务器浏览器启动故障已修，待登录
- 实际失败启动trace定位openat2 EPERM→255、clone3 EPERM→134、pkey/chroot拒绝→133；已定点修复，保留完整沙箱。镜像272a5ed57d27复用不重下，浏览器running、bridge active、远程UI HTTP200。
- Sol/high独立静态审查通过；无测试。CUA连接仍fetch失败，open_in_codex返回queued。用户需打开localhost6081的noVNC，在服务器完成登录；尚未生图/回传。生产应用release未变。

## 2026-09-09 复用镜像构建完成，运行时启动待修
- 272a5ed57d27构建成功；新增包下载由321MB降至45.7MB（约86%，不是token比例）。bridge的217/USER由缺少宿主UID11040导致，已补专用nologin账号并active。
- 浏览器容器报cannot start a stopped process，未进入应用日志，已关闭自动重启；不关闭沙箱。尚未登录、生图。根目录AGENTS及清单也已同步，保留其已有未提交修改。

## 2026-09-09 纠正重复安装并固化服务器资源复用
- 用户纠正后查到共享缓存及ScanSci镜像内完整Chrome1234和Xvfb；停止重复下载构建，改用已有镜像/Node/字体，仅补远程桌面组件。
- 新增server-capabilities.md，与Hermes能力台账互链；AGENTS强制服务器任务先查相关清单，缺失才安装，不增加测试或全盘扫描。当前浏览器仍构建中、未登录；生产release未变。

## 2026-09-09 服务器交互浏览器安装中
- branch codex/onchip-video-release；浏览器候选908a063c，续装改动767c22bd；生产7f8e47d9/rollback929667dd未变。
- 仅服务器构建：代理下载中断、Debian CDN下载缓慢后，改为Aliyun Debian镜像，保持Debian签名验证；安装持续推进。未执行测试。
- 本机固定6081 SSH隧道已启动；浏览器容器尚未创建，登录/网页生图/图片回传均未完成。桌面CUA仍fetch失败。
- 这是独立交互研究环境，尚未接入生产Provider；服务器当前出网代理仍依赖本机上游，不能宣称完全自治。

# 网页生图额度研究（2026-09-09）
- 官方确认Codex生图计入通用Codex额度（平均3–5倍类似非生图turn用量），网页额度按ChatGPT方案；不能直接转接。
- 同账号可在其他设备登录；服务器现有headless Chromium/Playwright，无交互登录桌面；代理请求返回403challenge，未登录、未生图、未安装软件。
- 无官方网页额度服务端API依据；无人值守网页提取有官方条款限制。结论与来源已更新ADR-013。生产版本、原任务与额度阻塞不变。

# Progress

## 2026-09-09 实际生图到达服务器Codex，受订阅额度阻塞
- production7f8e47d9 / rollback929667dd；runner1ad54c72含官方预设imagegen skill。全部部署成功，未运行测试。
- 已修图片grant数据库约束、正常Claim审核导致run误停、图片规划不遵循修订；画廊单图宽幅展示已部署。
- Hermes实际生成并修订方案；approved asset10f36f01，一幅有来源支持的研究动机概念图。15条证据正常定位核对成功。
- 真实scene_image task f6f29af4已下发详细brief，服务器Codex thread01a085fa返回usage limit，未生成图片。保留已审核方案，不盲重试。
- run46442dc4当前failed/version9；额度恢复后走正常retry，先GET对账，不重跑OCR。未授权兑换额度、购买或切换API付费。
- 全论文仍partial，method/reproducibility与部分科学忠实性未完成；浏览器连接失败，无页面视觉验收。
- 详细ID/日志/下一步见CURRENT handoff。

- 网页生图补充研究：自定义GPT生图+Action文件回传是用户触发候选；当前新生图模型与Action兼容未实际验证，不能承诺无人值守。CUA重置前后仍fetch失败，未发出网页生图请求。详情ADR-013。

- 用户批准服务器可交互浏览器研究：候选独立UID11040/network-none/Chromium sandbox/Unix egress与UI桥接，仅SSH localhost访问。待静态复核后在服务器构建启动，无本地运行或测试。
