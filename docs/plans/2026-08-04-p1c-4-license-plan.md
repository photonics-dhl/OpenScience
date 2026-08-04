# P1C-4 三类许可选择与继承规则 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.4
- 依据：`docs/specs/2026-08-04-p1c-4-license-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 单 PUT /licenses 全量三类型 + GET 有效值 |
| Q2 | 版本级：未公开 upsert 允许，已公开拒绝；P1D-8 发布事务 RO 快照落版本级 |
| Q3 | 已公开不可变：domain 业务层查 version.status |
| Q4 | 继承校验全兼容矩阵（可加严，拒绝放宽/不可推断） |
| Q5 | LICENSE_CATALOG id+name；法律文案 config 占位 §24 |

## 目录（§6.3）

```text
text: CC-BY-4.0 / CC-BY-NC-4.0 / ALL-RIGHTS-RESERVED
code: MIT / Apache-2.0 / GPL-3.0 / PROPRIETARY
data: CC0-1.0 / CC-BY-4.0 / CUSTOM / NO-DOWNLOAD
```

## 继承兼容矩阵（Q4）

| type | source | 允许 target |
|---|---|---|
| text | ALL-RIGHTS-RESERVED | 仅 ALL-RIGHTS-RESERVED |
| text | CC-BY-NC-4.0 | CC-BY-NC-4.0 / ALL-RIGHTS-RESERVED |
| text | CC-BY-4.0 | 任意 text |
| code | PROPRIETARY | 仅 PROPRIETARY |
| code | GPL-3.0 | GPL-3.0 / PROPRIETARY |
| code | MIT / Apache-2.0 | 任意 code |
| data | NO-DOWNLOAD | 仅 NO-DOWNLOAD |
| data | CUSTOM | 仅 CUSTOM |
| data | CC-BY-4.0 | CC-BY-4.0 / CUSTOM / NO-DOWNLOAD |
| data | CC0-1.0 | 任意 data |

## TDD 步骤

1. **domain `license/catalog.ts`**：LICENSE_CATALOG + 类型枚举（text/code/data）+ 校验函数（assertValidLicense）
2. **domain `license/errors.ts`**：LicenseError + 错误码（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN/VALIDATION_ERROR/VERSION_PUBLISHED/INVALID_LICENSE_ID）
3. **domain `license/licenses.ts`**：
   - `setLicenses(deps, {researchObjectId, userId, licenses: {text, code, data}}, ctx)`：requireMembership + 全量 upsert RO 级 + 审计 license.upsert
   - `getEffectiveLicenses(deps, {researchObjectId, userId?, versionId?})`：canAccessRo + 版本级优先回退 RO 级（§5.3 结构）
   - `setVersionLicenses(deps, {researchObjectId, userId, versionId, licenses}, ctx)`：requireMembership + version.status published → VERSION_PUBLISHED；未公开 upsert 版本级
   - `validateLicenseInheritance(source, target)`：全矩阵校验（纯函数，无 DB）
4. **单测**（`packages/domain/test/license/licenses.test.ts`）：目录完整性 / upsert 幂等 / 已公开拒绝 / getEffective / 继承矩阵全 case
5. **domain index** 导出
6. **API `apps/api/src/routes/licenses.ts`**：
   - GET /research-objects/:id/licenses（有效值，匿名 public 可读）
   - PUT /research-objects/:id/licenses（三类型 RO 级）
   - GET /research-objects/:id/licenses/:versionId（版本级有效值）
   - PUT /research-objects/:id/licenses/:versionId（版本级，未公开才可）
   - app.ts 注册
7. **fake prisma**：licenseAssignment upsert/findMany/findUnique 假实现
8. **集成测试**（collab.integration.test.ts 追加 P1C-4 describe）：
   - 选择 → GET 有效值 + 审计
   - 幂等重放
   - 已公开版本 PUT 版本级 → 400；draft 版本可设 + 覆盖 RO 级
9. **本地门禁**：build / typecheck / lint / audit / 单测
10. **云上集成测试**：cloud-sync + 跑 collab（预期 67+N 全绿）
11. **文档同步**：progress / project_index / handoff；task-master 4.4 done

## 验收对照

- §6.3：三类分别选择 + 变更不追溯已公开版本 ✅
- §5.3：manifest.licenses 结构对齐（text/code/data）✅
- §8.1：继承校验底座（P1C-5 Fork 调用）✅
- §24：文案不写死（config 占位）✅
- 既有 67/67 不回退

## 风险

- version.status 枚举值：P1B-7 有 published 等；draft 测试需 commit 后直接 DB 置 status
- upsert 幂等：@@unique([roId, versionId, licenseType]) 三元唯一——versionId null 时 Prisma upsert 复合键含 null 的处理（upsert where 用该复合键）
