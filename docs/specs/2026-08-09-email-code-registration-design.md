# OpenScience 邮箱验证码注册设计

状态：已批准，2026-08-09

## 目标

普通研究者通过“申请验证码 → 邮箱验证 → 设置密码 → 创建研究身份”的两步流程注册。管理员邀请码保留为特殊渠道能力，不再作为普通注册入口的必填字段。

## 方案

新增 `signup_challenges` 元数据表。第一步只创建短期挑战，不创建 User；第二步在验证码通过后事务性创建 User、核销 challenge，并由 `onEmailVerified` 创建个人 Workspace。

挑战字段：`id`、`email`（citext）、`code_hash`、`attempts`、`expires_at`、`last_sent_at`、`consumed_at`、`created_at`。数据库不保存密码或验证码明文；challenge 过期后可被同邮箱新请求替代，旧 challenge 不能确认。

API 合同：

- `POST /auth/request-signup-code`：请求 `{ email, displayName }`，始终对合法格式返回 202，避免邮箱枚举；发送冷却和限流由服务端执行。
- `POST /auth/confirm-signup`：请求 `{ email, code, password, displayName }`，成功返回用户状态并设置 HTTP-only session cookie；验证码错误、过期、锁定和邮箱已注册分别返回稳定错误码。
- 现有 `/auth/register` 邀请注册保留兼容，用于管理员/特殊渠道，不再由公开注册 UI 调用。

## 安全与恢复

- 验证码只保存 hash，10 分钟有效，错误次数达到上限后锁定。
- 密码仅在确认注册时提交，使用现有 password hash 逻辑。
- 请求接口不透露邮箱是否已注册；邮件发送失败返回可恢复错误，不回滚已成功创建的 challenge。
- 用户可从验证页重发验证码；UI 明确冷却、过期和投递失败状态。
- migration additive、可回滚；不删除 invitations，不修改既有用户。

## UI 与视觉

- `/register` 采用两步身份台：Step 1 邮箱/姓名，Step 2 验证码/密码。
- 保留 RO 六节点品牌资产、深墨基底、蓝色证据路径与橙色版本差异语法。
- 取消“Invitation code”输入框，不再让普通研究者面对管理员内部概念。
- 桌面端采用研究命题 + 紧凑表单的非对称布局；移动端保持完整功能与清晰步骤轨迹。

## 验收

- 无邀请码可申请验证码并完成注册。
- 同邮箱重复请求不会创建多个用户；重复/过期/错误验证码不可确认。
- 注册成功后自动进入 Dashboard，个人 Workspace 可列出并可创建首个 RO。
- 服务器 migration status、远端 build、compose 重建、公网路由和真实邮箱发送均通过。
