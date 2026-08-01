# P1A-5 RBAC 权限矩阵设计（design spec）

- 日期：2026-08-01
- 对应任务：task-master 2.5「实现 RBAC 权限层并在 API 强制授权」
- 依据：Baseline v1.0 §3.3（角色）、§17（安全与隐私：防跨 Workspace 越权）；task-master 2.5 details/testStrategy
- 前置状态：P1A-2/3/4 已云上收口（集成测试 9/9 全绿）；workspace 15 端点已有最小内联权限检查
- design gate：四节均已经用户逐节确认（总览架构 / 动作清单与矩阵 / 数据模型与守卫 / 测试策略）

## 1. 总览与架构

目标：把 P1A-4 散落的内联角色检查收敛为一张声明式「动作×角色」矩阵，并在 API 层加统一守卫，满足 Spec §3.3（API 必须授权，禁止仅前端隐藏按钮）与 §17（任何资源访问先解析 workspace 归属再判角色）。

已确认的决策：

- **矩阵落点 `packages/domain/src/workspace/`**：新增 `permissions.ts`，导出动作类型、`ROLE_PERMISSIONS` 声明式表和纯函数 `can(role, action)` / `requireAction(membership, action)`。auth 包不动，保持纯身份层（对 task-master 2.5 details 原文「packages/auth 提供权限判定」的偏离，已经用户确认，实施时同步修订 task details）。
- **双层共源执行**：
  - API 边界：`apps/api` 新增 workspace 守卫（preHandler 风格）：session → 解析 membership → 矩阵判定。
  - domain 纵深：现有 7 处 `requireRole(membership, [...])` 全部替换为 `requireAction(membership, '<action>')`，判定走同一张矩阵，无第二份事实源。
- **代价登记**：守卫与 domain 各查一次 membership（参照 P1A-4 N+1 裁决，登记接受，1B 再优化）。
- **平台角色预留**：迁移 4 给 `User` 表加 `platformRole` 字段（默认 `user`，枚举预留 `moderator` / `platform_admin`），本次无消费方，仅数据模型占位。
- **1B–1D 扩展点**：动作类型为 `'<资源>.<动作>'` 字符串联合（如 `'workspace.update'`），未来 RO/Branch/PR 模块各自导出自己的矩阵片段，守卫机制复用。

明确不做：前端权限裁剪（web 仍为空壳）、审计接线（归 2.6，只留挂接注释）、Moderator/Platform Admin 任何功能面、外部策略引擎（Casbin 等，YAGNI）。

## 2. 动作清单与权限矩阵

动作分四类，矩阵只管 A/B 两类（workspace 角色相关），C/D 维持现状。

### A. 角色门控动作（矩阵核心）

与 P1A-4 现状行为完全一致，矩阵只是收敛事实源：

| 动作 | owner | maintainer | author | contributor | reviewer | viewer | 对应端点 |
|---|---|---|---|---|---|---|---|
| `workspace.update` | ✓ | ✓ | | | | | PATCH `/workspaces/:id` |
| `workspace.archive` | ✓ | | | | | | POST `/:id/archive` |
| `workspace.transfer` | ✓ | | | | | | POST `/:id/transfer` |
| `member.change_role` | ✓ | | | | | | PATCH `/:id/members/:userId` |
| `member.remove` | ✓ | ✓ | | | | | DELETE `/:id/members/:userId` |
| `invitation.create` | ✓ | ✓ | | | | | POST `/:id/invitations` |
| `invitation.revoke` | ✓ | ✓ | | | | | DELETE `/:id/invitations/:invId` |

### B. 成员可读动作

六角色全通（成员身份即授权）：`workspace.read`（GET `/:id`）、`member.list`（GET `/:id/members`）。

### C. 自我动作（不经矩阵，维持现状）

`member.leave`（POST `/:id/leave`，任何成员退自己）、`invitation.accept` / `invitation.decline`（被邀请人本人）、GET `/invitations`（看自己收到的邀请）。

