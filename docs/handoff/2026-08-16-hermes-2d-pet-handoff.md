# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** UI 修订与展示资产写权限修复均已上线；完整多模态产品仍按段推进。

## Version tuple and production truth

- Worktree: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch: codex/product-workflow-design；文档记录时 application parent HEAD: c07c8d1（PR #84），后续 docs-only HEAD 从 Git 读取。
- Production source / active marker / public /__release: c07c8d15e5ba3b722577f42d6ad72af8c83189fe。
- Rollback: 440266c53325044f2bdff21b1ebfe1be6b792f71。Core/search migrations: 36/36、2/2。
- 13 个容器运行；API/Worker/Parser/ScanSci/BGE 与数据服务健康；公网/loopback 正常，无 failed marker 或 deploy journal；canonical transaction 与 retention 完成。
- 根目录旧 main 仍为 b9616cb，既有 memory、.Codex 配置及用户资料未改动；不是本轮开发或部署源。

## Goal and completed work

- Hermes Research Intelligence Tasks 1–12 已完成；不要恢复旧 MVP 或 Task 10–12 next action。当前目标是工作区—Hermes—RO 完整流程，以及论文生成图/视频、Hermes 语音修改和讨论。
- 用户要求成熟方案与现有能力优先、先做可用功能和展示、分段验收；暂不支持上传音视频理解。同事 frontend/nanqing 每日 10:00 巡检，已授权选择性合并部署。
- 首批 PR #78 整合同事 18 个 Web 文件，并修复 Dashboard 继续研究、RO scoped tasks 与 Hermes 会话绑定；避免重复移植 frontend/nanqing@e5db5ae。
- PR #81–83：居中自适应应用布局、紧凑个人页与设置、可展开研究列表、统一表单与按钮、手机布局；任务入口改到真实 Hermes task 页面；修复 unsafe patrol 的相邻动作重复。最后六行 Dashboard 压缩已撤回，避免 detached 菜单重叠。
- PR #84：展示资产生成/审核仅允许内容编辑角色及 draft Version；Worker 前置检查和提交事务重验权限、任务、版本与 Claim 内容；复用 Serializable draft row fence。已发布版本不可被追加/批准展示资产；成员只读和 archived 读取保留。
- UI 已交用户查看，不能冒称用户已接受效果。图片/视频/语音完整工作流尚未完成。

## Fresh acceptance evidence

- 全仓 build/typecheck/lint/test GREEN；权限 focused domain 12、worker 16、API 3；独立安全复审无阻断。并发用例是确定性交错，非 PostgreSQL 双会话测试。
- main CI 33942733721 GREEN，含 Product88 与 Hermes gate；ECS 精确 build、Parser 16-case acceptance、ScanSci 真实 OA/Worker、BGE 真实向量、迁移与内外网健康通过。
- c07c8d1 公网实际 Web + 受控 API fixtures 16/16；覆盖个人页宽屏/手机、身份恢复、Hermes 入口与任务继续。未写用户数据，不代替真实 OAuth/SMTP 或账号数据验收。
- 证据在 apps/web/test/visual/out/research-continuation/（ignored）；最终文件前缀 presentation-security-，部署使用 deploy-retry，另有 profile-desktop.png/profile-mobile.png 截图。
- 既有真实研究验收：OSR-2026-000019 展示资产；OSR-2026-000021 真实论文解析到公开发布。展示必须保留 presentation_not_evidence；Claims 不等于科学结论已验证。

## Constraints and remaining risks

- 不读取/打印 .env 或 Cookie；不安装第二 Chromium/BGE、FlareSolverr、全局包，不 broad prune。生产操作遵循项目脚本；发布已有用户授权。
- ScanSci OA 下载存在连接速度波动；本轮成功下载完整 24,671,920 bytes，SHA d57dc94c…f484a，owned canary 清理为 0。
- c07 首次发布在 mutation 前因 runtime entries 96518→96515 拦截；三个路径未定位。旧报告已保留，正式重验与完整重建/镜像/报告校验稳定后重试成功；不得将此描述为已定位并修复构建漂移。
- 生成完成后再编辑 Claim，仍可能使已有资产过时；批准 UI 前必须增加关联资产失效处理。提交前检查已覆盖生成过程中的 Claim 改动。
- 被拒绝的 Worker 完成可能留下无引用对象；媒体沿用 charged-on-submit，撤权后排队任务可能被拒绝但已计费。图解 chart 为现有确定性主张摘要卡片。
- MiniMax image/video 仍是管理员限定、默认关闭能力；ScienceDirect 仅等待官方授权条件，不恢复绕过方案。

## Next action and read first

1. 按 docs/plans/2026-09-05-integrated-research-product-plan.md 推进图解：来源 Claim 修改时使资产失效 → 认证私有内容预览 → 版本/Claim 选择、生成、进度与明确批准 → RO/Hermes 入口。
2. 复用现有 presentation-assets API/domain/Worker 与公开 Gallery。私有 SVG 必须精确作用域认证、大小/完整性检查、安全 SVG、private/no-store 与 sandbox CSP；使用 img，不注入 SVG；HTML 暂保持附件。
3. 新 session 先读 AGENTS、本 handoff、需求基线相关章节、短 progress；涉及生产重新 fetch/checkup 并核对 active/public/rollback，不把 docs HEAD 或根目录旧 main 当生产源。
