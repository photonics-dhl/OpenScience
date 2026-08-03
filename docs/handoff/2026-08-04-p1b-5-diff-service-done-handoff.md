# Handoff — 2026-08-04 P1B-5 多类型确定性 Diff 服务完成

- Current goal: Phase 1B SDF 与版本。P1B-5 已闭环（packages/diff 九类 + comparison API，云上集成 45/45），下一任务 P1B-6（task-master 3.6，需读清单）。
- Done:
  - 五决策（design gate）：不引 diff 库（自写 LCS，大文本 P1B-后续换 Myers/diff 库）、大二进制阈值 1MB（LARGE_BINARY_THRESHOLD）、CSV/TSV 行 diff + 摘要、作者/引用由 input 传入（Phase 1C 建表）、diff 端点成员可看
  - packages/diff（新包）：types（DiffType 九类/LineHunk/DiffChange/DiffResult）+ lines（LCS 行 diff）+ text-code/sdf（复用 versioning.diffSdfCore）/authors-citations/file（§7.2.6 大二进制 metadata_only）/table/license + computeDiff 聚合
  - domain：compareVersions（读两 Manifest + Blob size → computeDiff，不读对象存储内容 §7.2.6；跨 RO VALIDATION_ERROR；越权 404）
  - api：GET /versions/:from/comparison?to=:to（并入 commits 路由）
  - 测试：diff 22 + domain compareVersions 4 + api 集成 4 = 30 新增；本地门禁全绿；**云上集成 45/45**（新增 P1B-5 4 + 既有 41）
  - task-master 3.5 done + details
- Constraints: 同前。新增：packages/diff 依赖 @openscience/versioning（RFC 6902）；computeDiff 的 diffCode 占位（Phase 1D 接 Blob 内容）。
- Open risks / parked: Version 发布状态机（P1B-7）；病毒扫描（P1B-8）；逻辑检查点（P1B-6）；大文件分片（P1B-后续）；AI diff 摘要（Phase 1D）；作者/引用无数据表（Phase 1C）；行 diff 简单 LCS（大文本换库）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-6（task-master 3.6）——用 `mcp__task-master-ai__get_task id=3.6` 读清单；可能是逻辑检查点（§7.2.7）或下一步。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-5）→ `project_index.md` → task-master 任务 3.6 → `docs/specs|plans/2026-08-04-p1b-5-*`
