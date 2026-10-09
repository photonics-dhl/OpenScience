# 服务对象入口 CURRENT

## 需求与范围

- 用户规格：导航首项“服务对象 / Who we serve”，五类公开介绍入口；Researchers 桌面 2×2 等权功能卡、手机顺排、折叠 FAQ。
- 四入口：`/me`、`/research-objects/new?type=published`、`/research-objects/new?type=preprint`、`/explore`。`/who-we-serve/journals` 与 `/journals` 目录独立。
- 本轮连接既有本人主页；公开作者主页独立地址、内部栏目及成果展示布局按用户约定后续细化。未引入角色绑定、关注、私信或统计。
- 2026-10-09 用户追加：实现 Industry / Investors 前端展示与内部功能架构；高校与科研机构、期刊介绍页暂不开发。两页采用对话入口、需求整理、来源结果、比较/清单与联系流程；AI 技术分析不得冒充已有元数据能力。
- 联系接收邮箱由用户明确指定为 `chunanqing@opt.ac.cn`；通过集中配置保留更改入口，用户确认邮件草稿后自行发送。

## 候选锚点

- branch：`codex/researchers-services-20261009`；base HEAD：`45a577a3a8f6bca78a063e7478fba131c5efb375`（已 fetch 的 canonical `origin/release/onchip-production-line`）；最终提交见 Git。
- worktree：`.worktrees/researchers-services`，供本轮预览与整合；保留到用户审阅/并入交付分支后清理。
- release / rollback：本轮未部署、未确认当前值；早期只读 SSH 认证失败，旧文档版本不当作本轮观测。其他交付仍读 Hermes CURRENT。

## 已实现

- 两类全站导航首项菜单，支持键盘、Escape、外部点击及窄屏；五类服务介绍页、Researchers 四动作及 FAQ 均有中英文。
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
- 本轮定向验证：技术发现单元测试 3/3、浏览器 7/7、Web TypeScript、ESLint、文档同步与差异检查通过。浏览器覆盖站内入口/登录返回、DTO 检索/比较/导出/邮件草稿、幂等重试、手机故障、账号切换、慢身份检查、部分来源/精确任务恢复。ignored 截图 `apps/web/tmp/{industry-results-desktop,investors-mobile}.png`。
- 开发预览曾单次首屏加载超时；未确定原因，未宣称已修。冻结代码后该单例及完整 7 条均通过；失败/最终日志保留于 ignored `apps/web/tmp/technology-discovery-{timeout,final-e2e}.log`，测试新增失败诊断附件便于再现定位。成功 API 交互仍仅为受控模拟。

## 下一步

- Industry / Investors 候选已完成，供用户本机审阅；内部能力与后续 AI 接线见 [技术发现设计](../specs/2026-10-09-technology-discovery-design.md)。不改 Provider、数据库或生产服务，正式部署与真实模型效果不纳入本轮前端完成声明。
- 审阅页面后将提交整合至指定协作分支 `frontend/nanqing`；发布及真实账号验收另按部署权限执行。本轮未推送主分支或触发 CI。
- Researchers 公开主页的独立地址、栏目与公开成果列表属于后续个人主页设计范围。
