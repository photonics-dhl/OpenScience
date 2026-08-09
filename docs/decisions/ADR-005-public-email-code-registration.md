# ADR-005：公开邮箱验证码注册取代邀请码门禁

- Status: Accepted
- Date: 2026-08-09

## Context

早期测试期方案要求邀请码注册，但这与平台面向研究者开放抢占先发、提交 Research Object 并接受社区 review 的产品定位冲突。用户已明确否决邀请制，要求研究者自行申请邮箱验证码并完成注册。

## Decision

1. 公开注册入口使用两步邮箱验证码：先申请验证码，再以验证码、显示名和密码确认账户。
2. 申请阶段不创建 User；确认成功后原子创建或迁移 legacy invited User，并创建个人 Workspace。
3. 不再要求公众提供 Invitation code；legacy invitation API 仅作已部署账户兼容，不出现在产品 UI。
4. 注册写入必须限流、审计、防枚举；验证码 challenge 单邮箱至多一个 active，错误尝试原子计数，投递失败立即失效。
5. 使用平台即确认服务条款与平台发布的适用许可声明；具体 RO 内容许可仍由作者在公开版本发布时选择并版本化。

## Consequences

- 注册漏斗更开放，必须依靠邮件验证、速率限制、反滥用监控和后续公开发布审核控制风险。
- 旧文档中“测试期邀请码注册”由本 ADR 和 baseline §2.1 的新表述取代。
- 生产部署 migration 22 前必须备份并验证 legacy invited-account 迁移路径。
