# P1B-10 SDF 标准导出包生成与校验 Plan

> Phase 1B SDF 与版本 — P1B-10  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-10-sdf-export-design.md](../specs/2026-08-04-p1b-10-sdf-export-design.md)  
> 对应 task-master: 3.10

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| 下载格式 | zip（archiver） |
| 附件归位 | 按扩展名（figures/code/artifacts） |
| zip 依赖 | archiver（流式） |
| 导出鉴权 | 成员可导出 + public 公开 |
| paper.md | 六字段 Markdown 汇编 |

---

## 1. 任务拆解（TDD）

### Task 1：domain export 包
- `packages/domain/src/export/packager.ts`：`buildExportPackage`（可见性 + 读 Manifest + 重建目录树 + manifest.json + 附件归位）
- `packages/domain/src/export/validate.ts`：`validateExportPackage`（脱库：validateManifest + validateSdfCore + contentHash 重算）
- `packages/domain/src/export/manifest.ts`：manifest 序列化（§5.3 字段 + contentHash = computeContentSha256）
- domain 依赖：sdf-schema（validateManifest/validateSdfCore）、identity（computeContentSha256）、storage（getBlob）
- 单测：`packages/domain/test/export/`（目录树完整 + manifest 字段 + validate）
- 门禁：domain export 单测 8+ 全绿

### Task 2：zip 打包
- `pnpm --filter @openscience/api add archiver`（+ @types/archiver）
- `apps/api/src/routes/export.ts`：`GET /versions/:id/export`（archiver zip 流）
- app.ts 注册（并入 commits 路由）
- 门禁：build 全绿

### Task 3：API 集成测试
- `apps/api/test/export.integration.test.ts`：
  1. 建 RO → commit v1（改 SDF + 附件）→ export → 脱库解压纯文件校验
  2. validateManifest（P1B-1 ajv）通过
  3. validateSdfCore（P1B-1）通过
  4. contentHash 与线上 computeContentSha256 一致
  5. 附件内容 sha256 匹配
  6. 越权 404
- 门禁：集成测试 5+ 全绿

### Task 4：本地门禁收口
- build/typecheck/lint/audit/knip/dep/docs 全绿
- 全仓 test 无回归

### Task 5：云上集成测试
- cloud-sync → install + 全量 build
- test:integration 全绿（新增 P1B-10 + 既有 55 回归）

### Task 6：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.10 done + details

---

## 2. 验收清单

- [ ] domain export 单测 8+
- [ ] API 集成测试 5+（生成→脱库校验/哈希一致/附件匹配/越权）
- [ ] 本地门禁全绿
- [ ] 云上集成全绿
- [ ] task-master 3.10 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **archiver 类型**：@types/archiver 需另装
- **zip 流**：Fastify reply 流式响应（Content-Disposition）
- **脱库校验**：validate 不依赖 deps（纯文件）

### 3.2 依赖
- P1B-1：validateManifest/validateSdfCore（sdf-schema ajv）
- P1B-6：computeContentSha256（contentHash）
- P1B-4：Manifest entries（附件）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1（domain export） | 2.5h |
| Task 2（zip 打包） | 1h |
| Task 3（集成测试） | 1.5h |
| Task 4-6（门禁 + 云上 + 文档） | 2.5h |
| **总计** | **7.5h** |
