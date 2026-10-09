# 导航与服务对象入口 CURRENT

## 需求与范围

- 用户规格：导航首项“服务对象 / Who we serve”，五类公开介绍入口；Researchers 最新反馈改为无编号、无围合外框的横向服务行，手机顺排、折叠 FAQ（取代早先 2×2 卡片要求）。
- 四入口：`/me`、`/research-objects/new?type=published`、`/research-objects/new?type=preprint`、`/explore`。`/who-we-serve/journals` 与 `/journals` 目录独立。
- 本轮连接既有本人主页；公开作者主页独立地址、内部栏目及成果展示布局按用户约定后续细化。未引入角色绑定、关注、私信或统计。
- 2026-10-09 用户追加：实现 Industry / Investors 前端展示与内部功能架构；高校与科研机构、期刊介绍页暂不开发。两页采用对话入口、需求整理、来源结果、比较/清单与联系流程；AI 技术分析不得冒充已有元数据能力。
- 联系接收邮箱由用户指定，最新要求公开页面隐藏地址，写邮件时才获取；集中配置可更改，用户确认草稿后自行发送。
- 最新导航要求：左侧“服务对象、功能、探索、About”，右侧“上传／创建研究、登录／注册或个人中心”。About 文案已确认：联系我们、反馈问题、申请情报分析演示、接入 API。原使用指南整页由上传入口承接；功能采用已告知用户的默认方案：学术主页、已发表解析、预出版创建三个下拉入口。
- 用户最新纠正：使用已存在的 `photonics-dhl/OpenScience` / `frontend/nanqing`，不得另建分支。前轮误建 `dhl-nanqing-front`，本轮保留原 nanqing 改动并合入今天功能，完成远端核验后清理误建分支；不修改或推送 `main`。

## 发布锚点

- branch：既有 `frontend/nanqing`，合并前 tip `78694e6a0774324e8b42b22fdd55c09487b27450`；从 `077bb81d` 合入本对话功能及发布记录，保留双方历史。功能提交 `a905f146`、`6a8da371`、`3aef0505`、`18195ae7`、`ffe87eb8`；最终 HEAD 见 Git。
- worktree：`.worktrees/researchers-services`，保留为本次发布/回退引用，下一次成功发布后按生命周期清理。
- 收尾观察：仓库根目录已在另一任务的 `codex/r1-record-hardening`，含未跟踪 CI 产物；本轮保留不动，只提交本任务工作树。
- 2026-10-09 前轮已部署：服务器 active 与公网 `/__release` 均为 `a6f068a5ebefdab3427e8f01d110ca440fa9f97d`，rollback 为 `45a577a3a8f6bca78a063e7478fba131c5efb375`。`main` 远端为 `62b83372e51285b31a65f89bc0fabeb88d7c09bf`，未修改；本轮仅修正分支，不将 nanqing 中其他未部署候选一起上线。

## 已实现

- 两类全站导航首项菜单，支持键盘、Escape、外部点击及窄屏；五类服务介绍页、Researchers 四动作及 FAQ 均有中英文。
- 公开/工作区/登录壳层统一使用 `ProductRouteNavigation` 和 `ProductHeaderActions`，下拉复用 `NavigationMenu`；上传入口指向原 `/guide`，保留 `ResearchGuide` 整页内容和交互。个人中心保留账户工具，研究桌面移入该工具菜单；加载/未知身份不展示旧用户。
- About 联系、反馈、演示分别由 `/contact` 及 `topic=feedback|demo` 承接；API 指向既有 `/developers`，本轮只调整入口，未重写 API 板块。
- About 与技术咨询共用 `EmailDraftButton`：页面和客户端包不内置收件地址；点击后 POST `/contact/email` 固定意图，服务端 no-store 返回地址再组装邮件草稿。正文/个人信息不上传，失败可重试，输入/身份变化取消旧请求。服务端 `OPENSCIENCE_CONTACT_EMAIL` 优先，兼容旧公开变量配置；未配置时使用用户指定地址。只减少静态采集，公开端点不能保证防垃圾邮件；不代发邮件。
- Researchers 按用户原文更新介绍与四项说明，加入 “Share early. Be discovered by AI. Make an impact.”；桌面采用图标/标题、说明、按钮三列，细分隔线取代卡片外框，手机顺排。英文同步翻译，四入口不变；本轮只修改介绍文案和布局，不代表新增或验收多模态生成能力。
- 登录 returnTo 保持创建模式。预出版可选单 PDF 或 `mode=blank` 直接建立私有六字段草稿；已发表入口记录题目、作者、期刊及可选 DOI，上传后进入既有确认/编辑流程。
- 创建 API 传递 SDF 扩展 `researchType`、`originalAuthors`、`originalJournal`、`originalDoi`。确认时白名单保留数据库已有有效声明，写入版本快照与当前草稿；编辑/公开页明确标为用户填写，不替代核实的来源身份。
- PDF 专用控件与即时错误反馈；提交中锁定模式。专用创建页停用无对话目标的浮动 Hermes，避免挡住提交；通用创建页保留助手。发布仍需原流程明确确认。
- Industry / Investors：指定英文输入提示、可编辑示例、需求简报、受鉴权元数据检索、来源清单/最多三项比较、资料导出、带简报和所选来源的联系草稿。中英文与响应式入口齐全，机构和期刊分支保持原界面。
- 内部拆分 `types/service/storage/contact`；复用既有任务与幂等恢复，登录返回保留用户输入但不自动提交。精确任务恢复、账号/受众隔离、失败/部分来源/空状态均有对应处理。

## 验证与限制