### D. 认证即可（不经矩阵）

POST `/workspaces`（创建团队空间）、GET `/workspaces`（列自己的空间）。

说明：

- author/contributor/reviewer/viewer 在当前 15 端点下全是只读——这四档角色为 1B–1D 的内容动作（编辑、分支、PR、审阅）预留，矩阵忠实现状，随 1B 扩展。
- personal workspace 拒绝逻辑（`requireTeam`）、归档只读（`requireActive`）、last_owner 等业务不变量不属于授权矩阵，原样保留在 domain。

## 3. 数据模型与 API 守卫

### 迁移 4 `20260801010000_user_platform_role`（附 rollback.sql）

- `User` 表加列 `platform_role`，枚举 `PlatformRole { user, moderator, platform_admin }`，默认 `'user'`，NOT NULL。
- Prisma schema 同步加 `PlatformRole` 枚举与 `User.platformRole` 字段。
- 无任何代码消费该字段（不进 `CurrentUser`、不进 session、无 API 暴露）；仅在 `permissions.ts` 顶部注释说明平台角色判定是未来扩展点。
- rollback：DROP 列 + DROP 枚举。

### API 守卫（新建 `apps/api/src/routes/workspace-guard.ts`）

```ts
// 用法：在受保护路由上声明动作
app.patch('/:id', { preHandler: guard.requireWorkspaceAction('workspace.update') }, handler)
```

- `requireWorkspaceAction(action)` 返回 preHandler：先走 `requireCurrentUser`（无 session → 401），再从 `:id` 参数解析 workspaceId → 查 membership → `can(membership.role, action)`。
- 错误语义沿用 P1A-4：**空间不存在或非成员 → 404**（不泄露存在性）；**是成员但角色不足 → 403** `FORBIDDEN`；未登录 → 401 `SESSION_INVALID`。
- C/D 类端点不挂此守卫，维持现状；B 类挂 `workspace.read` / `member.list`。
- 守卫把解析出的 membership 挂到 `req` 上仅供日志/调试，domain 仍自行重查（domain 函数签名不变，改动最小）。
- 审计挂接：403/404 拒绝处加 `// audit(2.6): authz.deny` 注释，同 P1A-4 风格。

### domain 改动

`helpers.ts` 的 `requireRole` 删除（或降级为内部实现细节），7 处调用点（workspaces.ts 2、members.ts 3、invitations.ts 2）改为 `requireAction(membership, '<动作>')`；`requireMembership` 不动。

## 4. 测试策略与验收

### 单元测试（本机门禁，vitest）

- **矩阵完备性**：`can()` 全笛卡尔积断言——6 角色 × 9 个矩阵动作（A 类 7 + B 类 2）共 54 条逐条断言，防「改表漏角色」；另断言 C/D 类动作不在矩阵中。
- **`requireAction`**：允许时不抛、拒绝时抛 `WorkspaceError('FORBIDDEN')`。
- **API 守卫**：fake prisma 下 401（无 session）/ 404（非成员）/ 403（viewer 调 `workspace.update`）/ 放行（owner）四路。
- **回归**：现有 107 单测全绿（domain 7 处 `requireRole` 改 `requireAction` 后行为不变，现有用例即回归证据）。

### 集成测试（云上，`apps/api/test/` 扩展）

- 负向越权基线：非成员访问 `GET /workspaces/:id` → 404；viewer 成员 `PATCH /workspaces/:id` → 403；无 cookie → 401。
- P1A-4 已有的越权负向用例继续通过即共源证据。

### 验收与纪律

- 本机全门禁 exit 0：build / typecheck / lint / test / audit:knip / audit:dep / audit:deps / audit:dup / docs:lint。
- task-master 2.5 按 test-gate 纪律保持 pending，云上集成测试全绿后才置 done。
- 迁移 4 本机不 deploy，云上执行（同迁移 2/3 流程，云上写操作前逐项确认）。
- task-master 2.5 details 同步修订（判定落点从 auth 改为 domain，已获用户确认）。
