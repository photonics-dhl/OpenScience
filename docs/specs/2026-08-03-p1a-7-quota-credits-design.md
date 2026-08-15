# P1A-7 配额策略与 AI Credit 账务骨架 — Design Spec

- 日期：2026-08-03
- 关联：task-master 2.7；Spec（Baseline v1.0）§2.4.7（AI Credit）、§13.3（配额）、§15（实体）、§17（审计/可配置）
- 状态：design gate 逐节已确认（2026-08-03）；下步 writing-plans

## 0. 范围

P1A-7 只做**数据底座 + 配置读写 + 管理员账务**，不接任何消费点：

- 建 `quota_policies`（限额配置）与 `usage_ledger`（用量/授予流水）两表（migration 6）
- 后台可配置：admin 读写 policy、admin 追加 AI Credit
- 用户侧 `/usage`：查询当前生效限额 + 当前用量
- 月度 AI Credit 重置：纯函数 + 脚本骨架（调度部署归 2.9）
- 超额判定纯函数（testStrategy 明列）

不做：AI 调用扣费、上传/沙箱计量、配额强制执行点（全留给 1B/1D/1E）；用户等级体系（P1A 无等级，字段/scope 预留）；UI；Cron 常驻调度。

## 1. 总体架构

新增 domain 模块 `packages/domain/src/usage/`，API 扩展 `apps/api` 的 `/usage` 与 `/admin`。**不新增包**（YAGNI，依赖方向沿用 app → packages，无环）。

- **`packages/domain/src/usage/`**：`policies.ts`（解析回退）、`ledger.ts`（记账只追加）、`grants.ts`（月度授予纯函数）、`limits.ts`（超额判定纯函数）。复用 `WorkspaceDeps` 的 `{ prisma, audit?, now? }` 模式。
- **迁移 6**：`quota_policies` + `usage_ledger` 两表，附 `rollback.sql`（惯例）。
- **Prisma**：`infra/schema.prisma` 加两 model；resource/scope 用 String（可扩展，DB 不做 CHECK 枚举，app 层校验）。
- **admin 守卫**：复用 P1A-5 `platformRole = platform_admin` 模式（admin.ts 现成）。
- **审计**：复用 P1A-6 AuditSink，admin 写操作同事务记审计行。

## 2. 数据模型（migration 6）

### 2.1 `quota_policies` — 行级限额配置

行级 policy：一资源一行，scope 维度三层，天然支持 §13.3「按用户等级×Workspace×文件类型」。

```sql
CREATE TABLE quota_policies (
    id UUID PRIMARY KEY,
    scope TEXT NOT NULL,      -- 'global' | 'user_level' | 'workspace'
    scope_key TEXT,           -- workspace_id / level 标识；global 为 NULL
    resource TEXT NOT NULL,   -- file_size_bytes | storage_bytes | ro_capacity_bytes
                              -- | upload_bytes_month | ai_credit | python_task_count
                              -- | python_runtime_seconds | concurrent_tasks
    limit_value BIGINT NOT NULL,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quota_policies_pkey PRIMARY KEY (id),
    CONSTRAINT quota_policies_scope_key_unique UNIQUE (scope, scope_key, resource)
);

CREATE INDEX quota_policies_resource_idx ON quota_policies(resource);
```

无 `updatedAt` 之外的自动维护；后台改动走 `PUT /admin/quota-policies/:resource`（upsert）。

### 2.2 `usage_ledger` — 只追加流水账本

```sql
CREATE TABLE usage_ledger (
    id UUID PRIMARY KEY,
    user_id UUID,             -- AI Credit 按用户
    workspace_id UUID,        -- 存储/容量按 workspace
    resource TEXT NOT NULL,   -- 同 quota_policies.resource
    delta BIGINT NOT NULL,    -- 有符号：授予 +，消费/占用 -
    kind TEXT NOT NULL,       -- 'monthly_grant' | 'admin_topup' | 'consume' | 'adjust'
    period TEXT,              -- 'YYYY-MM'，monthly_grant 必填；topup/consume 为 NULL
    reason TEXT,
    idempotency_key TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usage_ledger_pkey PRIMARY KEY (id),
    CONSTRAINT usage_ledger_idem_key UNIQUE (idempotency_key)
);

CREATE INDEX usage_ledger_user_resource_time_idx ON usage_ledger(user_id, resource, created_at);
CREATE INDEX usage_ledger_ws_resource_time_idx ON usage_ledger(workspace_id, resource, created_at);
CREATE INDEX usage_ledger_resource_period_idx ON usage_ledger(resource, period);
```

只追加，无 UPDATE/DELETE（`metadata` 写入前已脱敏）。`idempotency_key` UNIQUE 支撑管理员追加的重试幂等（§16「关键资源必须有幂等键」）。

### 2.3 余额/用量聚合（均 SUM(delta)）

