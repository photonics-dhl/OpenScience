# Researchers 服务入口 CURRENT

## 需求与范围

- 用户规格：导航首项“服务对象 / Who we serve”，五类公开介绍入口；Researchers 桌面 2×2 等权功能卡、手机顺排、折叠 FAQ。
- 四入口：`/me`、`/research-objects/new?type=published`、`/research-objects/new?type=preprint`、`/explore`。`/who-we-serve/journals` 与 `/journals` 目录独立。
- 本轮连接既有本人主页；公开作者主页独立地址、内部栏目及成果展示布局按用户约定后续细化。未引入角色绑定、关注、私信或统计。

## 候选锚点

- branch：`codex/researchers-services-20261009`；base HEAD：`45a577a3a8f6bca78a063e7478fba131c5efb375`（已 fetch 的 canonical `origin/release/onchip-production-line`）；最终提交见 Git。
- worktree：`.worktrees/researchers-services`，供本轮预览与整合；保留到用户审阅/并入交付分支后清理。
- release / rollback：本轮未部署、未确认当前值；早期只读 SSH 认证失败，旧文档版本不当作本轮观测。其他交付仍读 Hermes CURRENT。

## 已实现

- 两类全站导航首项菜单，支持键盘、Escape、外部点击及窄屏；五类服务介绍页、Researchers 四动作及 FAQ 均有中英文。
- 登录 returnTo 保持创建模式。预出版可选单 PDF 或 `mode=blank` 直接建立私有六字段草稿；已发表入口记录题目、作者、期刊及可选 DOI，上传后进入既有确认/编辑流程。
- 创建 API 传递 SDF 扩展 `researchType`、`originalAuthors`、`originalJournal`、`originalDoi`。确认时白名单保留数据库已有有效声明，写入版本快照与当前草稿；编辑/公开页明确标为用户填写，不替代核实的来源身份。
- PDF 专用控件与即时错误反馈；提交中锁定模式。专用创建页停用无对话目标的浮动 Hermes，避免挡住提交；通用创建页保留助手。发布仍需原流程明确确认。

## 验证与限制

- Domain 构建、Web TypeScript 通过；确认服务 82/82、客户端请求体 1/1、新增范围 ESLint 与 diff 检查通过。
- Researchers 菜单、手机登录返回、无 PDF 创建、已发表上传、格式反馈/提交锁定五条浏览器用例通过；原通用图文创建用例通过（共 6 条）。
- 浏览器使用受控 API fixture；未触发真实模型、论文上传或公开发布。ignored 截图：`apps/web/tmp/researchers-{desktop,mobile,mobile-menu,english}.png`。本机 Google Fonts 下载受限，截图使用回退字体。
- Sol/medium 实现创建，Sol/high 发现并复核关闭漏传 SDF、忙时模式切换、格式反馈问题；最终增量 GO。模拟流程不等于生产可用。

## 下一步

- 审阅页面后将提交整合至指定协作分支 `frontend/nanqing`；发布及真实账号验收另按部署权限执行。本轮未推送主分支或触发 CI。
- Researchers 公开主页的独立地址、栏目与公开成果列表属于后续个人主页设计范围。
