# 导航与服务对象入口 CURRENT

## 需求与范围

- 用户规格：导航首项“服务对象 / Who we serve”，五类公开介绍入口；Researchers 最新反馈改为无编号、无围合外框的横向服务行，手机顺排、折叠 FAQ（取代早先 2×2 卡片要求）。
- 四入口：`/me`、`/research-objects/new?type=published`、`/research-objects/new?type=preprint`、`/explore`。`/who-we-serve/journals` 与 `/journals` 目录独立。
- 本轮连接既有本人主页；公开作者主页独立地址、内部栏目及成果展示布局按用户约定后续细化。未引入角色绑定、关注、私信或统计。
- 2026-10-09 用户追加：实现 Industry / Investors 前端展示与内部功能架构；高校与科研机构、期刊介绍页暂不开发。两页采用对话入口、需求整理、来源结果、比较/清单与联系流程；AI 技术分析不得冒充已有元数据能力。
- 联系接收邮箱由用户明确指定为 `chunanqing@opt.ac.cn`；通过集中配置保留更改入口，用户确认邮件草稿后自行发送。
- 最新导航要求：左侧“服务对象、功能、探索、About”，右侧“上传／创建研究、登录／注册或个人中心”。About 文案已确认：联系我们、反馈问题、申请情报分析演示、接入 API。原使用指南整页由上传入口承接；功能采用已告知用户的默认方案：学术主页、已发表解析、预出版创建三个下拉入口。

## 候选锚点

- branch：`codex/researchers-services-20261009`；base HEAD：`45a577a3a8f6bca78a063e7478fba131c5efb375`（已 fetch 的 canonical `origin/release/onchip-production-line`）；最终提交见 Git。
- worktree：`.worktrees/researchers-services`，供本轮预览与整合；保留到用户审阅/并入交付分支后清理。
- release / rollback：本轮未部署、未确认当前值；早期只读 SSH 认证失败，旧文档版本不当作本轮观测。其他交付仍读 Hermes CURRENT。

## 已实现

- 两类全站导航首项菜单，支持键盘、Escape、外部点击及窄屏；五类服务介绍页、Researchers 四动作及 FAQ 均有中英文。
- 公开/工作区/登录壳层统一使用 `ProductRouteNavigation` 和 `ProductHeaderActions`，下拉复用 `NavigationMenu`；上传入口指向原 `/guide`，保留 `ResearchGuide` 整页内容和交互。个人中心保留账户工具，研究桌面移入该工具菜单；加载/未知身份不展示旧用户。
- About 联系、反馈、演示分别由 `/contact` 及 `topic=feedback|demo` 承接，显示针对性说明和已编码邮件草稿；收件人复用集中邮箱配置，不代发邮件。API 指向既有 `/developers`，未新增接口、权限或模型能力。
- Researchers 按用户原文更新介绍与四项说明，加入 “Share early. Be discovered by AI. Make an impact.”；桌面采用图标/标题、说明、按钮三列，细分隔线取代卡片外框，手机顺排。英文同步翻译，四入口不变；本轮只修改介绍文案和布局，不代表新增或验收多模态生成能力。
- 登录 returnTo 保持创建模式。预出版可选单 PDF 或 `mode=blank` 直接建立私有六字段草稿；已发表入口记录题目、作者、期刊及可选 DOI，上传后进入既有确认/编辑流程。
- 创建 API 传递 SDF 扩展 `researchType`、`originalAuthors`、`originalJournal`、`originalDoi`。确认时白名单保留数据库已有有效声明，写入版本快照与当前草稿；编辑/公开页明确标为用户填写，不替代核实的来源身份。
- PDF 专用控件与即时错误反馈；提交中锁定模式。专用创建页停用无对话目标的浮动 Hermes，避免挡住提交；通用创建页保留助手。发布仍需原流程明确确认。
- Industry / Investors：指定英文输入提示、可编辑示例、需求简报、受鉴权元数据检索、来源清单/最多三项比较、资料导出、带简报和所选来源的联系草稿。中英文与响应式入口齐全，机构和期刊分支保持原界面。
- 内部拆分 `types/service/storage/contact`；复用既有任务与幂等恢复，登录返回保留用户输入但不自动提交。精确任务恢复、账号/受众隔离、失败/部分来源/空状态均有对应处理。邮箱集中配置为 `chunanqing@opt.ac.cn`，用户自行发送邮件。

