# Handoff — 2026-08-04 P1B-6 标识层与时间戳服务完成

- Current goal: Phase 1B SDF 与版本。P1B-6 已闭环（packages/identity + 迁移 10 + /research 公开 URL，云上集成 50/50），下一任务 P1B-7 Version 发布状态机（task-master 3.7）。
- Done:
  - 五决策（design gate）：UUID v7 手写（RFC 9562）、publicId 发布时分配（P1B-7 触发）、公开 ID 年 + 全局 seq、/research/* 仅 public 匿名、contentSha256 排序聚合
  - packages/identity（新包）：uuid7（48bit 时间戳 + version/variant 位）+ public-id（generatePublicId OSR-YYYY-NNNNNN / parsePublicId / versionPublicId -vN / researchUrl / parseVersionId）
  - 迁移 10：research_objects.public_id + versions.public_version_id（unique）+ identifiers/publications 表（legal_disclaimer 预留 §6.2）+ rollback；Prisma 三处 + Identifier/Publication model
  - config：publicIdPrefix env（PUBLIC_ID_PREFIX 缺省 OSR，§24 配置项禁写死）
  - domain：assignPublicId（发布时分配 + updateMany where publicId=null 并发安全 + ID 永不复用 §6.1）+ computeContentSha256（Manifest 排序聚合）
  - api：GET /research/:publicId + /research/:publicId/v/:versionNo（匿名 public 可见，private 404，不泄露存在性）
  - 测试：identity 11 + domain identity 6 + api 集成 5 = 22 新增；本地门禁全绿；**云上集成 50/50**（新增 P1B-6 5 + 既有 45）；迁移 10 applied
  - task-master 3.6 done + details
- Constraints: 同前。新增：packages/identity 无运行时依赖（纯 node:crypto）。
- Open risks / parked: Version 发布状态机（P1B-7）；病毒扫描（P1B-8）；逻辑检查点（P1B-后续）；大文件分片（P1B-后续）；状态说明页 UI（Phase 1D，§6.1 撤回/删除后 ID 指向）；免责声明展示（Phase 1D）；DOI（Phase 2）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-7 Version 发布状态机（task-master 3.7）：draft→published（§4.1、§2.3.4），发布动作触发 assignPublicId + Publication 记录。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-6）→ `project_index.md` → task-master 任务 3.7 → `docs/specs|plans/2026-08-04-p1b-6-*`