- **AI Credit 余额**（用户级）：`SUM(delta) WHERE user_id=? AND resource='ai_credit'`
- **存储用量**（workspace 级）：`SUM(delta) WHERE workspace_id=? AND resource='storage_bytes'`（上传 +，删除 -）
- 符号约定统一：`SUM(delta)` = 该资源当前持有量。Credit 是剩余余额；存储是当前占用。同一模型，语义由 resource 决定。

## 3. AI Credit 语义：累积余额（B，已确认）

用户选 B：**累积余额**，每月 +N 不清零，管理员可追加。

- 余额 = ledger 全量 `SUM(delta)`（授予 + 追加 + 消费负项）
- 月度重置 = 每月向每个活跃用户插入一条 `monthly_grant` 流水，`delta=+N`，`period='YYYY-MM'`
- `monthly_amount` 来自 policy：`resolvePolicy(user_level 或 global, 'ai_credit')` 的 `limit_value` 语义 = **每月授予量**（非余额上限）
- 幂等：重置脚本按 `(user_id, resource, period)` 查重，已发过的 period 跳过
- 新用户在邮箱确认事务中按同一 policy 补齐当前 UTC 月 grant；确定性幂等键保证同月重复确认/重试不重复发放，且既有 Personal Workspace 不会导致授信被跳过
- 调度：`grants.ts` 纯函数生成流水行 + 脚本骨架调用；Cron 常驻归 2.9

## 4. 默认占位数值（保守，§24 待确认）

占位值写入 `packages/domain/src/usage/seed.ts`（幂等 upsert 脚本 `scripts/seed-quota.mjs` 或等价入口），**不进 migration**——运营可改、可重跑重置；值集中一处，§24 定案后改一处即可。

先只 seed `global` 层（P1A 无用户等级；`user_level` scope 结构预留但无行）：

| resource | 占位 limit_value | 语义 |
|---|---|---|
| `file_size_bytes` | 50 MB | 单文件大小上限 |
| `storage_bytes` | 1 GB | Workspace 总容量 |
| `ro_capacity_bytes` | 100 MB | 单 RO 容量 |
| `upload_bytes_month` | 2 GB | 月上传流量 |
| `ai_credit` | 500 | 每月授予量 |
| `python_task_count` | 50 | 月 Python 任务次数 |
| `python_runtime_seconds` | 3600 | 月 Python 运行时长 |
| `concurrent_tasks` | 2 | 并发任务数 |

**数值均属推测占位，doc 内标注「§24 待确认，运营可改」，不写死在前端。**

## 5. 解析回退与超额判定

### 5.1 `resolvePolicy`（domain/usage/policies.ts）

给定 `(workspaceId, userLevel, resource)`，按优先级取首个命中行：

```text
workspace(workspaceId, resource) → user_level(userLevel, resource) → global(resource)
```

未命中返回 `null`（无限制，不做 0 误判）。

### 5.2 超额判定纯函数（domain/usage/limits.ts）

```ts
checkLimit({ used, limit }): { allowed: boolean; remaining: number }
```

纯函数，消费点（1B/1D/1E）未来传入「policy + 当前用量」即可判定，本阶段不接线。

## 6. API

全部 JSON；admin 端点复用 platform_admin 守卫；写操作同事务审计（AuditSink）。

| 端点 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/admin/quota-policies` | GET | platform_admin | 列出全部 policy |
| `/admin/quota-policies/:resource` | PUT | platform_admin | upsert 行（body: scope, scopeKey, limit） |
| `/admin/credits` | POST | platform_admin | 追加 Credit（body: userId, amount, reason；`Idempotency-Key` 头防重） |
| `/admin/usage` | GET | platform_admin | 按 user/workspace/resource 查 ledger |
| `/usage` | GET | 登录用户 | 查自己各资源「生效限额 + 当前用量 + 剩余」，含个人与所属 workspace |

审计 action：`quota.policy.upsert` / `quota.credit.topup` / `quota.monthly.grant`。

## 7. 边界（明确不做）

- 不接消费点（AI 扣费/上传计量/沙箱计数）——1B/1D/1E 挂接，只消费本底座
- 无用户等级枚举与等级 seed——结构预留，等 §24/后续
- 无 UI
- 无 Cron 常驻——`grants.ts` 纯函数 + 脚本骨架，调度归 2.9
- 不做 ledger 归档/清理（数据量小，后议）

## 8. 测试

- **单元**：`resolvePolicy` 三层回退矩阵；`checkLimit` 边界（恰好=limit、超 1、负 used）；`generateMonthlyGrants` period 边界 + 幂等查重；ledger 符号约定
- **集成**（云上，先全量 build）：policy upsert→resolve 生效；topup 落账→余额聚合；`Idempotency-Key` 重放不重复追加；admin 写操作产生审计行；`/usage` 越权负向
- 本机：`test` + `typecheck` + lint 全绿