## 验证与限制

- 前轮 Researchers 证据：Domain 构建、Web TypeScript 通过；确认服务 82/82、客户端请求体 1/1、新增范围 ESLint 与 diff 检查通过。
- 前轮 Researchers 菜单、手机登录返回、无 PDF 创建、已发表上传、格式反馈/提交锁定五条浏览器用例通过；原通用图文创建用例通过（共 6 条），本轮未重复运行。
- 浏览器使用受控 API fixture；未触发真实模型、论文上传或公开发布。ignored 截图：`apps/web/tmp/researchers-{desktop,mobile,mobile-menu,english}.png`。本机 Google Fonts 下载受限，截图使用回退字体。
- Sol/medium 实现创建，Sol/high 发现并复核关闭漏传 SDF、忙时模式切换、格式反馈问题；最终增量 GO。模拟流程不等于生产可用。
- 技术发现本机实际页面可打开；`/api/auth/me` 返回 500，因此真实服务不可用状态已观察，成功检索只使用真实生产者 DTO 形状的模拟 API 验证。没有真实模型调用、邮件发送或线上部署。
- 技术发现由 Sol/medium 实现、Sol/high 独立检查权限与异步状态，最终增量 GO。已修联系状态隔离、任务恢复重试、上游状态误判、跨账号请求锁和登录恢复覆盖输入；编辑同步保存，身份与草稿准备完成前明确显示加载状态。
- 前轮技术发现验证：单元测试 3/3、浏览器 7/7、Web TypeScript、ESLint、文档同步与差异检查通过。浏览器覆盖站内入口/登录返回、DTO 检索/比较/导出/邮件草稿、幂等重试、手机故障、账号切换、慢身份检查、部分来源/精确任务恢复。ignored 截图 `apps/web/tmp/{industry-results-desktop,investors-mobile}.png`。
- 前轮 Researchers 样式/文案：从实际服务对象菜单进入，观察桌面与窄屏；既有桌面四入口/键盘导航、手机入口/登录返回两条用例 2/2 通过，Web TypeScript 与页面 ESLint 通过。桌面四动作首屏可见，窄屏无溢出、按钮高度 44px。
- 本轮导航：Sol/medium 实现、Sol/high 增量审查 GO；Landing 定向 14/14、导航浏览器 3/3、Web TypeScript/ESLint 通过。真实 IAB 从指南打开 About/联系，桌面导航左右分组、手机四项同排；修正滚动条造成的菜单右缘裁切，375px 可见区内保留 12px 边距。浏览器登录身份为模拟数据，未发邮件/真实模型/业务写入。
- 开发预览曾单次首屏加载超时；未确定原因，未宣称已修。冻结代码后该单例及完整 7 条均通过；失败/最终日志保留于 ignored `apps/web/tmp/technology-discovery-{timeout,final-e2e}.log`，测试新增失败诊断附件便于再现定位。成功 API 交互仍仅为受控模拟。

## 下一步

- 导航与服务对象候选已完成，供用户本机审阅；功能菜单可按后续反馈调整。内部能力与后续 AI 接线见 [技术发现设计](../specs/2026-10-09-technology-discovery-design.md)。不改 Provider、数据库或生产服务，正式部署与真实模型效果不纳入本轮前端完成声明。
- 审阅页面后将提交整合至指定协作分支 `frontend/nanqing`；发布及真实账号验收另按部署权限执行。本轮未推送主分支或触发 CI。
- Researchers 公开主页的独立地址、栏目与公开成果列表属于后续个人主页设计范围。
