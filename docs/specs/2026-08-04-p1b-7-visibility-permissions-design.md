# P1B-7 RO 可见性模型与 API 层权限强制 Design

> Phase 1B SDF 与版本 — P1B-7  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §4.2、§2.1.5、§3.3、§17  
> 对应 task-master: 3.7（RO 可见性模型与 API 层权限强制）

---

## 1. 目标与范围

### 1.1 目标
实现 private/invite_only/public 三态可见性 + API 层授权检查，防止跨 Workspace 越权（§17 MUST）。

### 1.2 范围

**In Scope（P1B-7）**：
- `VisibilityRequest` 表：可见性扩大变更的请求/记录（§4.2 显式审批，审批流 Phase 1D）
- domain：`canAccessRo` 判定函数（成员/invite_only/public 矩阵）+ `requestVisibilityChange`（扩大需请求）
- API：访问控制强制（/research-objects、/versions、/commits、/artifacts 统一走 canAccessRo）+ invite_only 邀请判定
- 测试：单测（可见性矩阵）+ 安全测试（跨 Workspace/invite_only/绕过前端越权）

**Out of Scope（Phase 1D/1C）**：
- 审批流 UI 与 R0–R4 分级（§4.2 MUST 审批流）
- Branch/Issue/PR 继承可见性应用（Phase 1C，模型字段预留）
- 搜索引擎索引控制（public 索引）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §4.2 | private 仅 Workspace 授权成员 | canAccessRo：member 才可 |
| §4.2 | invite_only 持有效邀请/被指定账户 | VisibilityGrant 表（指定账户）+ 邀请校验 |
| §4.2 | public 公众可见 | canAccessRo：全放行 |
| §3.3 | API 层做同样授权（禁仅前端） | 所有资源路由统一 requireRoAccess |
| §17 | 防止跨 Workspace 越权 | 越权 → 404（不泄露存在性） |
| §4.2 | 扩大可见范围需显式审批 | VisibilityRequest 记录 + 阻断（审批流 Phase 1D） |
| §17 | 可见性变更写审计 | requestVisibilityChange 审计 |

---

## 3. 数据模型（迁移 11）

```prisma
// 新表：指定账户可见（invite_only 时授权访问者）
model VisibilityGrant {
  id            String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  granteeId     String   @map("grantee_id") @db.Uuid // 被指定账户
  grantedBy     String   @map("granted_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation(...)
  grantee       User            @relation("VisibilityGrantee", ...)
  granter       User            @relation("VisibilityGranter", ...)

  @@unique([researchObjectId, granteeId])
  @@map("visibility_grants")
}

// 新表：可见性扩大请求（§4.2 显式审批记录；审批流 Phase 1D）
model VisibilityRequest {
  id                String   @id @default(uuid()) @db.Uuid
  researchObjectId  String   @map("research_object_id") @db.Uuid
  requestedBy       String   @map("requested_by") @db.Uuid
  fromVisibility    RoVisibility @map("from_visibility")
  toVisibility      RoVisibility @map("to_visibility")
  status            String   @default("pending") // pending → approved/rejected（Phase 1D 审批）
  createdAt         DateTime @default(now()) @map("created_at")

  researchObject    ResearchObject @relation(...)
  requester         User           @relation(...)

  @@index([researchObjectId])
  @@map("visibility_requests")
}
```

---

## 4. domain 设计

### 4.1 canAccessRo（判定矩阵）

```ts
// packages/domain/src/visibility/access.ts
export type RoAccess = 'granted' | 'denied';

export async function canAccessRo(
  deps: WorkspaceDeps,
  input: { researchObjectId: string; userId?: string },
): Promise<RoAccess>;
```

**判定**：
| RO.visibility | userId 存在 | 判定 |
|---|---|---|
| public | 任意（含匿名） | granted |
| private | 是 | 成员 → granted；非成员 → denied |
| private | 否（匿名） | denied |
| invite_only | 是 | 成员 或 VisibilityGrant 命中 → granted；否则 denied |
| invite_only | 否（匿名） | denied |

### 4.2 requestVisibilityChange（扩大需显式审批）

```ts
// packages/domain/src/visibility/requests.ts
export async function requestVisibilityChange(
  deps: WorkspaceDeps,
  input: { userId: string; researchObjectId: string; toVisibility: RoVisibility; note?: string },
): Promise<VisibilityRequest>;
```

**规则**：
1. 成员校验（发起者须成员）
2. 缩小/同级可见性（public→private 等）→ 直接应用 + 审计
3. **扩大**（private→invite_only/public，invite_only→public）→ 阻断，写 VisibilityRequest(pending) + 审计（§4.2 显式审批，Phase 1D 审批流）

### 4.3 grantVisibility（invite_only 指定账户）

```ts
export async function grantVisibility(
  deps, input: { userId: string; researchObjectId: string; granteeId: string },
): Promise<void>;
// 成员发起，写 VisibilityGrant
```

---

## 5. API 层强制

统一 `requireRoAccess` preHandler：

```ts
// apps/api/src/routes/ro-access.ts
export async function requireRoAccess(
  deps, req, reply,
  input: { researchObjectId: string; userId?: string },
): Promise<boolean>;
```

**挂接**：
- `/research-objects/:id` GET/PATCH：requireRoAccess（member 可见性）
- `/sdf/:roId` GET/PUT：requireRoAccess
- `/research-objects/:id/commits` POST：requireRoAccess（member）
- `/versions/:id` GET：requireRoAccess
- `/research/*`：public 匿名（已有，P1B-6）
- `/artifacts/:id/download`：artifact 属 workspace → requireMembership（已有）

---

## 6. 测试策略

### 6.1 单元测试（可见性矩阵）
- canAccessRo 全矩阵：public/private/invite_only × 成员/非成员/匿名/invite 命中
- requestVisibilityChange：缩小直接应用、扩大阻断 + 请求记录

### 6.2 安全测试（§21.1 越权）
- 跨 Workspace 访问 private RO → 404
- 未受邀访问 invite_only → 404
- 直调 API 绕过前端越权 → 404（同 6.2）

---

## 7. Open Questions（Design Gate 确认）

### 7.1 invite_only 邀请语义
- **决策（2026-08-04）**：方案 A — VisibilityGrant 表（指定账户），RO 级独立。

### 7.2 扩大可见性时机
- **决策（2026-08-04）**：方案 A — 扩大立即阻断 + 写 VisibilityRequest(pending)（审批 Phase 1D）。

### 7.3 public 索引控制
- **决策（2026-08-04）**：方案 A — public 即可索引，不另设字段。

### 7.4 /research/* 匿名返回
- **决策（2026-08-04）**：方案 A — public 匿名可见，invite_only/private 404。

### 7.5 visibility 变更幂等
- **决策（2026-08-04）**：方案 A — 同 toVisibility 幂等（无变化成功 + 审计）。

---

## 8. 债务登记

- **审批流 + R0–R4 分级**（Phase 1D）
- **Branch/Issue/PR 继承**（Phase 1C）
- **搜索引擎索引**（public 已含）
- **VisibilityRequest 审批动作**（Phase 1D）

---

## 9. 验收条件

- [ ] 迁移 11 applied + rollback
- [ ] domain 可见性矩阵单测全绿
- [ ] API 集成测试（跨 Workspace/invite_only/绕过前端/扩大阻断）
- [ ] 本地门禁全绿
- [ ] 云上集成测试全绿
- [ ] task-master 3.7 done
- [ ] 文档同步
