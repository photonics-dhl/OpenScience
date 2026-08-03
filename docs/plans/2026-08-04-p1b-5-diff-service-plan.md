# P1B-5 多类型确定性 Diff 服务 Plan

> Phase 1B SDF 与版本 — P1B-5  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-5-diff-service-design.md](../specs/2026-08-04-p1b-5-diff-service-design.md)  
> 对应 task-master: 3.5

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| diff 库 | 不引库，自写简单 LCS 行 diff |
| 大二进制阈值 | 1MB（LARGE_BINARY_THRESHOLD 常量） |
| 表格 diff | CSV/TSV 文本行级 diff + 摘要 |
| 作者/引用 | SDF 附加字段传入（Phase 1C 建表） |
| diff 鉴权 | 成员可看（同 getVersion） |

---

## 1. 任务拆解（TDD）

### Task 1：packages/diff 包骨架
- `packages/diff/package.json`（main/types + build/typecheck/test + @openscience/versioning 依赖）
- `packages/diff/vitest.config.ts` + `tsconfig.json`
- `packages/diff/src/types.ts`：DiffType/DiffChange/LineHunk/DiffResult
- 门禁：build 全绿

### Task 2：diff 纯函数（九类）
- `packages/diff/src/lines.ts`：简单 LCS 行 diff → LineHunk[]
- `packages/diff/src/text.ts`：diffLines（文本）
- `packages/diff/src/sdf.ts`：diffSdfFields（复用 versioning.diffSdfCore）
- `packages/diff/src/conclusion.ts`：results/limitations 变化摘要
- `packages/diff/src/authors.ts`：作者增删
- `packages/diff/src/citations.ts`：引用增删
- `packages/diff/src/file.ts`：文件增删 + 哈希 + 大二进制仅元数据（§7.2.6）
- `packages/diff/src/table.ts`：CSV 行 diff + 摘要
- `packages/diff/src/code.ts`：代码行 diff（复用 lines）
- `packages/diff/src/license.ts`：许可证 + 可见性
- `packages/diff/src/index.ts`：computeDiff 聚合
- 单测：`packages/diff/test/*.test.ts` 九类各 ≥2 用例
- 门禁：diff 单测 18+ 全绿

### Task 3：domain compareVersions
- `packages/domain/src/diff/comparisons.ts`：compareVersions（读两 Manifest + Blob size → computeDiff）
- `packages/domain/src/diff/errors.ts`：复用 CommitError（RESEARCH_OBJECT_NOT_FOUND/FORBIDDEN）
- domain 加 @openscience/diff 依赖
- 单测：`packages/domain/test/diff/comparisons.test.ts`（越权/跨 RO/结果正确）
- 门禁：domain diff 单测 4+ 全绿

### Task 4：API /versions/:from/comparison
- `apps/api/src/routes/diff.ts`：`GET /versions/:from/comparison?to=:to`
- `apps/api/src/app.ts`：注册（并入 storage 条件块）
- 门禁：build 全绿

### Task 5：API 集成测试
- `apps/api/test/diff.integration.test.ts`：
  1. v1→v2 全量 diff（改 SDF + 加文件）
  2. 大二进制仅元数据（上传 >1MB → metadata_only）
  3. 去重联合验证（未变 Blob 复用）
  4. 越权 404
- 门禁：集成测试 4 全绿

### Task 6：本地门禁收口
- build/typecheck/lint/audit/knip/dep/docs 全绿
- 全仓 test 无回归

### Task 7：云上集成测试
- cloud-sync → install + 全量 build
- test:integration 全绿（新增 P1B-5 + 既有 41 回归 = 45）

### Task 8：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.5 done + details

---

## 2. 验收清单

- [ ] packages/diff 单测 18+（九类各 2+）
- [ ] domain compareVersions 单测 4+
- [ ] API 集成测试 4（v1→v2 diff/大二进制元数据/去重/越权）
- [ ] 本地门禁全绿
- [ ] 云上集成 45/45
- [ ] task-master 3.5 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **LCS 复杂度**：O(n*m) 大文本慢（P1B-5 小文本；大文本 P1B-后续换库）
- **作者/引用无数据源**：API 传 SDF 附加字段（Phase 1C 前简配）
- **diff 端点依赖 versioning build**：domain→diff→versioning 链，build 顺序 pnpm 自动处理

### 3.2 依赖
- P1B-4：versioning.diffSdfCore（RFC 6902）+ Manifest 结构
- P1B-3：Blob/Artifact + ManifestEntry（blobSha256 冗余）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1-2（diff 包九类） | 3h |
| Task 3（domain compareVersions） | 1.5h |
| Task 4-5（API + 集成测试） | 1.5h |
| Task 6-8（门禁 + 云上 + 文档） | 2h |
| **总计** | **8h** |
