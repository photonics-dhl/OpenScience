# Handoff — 2026-08-04 P1B-4 Commit/Manifest 版本引擎完成

- Current goal: Phase 1B SDF 与版本。P1B-4 已闭环（迁移 9 + /commits /versions API，云上集成 41/41），下一任务 P1B-5 大文件分片上传（task-master 3.5）。
- Done:
  - 五决策（design gate）：ChangeSet 存单 op（RFC 6902 apply 链）、初始 core = SdfDocument.coreJson 基准、Version 仅 draft（P1B-7 发布状态机）、Branch 表建 default main（Phase 1C 扩展）、artifact 传完整集合 diff 自动算增删改
  - 迁移 9：branches/commits/changesets/versions（version_no + VersionStatus enum）/version_manifests/manifest_entries 六表 + rollback；Prisma 六 model + ResearchObject/User 关系
  - versioning 包：patch.ts（fast-json-patch@3.1.1 CJS，applySdfPatch/diffSdfCore/validatePatch）+ manifest.ts（rebuildCore/buildSnapshot）；补 main/types + test script + vitest 配置
  - domain `commit/`：errors（CONCURRENT_UPDATE/VERSION_PUBLISHED/DUPLICATE_IDEMPOTENCY_KEY）+ commits.ts（createCommit 乐观锁+幂等+公开不可变+Manifest 生成 / getVersion / rebuildVersion 校验 blob sha256）
  - api：POST /research-objects/:id/commits（Idempotency-Key 头）+ GET /versions/:id + GET /versions/:id/rebuild；error-map CommitError（VERSION_PUBLISHED=409）
  - 测试：versioning 13 + domain commit 9 + api 集成 6 = 28 新增；本地门禁全绿；**云上集成 41/41**（新增 P1B-4 6 + 既有 35）；迁移 9 applied + rollback 演练
  - task-master 3.4 done + details
- Constraints: 同前。新增：versioning/storage 包需 main/types（P1B-4 建 versioning 直接补上）；fake Prisma 需同步新增 model（researchObject.update 缺）。
- Open risks / parked: Version 发布状态机（P1B-7）；大文件分片 + 幂等键实装（P1B-5）；病毒扫描（P1B-8）；逻辑检查点（P1B-6）；完整分支模型（Phase 1C）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-5 多类型确定性 Diff 服务（task-master 3.5）：§7.3 九类 diff（文本/SDF 字段/结论/作者/引用/文件增删哈希/表格/代码/许可证可见性），§7.2.6 大二进制仅元数据 diff，输出结构化 Diff 结果供编辑器版本导航与 Phase 1D 公开页消费。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-4）→ `project_index.md` → task-master 任务 3.5 → `docs/specs|plans/2026-08-04-p1b-4-*`
