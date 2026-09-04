# 本人主页与设置分离 CURRENT Handoff

> 2026-09-04；本文件仅管理前端身份体验与本次发布。ScanSci 专题由原 handoff 管理，不执行其旧 next action。

## Goal and version tuple

- 用户授权修复工具环境、GitHub 版本管理、CI 通过后部署今天功能，保留回退。
- Worktree: `OpenScience-frontend`；branch `frontend/nanqing`；功能 HEAD `f0ff424`，连接/文档提交随后，完整候选以 PR #71 head 为准。
- PR: <https://github.com/photonics-dhl/OpenScience/pull/71>，base `main`；不得 force push。
- 实测 active/public release `e23a94f6622bb65e33ddbfe290970a9e6366567a`；生产 rollback `4bba4e5f634d51febe8e0aa08b306b3aadd7305e`。
- 本次部署回退目标必须是执行前重新确认的 active release，而不是盲用已有 rollback。

## Done

- `9ebe158` 科研身份加载/重试/验证恢复，`f0ff424` 账号链接到 `/me`、设置只保留使用偏好与账户设置；功能文件仅 `apps/web/`。
- 本人主页管理科研资料、ORCID、机构邮箱；旧设置认证入口与 OAuth 返回兼容，不默认公开。
- 本地 TypeScript、针对性 ESLint、diff check 通过；浏览器模拟 API 回归 7/7。全仓 Vitest 受 Windows ancestor EPERM 限制，不能声明通过。
- 官方 GitHub CLI 设备授权与实际 push 成功。Git Bash 内补 PATH 解决 dirname/credential-helper 不可见；系统 Git 使用 OpenSSL 后端。
- SSH 沿用原私钥；配置支持已核验 known_hosts 与自定义现有密钥路径，不改 HOME、不放宽私钥权限、不绕过 host key 校验。
- 服务器 checkup 通过，active/public 一致，未发现 failed marker；已有 2026-09-04 数据库备份集合，发布前须校验哈希与 release。
- 用户指定的 OpenScience 定时任务已删除，不重新建立。

## Constraints and next action

1. 完成当前 PR 的 CI，失败则修复并重跑；未绿不部署。
2. 重新确认 main、active、rollback、journal/failed 与备份；按 canonical exact-ref/parser/transaction 流程部署，不手工改生产源码。
3. 校验服务器 build、双库迁移、运行时依赖、容器与内外网健康、`/__release`；功能异常回退到本次发布前版本。
4. 更新本文件、索引和进度，记录最终合并 SHA、CI、生产与回退事实。
- 7/7 为模拟 API 浏览器回归，不是实际 SMTP/ORCID 授权成功证据。
- 后端尚无简介保存/显示名编辑接口；科研项目列表是现有可访问项目，不冒充本人署名成果。
- 不读取或提交 `.env`、CLI 凭据、私钥、验证码或真实用户资料。

## Read first

- `AGENTS.md`、本文件、`docs/runbooks/deployment.md`、`docs/runbooks/backup-restore.md`。