- 前轮 Researchers 证据：Domain 构建、Web TypeScript 通过；确认服务 82/82、客户端请求体 1/1、新增范围 ESLint 与 diff 检查通过。
- 前轮 Researchers 菜单、手机登录返回、无 PDF 创建、已发表上传、格式反馈/提交锁定五条浏览器用例通过；原通用图文创建用例通过（共 6 条），本轮未重复运行。
- 浏览器使用受控 API fixture；未触发真实模型、论文上传或公开发布。ignored 截图：`apps/web/tmp/researchers-{desktop,mobile,mobile-menu,english}.png`。本机 Google Fonts 下载受限，截图使用回退字体。
- Sol/medium 实现创建，Sol/high 发现并复核关闭漏传 SDF、忙时模式切换、格式反馈问题；最终增量 GO。模拟流程不等于生产可用。
- 技术发现本机实际页面可打开；`/api/auth/me` 返回 500，因此真实服务不可用状态已观察，成功检索只使用真实生产者 DTO 形状的模拟 API 验证。没有真实模型调用、邮件发送或线上部署。
- 技术发现由 Sol/medium 实现、Sol/high 独立检查权限与异步状态，最终增量 GO。已修联系状态隔离、任务恢复重试、上游状态误判、跨账号请求锁和登录恢复覆盖输入；编辑同步保存，身份与草稿准备完成前明确显示加载状态。
- 前轮技术发现验证：单元测试 3/3、浏览器 7/7、Web TypeScript、ESLint、文档同步与差异检查通过。浏览器覆盖站内入口/登录返回、DTO 检索/比较/导出/邮件草稿、幂等重试、手机故障、账号切换、慢身份检查、部分来源/精确任务恢复。ignored 截图 `apps/web/tmp/{industry-results-desktop,investors-mobile}.png`。
- 前轮 Researchers 样式/文案：从实际服务对象菜单进入，观察桌面与窄屏；既有桌面四入口/键盘导航、手机入口/登录返回两条用例 2/2 通过，Web TypeScript 与页面 ESLint 通过。桌面四动作首屏可见，窄屏无溢出、按钮高度 44px。
- 前轮导航：Sol/medium 实现、Sol/high 增量审查 GO；Landing 定向 14/14、导航浏览器 3/3、Web TypeScript/ESLint 通过。真实 IAB 从指南打开 About/联系，桌面导航左右分组、手机四项同排；修正滚动条造成的菜单右缘裁切，375px 可见区内保留 12px 边距。浏览器登录身份为模拟数据，未发邮件/真实模型/业务写入。
- 本轮邮箱隐藏：Sol/medium 实现、Sol/high 增量 GO；定向单测 8/8、联系导航/咨询浏览器 2/2、TypeScript/ESLint 通过。真实 IAB 从 About 进入联系页，确认无邮箱展示；初始 HTML 与相关编译客户端包无固定收件地址。实际 GET 405、localhost/127 同源 POST 200 且 no-store（修复内部 URL 别名误拦截）。浏览器以失败响应验证延迟读取、重试和私有输入保留，不启动邮件客户端或发送邮件。
- 本次发布由 Sol/high 独立审查 GO，复用上述测试；正常服务器全量 build/start 成功，所有生产容器 healthy，Nginx、精确公网版本、journal 清除及 retention PREPARE/COMPLETE 均通过。部署日志：`tmp/deploy-dhl-nanqing-front/1791551684071-9e6d2196-2e36-491f-9b6f-0f94cb78026d.log`。原受控配置通过 `XGS_CONFIG_ROOT` 复用；无凭据复制、迁移或模型调用。
- 线上 IAB 实际从导航进入 Researchers、Industry、Investors、联系/反馈/演示、原 API 和上传指南；四项文案及横向布局、两类检索提示、咨询表单与无静态邮箱均已观察，已发表入口登录 returnTo 保留模式。公网 `/contact/email` GET 405、固定 compose POST 200 且 no-store；没有发送邮件、真实检索/上传/发布。登录后操作继续沿用前轮受控模拟证据，不声称完成真实账号验收。
- 分支纠正整合：Sol/medium 解决新建页和 SiteHeader 两处冲突，Sol/high 增量 GO；保留 nanqing 的普通创建 Hermes 入口和今日 type/mode。Web 定向 23/23、Domain 确认 82/82、Web 类型/范围 lint/文档检查通过；浏览器 12 条中首次主入口未出现，其他 11 条及失败单例原断言重跑通过，未弱化测试。失败证据 `tmp/nanqing-merge-e2e-{initial.log,first-error.md}`。原 nanqing 的 78694e6a CI 已存在 Hermes dashboard 失败，其余入口和期刊通过，不将其归因于本轮。
- 开发预览曾单次首屏加载超时；未确定原因，未宣称已修。冻结代码后该单例及完整 7 条均通过；失败/最终日志保留于 ignored `apps/web/tmp/technology-discovery-{timeout,final-e2e}.log`，测试新增失败诊断附件便于再现定位。成功 API 交互仍仅为受控模拟。

## 后续与边界

- 前轮功能发布已完成；本轮合并验证完成，协作目标纠正为现有 `frontend/nanqing`，远端 HEAD / CI 见 GitHub。误建引用只在确认正确远端包含全部提交且旧引用未被他人更新后删除。原发布无迁移，不复用错误分支的“无 CI 触发”结论，也不据合并成功宣称其他候选已部署。
- 内部能力与后续 AI 接线见 [技术发现设计](../specs/2026-10-09-technology-discovery-design.md)。发布不触发真实模型、论文公开或邮件发送；深层 Parser/ScanSci/embedding 验收不纳入本轮。
- Researchers 公开主页的独立地址、栏目与公开成果列表属于后续个人主页设计范围。
