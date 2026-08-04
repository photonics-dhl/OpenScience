# P1C-2 Branch 管理与可见性继承 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.2（实现 Branch 创建/列表/切换/删除，可见性继承 RO）
- 依据：Spec §8 概念表、§2.3 决策 3、§4.2、§16、§17；复用 P1B-4 Commit/Branch 模型

---

## 需求基线

1. Branch = 「尚未进入主版本的研究方向或修改路线」（§8 概念表）
2. **分支继承所属 RO 的可见性**（§2.3 决策 3 = 规范，直接落地，非 open question）
3. 创建分支时校验调用者对 RO 所在 Workspace 的权限（§17 防跨 Workspace 越权）
4. 可见性不单独存储或强制等于 RO 可见性；任何**扩大**可见范围的操作必须显式审批（§4.2，审批机制占位，正式分级审批 P1D）
5. 关键资源使用幂等键和乐观锁（§16）
6. 阶段验收：另一用户可在 Fork 后创建 Branch（§21.2 步骤 11 前置，Fork 实装 P1C-5）

## 现状约束

- Branch 模型（迁移 4，P1B-4）：`id / researchObjectId / name / isDefault / createdAt`，`@@unique([researchObjectId, name])`
- `createCommit` 写死 `DEFAULT_BRANCH = 'main'`，无则建；分支指向 tip 通过 `Commit.branchId` 隐式（无显式 tip 字段）
- Commit.branchId `onDelete: Restrict` → 有 Commit 的分支**数据层已禁止删除**（无删除路径，同 §3.4 不可抹除语义）
- PullRequest.sourceBranchId/targetBranchId（迁移 12，P1C-1）→ 被 PR 引用的分支删除会触发 Restrict

## 架构决策（拟）

### 可见性继承：零存储

- Branch **不存** visibility 字段。读/写权限一律走 RO 判定：
  - 读（list/get）：`canAccessRo`（public 公众可读；private/invite_only 成员或 grant 可读）→ 分支不泄露，§4.2 继承语义自然成立
  - 写（create/delete/switch）：`requireMembership`（仅空间成员可操作，§17 越权 → 404）
- 分支自身无法「扩大可见范围」——因为分支没有自己的可见性。扩大仅发生在 RO 层（P1B-7 已实现审批）。任务描述「扩大可见范围需审批」对分支为**不适用项**，在 plan 中登记说明。

### 删除保护（三规则）

1. `isDefault` 分支禁删（主分支常驻）
2. 有 Commit 的分支禁删（§3.4 不可抹除 + Commit.branchId Restrict 数据层兜底）
3. 被 PR 引用（source 或 target）禁删（Restrict 兜底）

### 分支切换语义

- 无显式 tip 指针 → 「当前分支」= 最后一次 `commit.branchId` 落点的分支（P1B-4 模型）
- 定义 `BranchDetail.tipCommit`：该分支最近一次 Commit（按 createdAt 排序）
- 切换 = 前端选择分支后所有 commit 落该分支（服务端无状态；`switchBranch` 仅为 RO 层记录当前分支首选项的**占位**——MVP 阶段切换即「下次 commit 传 branchId」，无额外服务端状态。此点入 plan 说明，避免过度设计）

### API 形态

- 现有 RO 子资源均为嵌套路径（`/research-objects/:id/commits`），/branches 遵循同一嵌套：
  - `GET /research-objects/:id/branches`（列表，含 tipCommit + commitCount）
  - `POST /research-objects/:id/branches`（创建，可选 headCommitId 指定起点）
  - `DELETE /research-objects/:id/branches/:branchId`（删除）
  - `POST /research-objects/:id/branches/:branchId/switch`（切换占位，返回目标分支详情）
- 幂等键：branch name 已有 `@@unique([roId, name])` 天然幂等（重发同 key → 唯一约束报错而非重复建）；任务描述「幂等键+乐观锁」在分支场景的核心抓手是**唯一约束**（重复创建被拒）。记录说明。
- 乐观锁：分支创建/删除无 RO.version 推进，不引入；删除前重新查状态（CAS 语义）

### headCommitId（Fork 分支前置）

- 验收步骤 11：另一用户 Fork → 创建 Branch。Fork 产物 RO 自带来源版本 commit（P1C-5），分支需能指向**任意现有 commit** 作为起点
- 创建分支时可选 `headCommitId`：校验该 commit 属于同一 RO（跨 RO 起点 → 拒绝），作为分支首个 commit 引用（写入 `parentCommitId` 链锚点）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 分支**删除**保护范围？ | 三规则全开：default 禁删 + 有 Commit 禁删 + 被 PR 引用禁删（均抛 403，配合数据层 Restrict 双保险） | 仅 default 禁删，其余交给数据层 Restrict（报 500 而非 403，体验差） |
| Q2 | 分支**可见性存储**？ | 零存储：分支永远不存 visibility，读走 canAccessRo、写走 requireMembership（§2.3 决策 3 最纯粹实现） | 冗余存储 branch.visibility 同步 RO（同步成本 + 可漂移，无收益） |
| Q3 | `headCommitId`（分支起点）是否本期支持？ | 支持：创建分支可选 headCommitId，校验同 RO，写 parentCommitId 锚点（Fork 分支验收前置） | 本期不支持，P1C-5 Fork 时再补（验收步骤 11 前置被推迟） |
| Q4 | API 路径形态？ | 嵌套 `/research-objects/:id/branches`（与 /commits 一致，RO 即 Repository 语义 §8） | 独立 `/branches` 模块（Spec §16 列表但需二次归属校验，多一跳） |
| Q5 | 分支**切换**（switch）的服务端语义？ | 无状态占位：MVP 分支即「commit.branchId」，switch 仅返回目标分支详情 + 记录审计（无 RO 字段写入），前端切换落点 | 加 `RO.currentBranchId` 字段（过度设计，需迁移 13） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - 可见性继承：canAccessRo(public) 非成员可读列表；canAccessRo(private) 非成员 denied（分支无自有 visibility）
  - 越权创建拒绝：非空间成员创建分支 → WorkspaceError 404
  - 删除保护：default 禁删、有 Commit 禁删、被 PR 引用禁删
  - headCommitId 跨 RO 拒绝
  - 名称校验（非法字符/超长）
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - 分支列表含 tipCommit：createBranch → list → commit 到该分支 → list 的 tip 指向新 commit
  - 分支指向 Commit 一致性：两分支各 commit，各自 tip 独立、parent 链正确
  - 删除保护：有 Commit 分支 DELETE → 403
  - 越权：另一用户（非成员）createBranch → 404
  - headCommitId 锚点：指定起点 commit → 新分支首个 commit.parentCommitId = 起点
- 既有 62/62 不回退

---

## 涉及模块

- `packages/domain/src/branch/branches.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/branches.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- 无迁移（Branch 模型 P1B-4 已够）

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 越权/继承/幂等说明）
3. 代码 + 单测 + 集成测试
4. 本地门禁（build/typecheck/lint/audit）
5. 云上集成测试全绿
6. task-master 4.2 done + 文档同步（progress/project_index/handoff）
