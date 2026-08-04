# P1C-1 协作域数据模型与数据库迁移 Design

> Phase 1C GitHub 式科研协作 — P1C-1  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §2.3、§3.4、§6.3、§8.1、§8.2、§15、§16、§17  
> 对应 task-master: 4.1（协作域数据模型 + 迁移）

---

## 1. 目标与范围

### 1.1 目标
落地协作域核心实体（§15 MUST）：Branch、ForkRelation、Issue、PullRequest、Review、Comment、Author、Authorship、Contribution、LicenseAssignment、Notification，为后续协作功能提供数据底座。

### 1.2 范围

**In Scope（P1C-1）**：
- 迁移 12：11 实体表 + 枚举 + 外键（挂接 ResearchObject/Commit/Version/User/Workspace）+ rollback
- PR §8.2 声明字段
- Contribution CRediT 枚举（§3.4）
- LicenseAssignment 三类许可（§6.3）
- 单测（迁移 up/down + 枚举/必填）+ 集成（外键一致性）

**Out of Scope（P1C-2+）**：
- 分支/Issue/PR/Fork 交互逻辑（后续子任务）
- §19 功能（点赞/收藏/关注字段不建）
- Notification 投递逻辑（P1C-9）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §15 | 11 实体 | 迁移 12 建表 |
| §8.2 | PR 声明字段（SDF 字段/文件/方法数据结论/贡献者 CRediT/许可/利益冲突/检查/发布） | PullRequest 表声明字段 |
| §3.4 | CRediT 分类枚举 | CreditRole enum |
| §6.3 | 三类许可（文字/代码/数据） | LicenseAssignment 表 |
| §2.3 | 分支继承可见性 | Branch 挂 RO（P1B-4 已建） |
| §17 | 全部写操作审计 | 审计复用 AuditLog |

---

## 3. 数据模型（迁移 12）

```prisma
// 已有：Branch（P1B-4，default main）

// Fork 来源关系（§8.1：永久保留来源对象/版本/哈希，不可移除）
model ForkRelation {
  id            String   @id @default(uuid()) @db.Uuid
  forkedRoId    String   @map("forked_ro_id") @db.Uuid   // 新 RO
  sourceRoId    String   @map("source_ro_id") @db.Uuid   // 来源 RO
  sourceVersionId String @map("source_version_id") @db.Uuid
  sourceContentHash String @map("source_content_hash")   // §8.1 内容哈希
  createdAt     DateTime @default(now()) @map("created_at")

  forkedRo      ResearchObject @relation("ForkResult", ...)
  sourceRo      ResearchObject @relation("ForkSource", ...)

  @@unique([forkedRoId])  // 一 RO 至多一个来源（防二次 Fork 覆盖）
  @@map("fork_relations")
}

// Issue（§8 科学问题/方法质疑/复现失败/错误报告/改进建议）
model Issue {
  id            String   @id @default(uuid()) @db.Uuid
  researchObjectId String @map("research_object_id") @db.Uuid
  title         String
  body          String   @default("")
  kind          IssueKind @default(question)  // 五类：question/method_repro/failure/bug_report/suggestion
  status        String   @default("open")     // open/closed
  authorId      String   @map("author_id") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  researchObject ResearchObject @relation(...)
  author        User            @relation(...)
  comments      Comment[]
  @@map("issues")
}

// Comment（挂 Issue/PR/Review，§15 一处实现多处复用）
model Comment {
  id        String   @id @default(uuid()) @db.Uuid
  issueId   String?  @map("issue_id") @db.Uuid
  prId      String?  @map("pr_id") @db.Uuid
  reviewId  String?  @map("review_id") @db.Uuid
  authorId  String   @map("author_id") @db.Uuid
  body      String
  createdAt DateTime @default(now()) @map("created_at")

  author User @relation(...)
  @@map("comments")
}

// PullRequest（§8.2 声明字段强制）
model PullRequest {
  id               String   @id @default(uuid()) @db.Uuid
  researchObjectId String   @map("research_object_id") @db.Uuid
  sourceBranchId   String   @map("source_branch_id") @db.Uuid
  targetBranchId   String   @map("target_branch_id") @db.Uuid
  title            String
  body             String   @default("")
  // §8.2 声明字段
  changedSdfFields   Json    @map("changed_sdf_fields")     // 变更的 SDF 字段
  changedFiles       Json    @map("changed_files")         // 变更文件列表
  changesMethod      Boolean @map("changes_method")
  changesData        Boolean @map("changes_data")
  changesConclusion  Boolean @map("changes_conclusion")
  newContributors    Json    @map("new_contributors")      // [{ userId, creditRole[] }]
  dataLicense        String  @map("data_license")
  codeLicense        String  @map("code_license")
  conflictOfInterest String  @map("conflict_of_interest")  // 利益冲突声明
  autoChecks         Json    @default("{}") @map("auto_checks") // 结构化占位（真实检查 P1D）
  requestsRelease    Boolean @map("requests_release")      // 是否要求发布新版本
  status             String  @default("open")              // open/merged/rejected
  authorId           String  @map("author_id") @db.Uuid
  createdAt          DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation(...)
  sourceBranch   Branch         @relation("PRSourceBranch", ...)
  targetBranch   Branch         @relation("PRTargetBranch", ...)
  author         User           @relation(...)
  reviews        Review[]
  comments       Comment[]
  @@map("pull_requests")
}

// Review（§8.2 逐项意见 + 结论）
model Review {
  id        String   @id @default(uuid()) @db.Uuid
  prId      String   @map("pr_id") @db.Uuid
  reviewerId String  @map("reviewer_id") @db.Uuid
  verdict   ReviewVerdict // approve/request_changes/comment
  body      String
  // 逐项意见（按 SDF 字段/文件）
  items     Json     @default("[]")  // [{ path, kind, comment }]
  createdAt DateTime @default(now()) @map("created_at")

  pr       PullRequest @relation(...)
  reviewer User        @relation(...)
  @@map("reviews")
}

// Author/Authorship（§3.4 作者组）
model Author {
  id              String   @id @default(uuid()) @db.Uuid
  researchObjectId String  @map("research_object_id") @db.Uuid
  userId          String   @map("user_id") @db.Uuid
  sortOrder       Int      @map("sort_order")   // 作者顺序（作者组确认）
  isCorresponding Boolean  @default(false) @map("is_corresponding")
  createdAt       DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation(...)
  user           User           @relation(...)
  @@unique([researchObjectId, userId])
  @@map("authors")
}

// Contribution（§3.4 CRediT，不可抹除）
model Contribution {
  id              String     @id @default(uuid()) @db.Uuid
  researchObjectId String    @map("research_object_id") @db.Uuid
  userId          String     @map("user_id") @db.Uuid
  creditRole      CreditRole @map("credit_role")
  createdAt       DateTime   @default(now()) @map("created_at")  // 按时间追加

  researchObject ResearchObject @relation(...)
  user           User           @relation(...)
  @@map("contributions")
}

// LicenseAssignment（§6.3 三类许可）
model LicenseAssignment {
  id              String   @id @default(uuid()) @db.Uuid
  researchObjectId String  @map("research_object_id") @db.Uuid
  versionId       String?  @map("version_id") @db.Uuid   // null = RO 级，非空 = 版本级
  licenseType     String   @map("license_type")           // text/code/data
  licenseId       String   @map("license_id")             // CC-BY-4.0/MIT/CC0 等（§24 配置，标准标识）
  createdAt       DateTime @default(now()) @map("created_at")

  researchObject ResearchObject @relation(...)
  version        Version?       @relation(...)
  @@unique([researchObjectId, versionId, licenseType])
  @@map("license_assignments")
}

// Notification（P1C-9 投递，实体先建）
model Notification {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  type      String   // pull_request.opened / merged / review.requested / issue.updated
  payload   Json
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(...)
  @@index([userId, read])
  @@map("notifications")
}
```

