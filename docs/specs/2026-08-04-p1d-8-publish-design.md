# P1D-8 发布事务与状态机推进 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.8（发布事务 + 状态机 + 时间戳/ID/哈希）
- 依据：Spec §2.1-7、§4.1、§6.1、§6.2、§7、§15/§16、§17
- 现状：Version/VersionManifest/Publication/Identifier 迁移 6/9 已建；assignPublicId P1B-6；AI 审核 P1D-5；许可 P1C-4；R3 审批 P1D-4

---

## 需求基线

1. 发布流程：作者确认公开后生成平台时间戳（UTC 事务时间）+ RO unique ID + 版本 ID（§2.1-6）
2. 状态机 draft → under_review → approved → published（§4.1）+ rejected/withdrawn/restricted 补充
3. 已公开版本永久不可原地修改（§2.2-3）：任何修改须新版本或勘误
4. 前置条件：AI 审核通过（P1D-5）+ 许可已选且作者确认（P1C）+ 发布确认走 R3 审批（P1D-4）
5. 时间戳 = UTC 事务时间 + manifest + SHA-256 内容哈希 + 只追加审计（§6.2/§17）
6. 写 Version/VersionManifest/Publication/Identifier + version.published 事件（§15/§16）
7. 平台仅声明「记录平台接收时间和版本哈希」（§6.2 免责声明）
8. 发布 v2 复用同一管线，验证 parentVersion 链 + 新哈希 + manifest（§2.2-3/§7）

## 架构决策（拟）

### 状态机枚举扩展（Q1，迁移 18）

- VersionStatus 扩为：draft/under_review/approved/published/revised/withdrawn/rejected/restricted（§4.1 建议 + 补充）
- 迁移 18：ALTER TYPE VersionStatus ADD VALUE（PG 加枚举值，additive）
- 合法迁移表（domain 纯函数）：
  - draft → under_review / rejected
  - under_review → approved / rejected
  - approved → published / withdrawn
  - published → revised（新版本）/ withdrawn / restricted
  - 终态 rejected/withdrawn/restricted 不可前进

### 发布事务（Q2）

`publishVersion(deps, {versionId, userId, confirmPublish: {r3: boolean}}, ctx)`：

1. 前置校验：version 存在 + RO 成员（§17）+ 当前 status=draft 或 approved
2. **AI 审核通过**（P1D-5）：getPublicationReview → status=passed 必须（否则拒绝）
3. **许可已选**：getEffectiveLicenses 三类齐全（P1C-4）
4. **R3 审批**（P1D-4）：createApproval(level=3, 'version.publish') → confirmPublish.r3=true（显式确认）
5. 事务：
   - assignPublicId（§6.1 OSR-YYYY-NNNNNN + versionNo → publicVersionId，复用 P1B-6）
   - Version update status=published
   - Publication create（publicVersionId + contentSha256 + publishedAt=now() + legalDisclaimer §6.2 文案）
   - Identifier 已由 assignPublicId 写
   - 审计 publication.publish（只追加 §17）
6. version.published 事件（Notification）
7. 免责声明：legalDisclaimer 存 §6.2 固定文案

### 状态机推进 API（Q3）

- `POST /versions/:id/publish`：publishVersion（R3 确认）
- `POST /versions/:id/status`：状态推进（draft→under_review→approved 等，P1D-5 审核通过后 approved）
- 简化：publish 内部走 review check；under_review/approved 由 P1D-5 review 自动推进？——**推荐**：POST /versions/:id/review 已做硬阻断；本任务加 status 推进端点让作者显式走状态机

### 不可变（Q4）

- published 版本：createCommit 已拒绝（P1B-4 VERSION_PUBLISHED）
- 本任务补：publishVersion 幂等（同 versionId 已 published → 返回既有）
- parentVersion 链：v2 发布时 Version.parentVersionId 指向 v1（需迁移 18 加列？——**Version 无 parentVersionId**。加迁移 18 列）

### v2 发布（Q5）

- v2 = 新 versionNo（P1B-4 递增）+ parentVersionId=v1 + 新 manifest/hash
- publishVersion 复用：仅对未 published 版本发布

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 状态机枚举？ | 迁移 18：ALTER TYPE VersionStatus ADD VALUE（draft/under_review/approved/published/revised/withdrawn/rejected/restricted） | 保持现 4 值（§4.1 缺失） |
| Q2 | 发布事务前置？ | AI 审核 passed + 许可齐全 + R3 确认三重校验，任一缺 → 拒绝 | 仅 R3（漏 AI 审核/许可） |
| Q3 | 状态推进？ | POST /versions/:id/status（作者显式 draft→under_review→approved）+ POST /:id/publish（published） | publish 一步到位（跳过 under_review/approved） |
| Q4 | parentVersion 链？ | 迁移 18 加 Version.parentVersionId（v2→v1） | 无链（§2.2-3 增量版本语义缺失） |
| Q5 | 幂等 + 不可变？ | publishVersion 幂等（已 published → 返回既有）；published 禁 status 变更 | 重复发布（数据脏） |

---

## 测试策略

- **单测**（domain）：状态机合法/非法迁移、published 不可变、publish 前置（缺 AI 审核/许可 → 拒绝）
- **集成测试**（云上）：发布 v1 → publicId + versionId + UTC 时间戳 + 哈希 + 审计只追加；v2 发布 → parentVersionId=v1 + 新哈希
- 既有 97/97 不回退

---

## 涉及模块

- 迁移 18：VersionStatus 枚举扩展 + Version.parentVersionId 列
- `packages/domain/src/publish/publish.ts`（新）+ errors.ts
- `apps/api/src/routes/publications.ts`（新）+ app.ts 注册
- 无新依赖

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 迁移 + domain + API + 测试
4. 本地门禁
5. 云上集成测试全绿
6. task-master 5.8 done + 文档同步
