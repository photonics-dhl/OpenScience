# Handoff — 2026-08-04 P1C-4 三类许可完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-4 已闭环（/licenses API + 继承校验底座，云上集成 71/71），下一任务 P1C-5 Fork（task-master 4.5）。
- Done:
  - 五决策（design gate）：单 PUT 全量 / 版本级未公开可设 / domain 层不可变 / 全兼容矩阵 / 文案 config 占位
  - 零迁移（LicenseAssignment 实体 P1C-1 迁移 12 已建）
  - domain license/：catalog.ts（LICENSE_CATALOG 3+4+4 + 校验）+ licenses.ts（setLicenses/getEffectiveLicenses/setVersionLicenses/validateLicenseInheritance 全兼容矩阵）
  - /licenses API 5 端点（GET/PUT RO 级 + GET/PUT 版本级 + GET /licenses/catalog）
  - 测试：domain 单测 12 新增（196 总全绿）+ 集成 4 新增（collab 16/16）；**云上集成 71/71**（新增 P1C-4 4 + 既有 67）
  - task-master 4.4 done
- Constraints: 同前。新增：Prisma upsert 复合唯一键含 null 不接受（RO 级 versionId=null）→ findFirst + update/create 分支；继承矩阵可加严不可放宽（ARR/专有/NO-DOWNLOAD/CUSTOM 仅同值、GPL 不可放宽、CC-BY-NC 不可去 NC）。
- Open risks / parked: Fork（P1C-5，ForkRelation + validateLicenseInheritance 调用）；PR（P1C-6）；作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-5 Fork（task-master 4.5）：§8.1 来源永久保留（ForkRelation 唯一 + Restrict）+ 继承许可校验（validateLicenseInheritance）+ 新 RO unique ID，fork API（§16）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-4）→ `project_index.md` → task-master 任务 4.5 → `docs/specs|plans/2026-08-04-p1c-4-*` → 迁移 12 的 fork_relations + §8.1
