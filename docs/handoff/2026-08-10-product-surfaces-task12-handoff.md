# OpenScience Task 12 Product Surfaces Handoff

日期：2026-08-10
工作树：`codex/optical-editorial-v3`
基线：`0f38fb1 docs: close editorial production checkpoint`

## 状态

Task 12 已完成并部署。页面 `c05145b`、Nginx 修复 `ab90a9d`、版本列表 API `c30848b`、Collaboration i18n `7f7121e` 均在线；七个 RO 表面与 Settings 的真实账号/390px 验收通过，Collaboration 390/1440 console error 均为 0。Task 11 的 Ultrafast Science 精选闭环仍在线且不应回退。

## 已完成

- 新增产品表面矩阵：`apps/web/lib/product-surfaces.ts`、`apps/web/test/product-surface-matrix.test.ts`。
- 新增真实路由：`/research-objects/[id]/overview`、`files`、`versions`、`publish`、`sandbox`、`/settings`。
- `ResearchWorkspaceNav` 和 `ResearchSurfaceShell` 统一 19/56/25 工作区语言；编辑器不再展示 disabled Overview/Publish 占位。
- Files 通过现有 ArtifactUploader + `createCommit` 绑定版本；Versions 使用 `listVersions`/`getVersionDiff`；Publish 使用许可证、发布审核、状态机和显式 R3 Dialog；Sandbox 使用现有 server job/result/modify API；Settings 使用 `/auth/me` 与 `/auth/logout`。
- Collaboration 外壳接入统一 Research Surface，Sandbox result/script modifier 改用同一视觉 token 与双语文案。

## 验证证据

- `npx pnpm@9.15.0 --filter @openscience/web test`：150/150。
- `npx pnpm@9.15.0 --filter @openscience/web typecheck`：通过。
- `npx pnpm@9.15.0 --filter @openscience/web build`：通过；新路由进入 Next production route manifest。
- messages JSON 解析、`git diff --check`：通过。

## 下一步

1. 执行 Task 13：验证长期 Figma owner/canonical，建立 V3 tokens、components、screens 与真实代码映射。
2. Task 14 把本轮临时浏览器脚本升级为确定性 route/state/viewport manifest、键盘、reduced-motion、LCP 门禁。
3. Task 15 重跑完整 Landing → Auth → Intake → Hermes → Workspace → Publish → Public → Explore → Collection 生产旅程。
3. 以 1440 与 390 视口检查页面溢出、console error、Publish R3 Dialog 和 Sandbox 结果。
4. 把真实服务器证据补入 `docs/progress.md`，再将 Task 12 标记 done，进入 Task 13 Figma canonical map。

## 约束

- 不读取或写入 `.env`；不把截图、凭据、OAuth、真实媒体写入仓库。
- Live2D 许可门禁（Task 9）保持独立 in-progress；本 Task 不引入模型二进制。