### 枚举

```prisma
enum IssueKind { question method_repro failure bug_report suggestion }
enum ReviewVerdict { approve request_changes comment }
enum CreditRole { conceptualization methodology software validation data_curation visualization writing supervision investigation resources project_administration funding_acquisition }
```

---

## 4. 设计决策

1. **PR 声明字段内联**（§8.2）：changedSdfFields/changedFiles/newContributors/autoChecks 用 Json，标量布尔用 Boolean——声明强制校验在 P1C-6 提交时做
2. **Contribution 只追加**（§3.4 MUST 不可抹除）：无 update/delete 外键路径（onDelete: Restrict）
3. **LicenseAssignment 版本级可空**（§6.3 不可追溯覆盖）：公开版本只读，新记录仅对后续版本
4. **ForkRelation 唯一**（§8.1 不可移除）：一 RO 至多一个来源，无删除路径
5. **Comment 多态**（§15 一处实现）：issueId/prId/reviewId 三可空外键
6. **Notification 先建**（P1C-9 投递）

---

## 5. 测试策略

### 5.1 单元测试（迁移 up/down + 枚举/必填）
- 迁移 12 applied + rollback 往返
- 枚举完整（CreditRole 12 类、IssueKind 5、ReviewVerdict 3）
- PR 必填声明字段约束

### 5.2 集成测试（外键一致性）
- Contribution → RO/User 外键
- PR → Branch/RO 外键
- ForkRelation 唯一 + 无删除路径

---

## 6. Open Questions（Design Gate 确认）

### 6.1 PR 声明字段存储
- **决策（2026-08-04）**：方案 A — 内联字段（Json 数组 + Boolean 标量）。

### 6.2 Comment 多态方式
- **决策（2026-08-04）**：方案 A — 三可空外键（issueId/prId/reviewId）。

### 6.3 CreditRole 枚举粒度
- **决策（2026-08-04）**：方案 A — 14 项完整 CRediT。

### 6.4 License 标识存储
- **决策（2026-08-04）**：方案 A — 标准标识字符串（CC-BY-4.0/MIT/CC0，§24 文案配置位）。

### 6.5 Notification 关联
- **决策（2026-08-04）**：方案 A — payload Json 存链接信息（无强 FK）。

---

## 7. 债务登记

- **autoChecks 占位**（真实检查 P1D）
- **Notification 投递逻辑**（P1C-9）
- **许可文案配置位**（§24）
- **PR 声明强制校验**（P1C-6 提交时）

---

## 8. 验收条件

- [ ] 迁移 12 applied + rollback 往返
- [ ] Prisma 11 model + 枚举
- [ ] 单测（枚举完整 + 必填约束）
- [ ] 集成测试（外键一致性 + ForkRelation 唯一）
- [ ] 本地门禁全绿
- [ ] 云上集成测试全绿
- [ ] task-master 4.1 done
- [ ] 文档同步
