# P1C-7 作者组与 CRediT 贡献记录 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.7（作者名单/顺序/通讯作者 + 事实贡献者 CRediT）
- 依据：Spec §3.4、§2.3 决策 2、§8 概念表
- 现状：Author/Contribution 实体迁移 12 已建——本任务**无迁移**

---

## 需求基线

1. 作者组确认作者名单、顺序和通讯作者（§3.4）
2. 系统独立记录全部事实贡献者及 CRediT 角色（§2.3 决策 2，按时间追加）
3. 创建者不自动获得永久第一作者或通讯作者地位（§3.4）
4. 系统不可依据字数、Commit 数或 AI 估计自动决定署名（§3.4，不做任何自动排序）
5. 所有贡献记录不可被作者名单变化抹除（§3.4，数据层 Restrict 无级联删除）
6. 仅作者组可变更作者名单（task 4.7）
7. Merge PR 时若新增作者或改变作者顺序，必须触发高风险审批（P1C-8 查询接口）

## 现状约束

- Author：`@@unique([roId, userId])` + sortOrder + isCorresponding；RO Cascade、User Restrict
- Contribution：creditRole(CreditRole 枚举) + createdAt；**RO/User 均 Restrict**（不可抹除，P1C-1 已测）
- CreditRole 12 项（conceptualization/methodology/software/validation/data_curation/visualization/writing/supervision/investigation/resources/project_administration/funding_acquisition）
- 无自动署名逻辑（§3.4 禁止）——实现里不做排序/推荐

## 架构决策（拟）

### 作者组权限（Q1）

- **作者组 = 当前 Author 表中的用户 ∪ RO 创建者**
- 空作者名单 → 创建者独属作者组（可先建名单）
- 变更（增删/排序/通讯标记）→ 仅作者组成员可操作（requireMembership 前置 + 作者组校验）
- 非作者组成员（空间成员但非作者）→ FORBIDDEN 403

### 作者名单全量替换（Q2）

- `setAuthors(deps, {roId, userId, authors: [{userId, isCorresponding}]})`：全量替换（顺序 = 数组序）
- 替换事务：删旧 Author（Cascade 无——Author 是独立行，deleteMany where roId）+ 建新 + 审计
- **Corresponding 至多一人**（§3.4 通讯作者语义）
- 作者名单清空 → 允许（回到无署名，创建者保留作者组）

### Contribution 只追加（Q3）

- `addContribution(deps, {roId, userId, creditRole})`：append-only（同 user+role 幂等？——不，事实贡献可多次；**不幂等，按时间追加**，但去重同 user+role 已存在 → 幂等返回（防误重复））
- 无删除 API（§3.4 不可抹除，数据层 Restrict 兜底）
- 谁可添加贡献？——空间成员（factual record，不限于作者组；作者组也可）

### Merge 高风险审批查询（Q4）

- `getAuthorChangeInfo(deps, {roId})`：返回 `{authors: [...], contributorIds: [...]}` 供 P1C-8 对比
- P1C-8 merge 时：新 PR newContributors（§8.2）∪ 当前 authors vs 既有 → 若新增作者或改序 → 高风险标志
- 本期提供数据查询；审批触发在 P1C-8

### 可见性（Q5，§4.2）

- 读：canAccessRo（public 匿名可读作者/贡献列表）
- 写：requireMembership + 作者组（作者名单变更）

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 作者组定义？ | 当前 Author 表用户 ∪ RO 创建者；空名单时创建者独属 | 仅 workspace owner/maintainer（作者可能非管理员，无法管理署名） |
| Q2 | 作者名单变更粒度？ | 全量替换（顺序 = 数组序）+ 通讯至多一人 | 增量增删（复杂，易乱序） |
| Q3 | Contribution 幂等？ | 同 user+role 已存在 → 幂等返回（防误重复）；append-only 不可删 | 每次追加不幂等（同贡献多条，污染统计） |
| Q4 | 贡献添加权限？ | 空间成员（factual record，非仅作者组） | 仅作者组（漏记外部贡献者） |
| Q5 | Merge 审批查询范围？ | getAuthorChangeInfo 返回 authors + contributorIds（P1C-8 对比用） | 本期不做（P1C-8 无法判断新增作者） |

---

## 测试策略

- **单测**（domain，mock prisma）：
  - 作者组权限：非作者组成员变更 → 403；创建者空名单可建
  - 全量替换：顺序正确、通讯至多一人（超 1 → 拒绝）
  - Contribution append-only：不可删（无 API）、同 user+role 幂等
  - 无自动署名：无排序逻辑（实现即证，无字数/commit 计数）
- **集成测试**（云上，追加 collab.integration.test.ts）：
  - 作者全流程：创建者建名单 → 成员排序/通讯 → 非作者组变更 403
  - 贡献追加：多用户 CRediT → 列表含全部（不可抹除）
  - public 匿名读作者
- 既有 77/77 不回退

---

## 涉及模块

- `packages/domain/src/authorship/authors.ts`（新）+ `errors.ts`（新）
- `apps/api/src/routes/authors.ts`（新）+ `app.ts` 注册
- `packages/domain/src/index.ts` 导出
- `apps/api/test/collab.integration.test.ts`（追加）
- `apps/api/test/helpers/fakes.ts`（author/contribution 假实现）
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档（TDD 步骤 + 作者组定义 + 权限说明）
3. 代码 + 单测 + 集成测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 4.7 done + 文档同步
