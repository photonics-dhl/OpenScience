# ADR-003 管理后台强认证：nginx basic_auth 双层 + TOTP 列为上线路障

- 状态：Accepted（2026-08-03 P1A-8 design gate 确认）
- 日期：2026-08-03
- 决策者：用户 + Claude Code
- 关联：`docs/specs/2026-08-03-p1a-8-security-baseline-design.md`、`docs/OpenScience_Kimi_Development_Spec.md` §17（管理后台启用更强认证）、`infra/nginx/openscience.conf`

## Context

Spec §17 MUST「管理后台启用更强认证」。`/admin` 现有应用层防护：platform_admin 角色守卫（P1A-5）+ 全写操作审计（P1A-6）。但应用层防护的前提是攻击者能到达 Fastify 拿到 401/403——不构成传输层外的独立防线。基线要求"更强"，即在应用层之外再叠一层独立认证。

候选方案：nginx basic_auth（复用 /monitor/ `.htpasswd-monitor` 先例，2026-08-01 已上线）、TOTP 二次验证（otplib）、独立二验 Token。

## Decision

1. **nginx basic_auth 一层（本任务落地）。** `/admin/` 前缀在 nginx 层加 `auth_basic`，凭据文件 `/etc/nginx/.htpasswd-admin`（云上 `htpasswd` 生成，**不入库**）。放行后才转 API，由 platform_admin 角色 + 审计继续把关。双层防线：传输层挡未授权访问路径 + 应用层鉴权 + 全审计。

2. **TOTP 二次验证列为上线路障（Launch Block）**。不是本任务实现。原因：TOTP 需要完整设置流（QR 码扫码、secret 存储、激活/重置 UI），而 `apps/web` 仍是空壳，无法交付可用 UX。web 有真实界面后，TOTP 为**上线前 MUST**，在 `/admin` 写操作叠加 OTP 校验。

3. **凭据生命周期**。`.htpasswd-admin` 同 `.htpasswd-monitor` 惯例：云上生成、权限 `chmod 640`、`chown root:nginx`、不入 git。轮换 = 重新 `htpasswd` 覆盖文件 + `nginx -s reload`。

## Consequences

- 传输层 basic_auth 挡掉未授权爬虫/扫描对 `/admin` 的探针，减少应用层日志噪音与暴力尝试面。
- basic_auth 凭据经 TLS（https 已通）传输，明文密码不暴露于链路。
- 代价：admin 操作需浏览器弹窗输两次凭据（basic_auth + 应用 session），UX 略差；用密码管理器可接受。
- basic_auth 只护 `/admin` 前缀，非全站——按基线"管理后台"边界精确落点，不影响公开/用户路径。

## Follow-ups

- 上线前：web 空壳有 UI 后，实现 TOTP 设置流（enroll → activate → OTP 校验），/admin 写操作叠加。
- 上线前：`deploy.sh` 填充（2.9 CI/CD）时把 htpasswd 生成步骤写入部署 runbook 自动化。
- 若 future 需要 admin 子域独立（如 admin.openscience.xyz），basic_auth 配置平移，决策不变。

## Alternatives Considered

- **现在实现 TOTP**：拒绝。web 空壳无设置流，只能临时 CLI/接口交付，体验残缺；TOTP secret 与账号绑定需数据库迁移，当前 phase 过度设计。列为上线路障更贴合「本阶段只做平台底座」边界。
- **仅应用层 platform_admin**：拒绝。不满足"更强"——无独立于应用进程的认证层。
- **独立二次验证 Token（短信/邮件）**：拒绝。需短信服务商或邮件流（§24 未定），比 TOTP 更重且同样缺 UI。
