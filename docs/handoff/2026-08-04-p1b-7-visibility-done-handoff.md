# Handoff — 2026-08-04 P1B-7 RO 可见性模型与 API 权限强制完成

- Current goal: Phase 1B SDF 与版本。P1B-7 已闭环（迁移 11 + 三态可见性矩阵 + API 权限强制，云上集成 55/55），下一任务 P1B-8（task-master 3.8，需读清单）。
- Done:
  - 五决策（design gate）：invite_only 用 VisibilityGrant 表（指定账户）、扩大可见性立即阻断 + VisibilityRequest(pending)（§4.2 显式审批，审批流 Phase 1D）、public 可索引、/research/* 仅 public 匿名、变更幂等
  - 迁移 11：visibility_grants（ro+grantee 唯一）+ visibility_requests（from/to_visibility + status pending）+ rollback
  - domain visibility/：errors（REQUEST_PENDING）+ access（canAccessRo 三态矩阵 + requireRoAccess 越权 404）+ requests（requestVisibilityChange 缩小应用/扩大阻断/幂等 + grantVisibility）
  - api：GET /research-objects/:id 改 canAccessRo + POST /:id/visibility（扩大 202/缩小 200）+ POST /:id/visibility-grants；error-map VisibilityError
  - domain 读操作改造：getResearchObject/getSdfDocument 用 requireRoAccess（invite_only grant 可读）
  - 测试：domain visibility 10 + api 集成 5 = 15 新增；本地门禁全绿；**云上集成 55/55**（新增 P1B-7 5 + 既有 50）；迁移 11 applied
  - task-master 3.7 done + details
- Constraints: 同前。新增：读操作统一 requireRoAccess（可见性判定），写操作保持 requireMembership。
- Open risks / parked: 审批流 + R0–R4 分级（Phase 1D）；Branch/Issue/PR 继承可见性（Phase 1C）；病毒扫描（P1B-8）；Version 发布状态机（P1B-后续）；大文件分片（P1B-后续）；状态说明页 UI（Phase 1D）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-8（task-master 3.8）——用 `mcp__task-master-ai__get_task id=3.8` 读清单。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-7）→ `project_index.md` → task-master 任务 3.8 → `docs/specs|plans/2026-08-04-p1b-7-*`
