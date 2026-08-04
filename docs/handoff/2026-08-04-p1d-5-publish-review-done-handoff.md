# Handoff — 2026-08-04 P1D-5 发布审核硬阻断完成

- Current goal: Phase 1D Hermes Agent 系统。P1D-5 已闭环（迁移 16 + 七类硬阻断，云上集成 94/94），下一任务 P1D-6 警告层（task-master 5.6）。
- Done:
  - 五决策（design gate）：迁移 16 / 恶意代码扩展名黑名单 / Notification 事件 / 成员触发 / POST+GET review
  - 迁移 16：ai_reviews（versionId @unique + status + hardBlocks/warnings Json）+ rollback，云上已 deploy
  - domain review/blocking.ts：四纯函数（字段完整/恶意代码/隐私泄露/违法内容）
  - domain review/publish-review.ts：runPublicationReview（七类 + AIReview upsert + ai_review.completed 事件 + 审计）+ getPublicationReview（§11.3 稳定记录）
  - /versions/:versionId/review API 2 端点
  - 测试：domain 单测 8 新增（261 总全绿）+ 集成 2 新增；**云上集成 94/94**（新增 P1D-5 2 + 既有 92）
  - task-master 5.5 done
- Constraints: 同前。新增：core 读版本 manifest coreJson（非 sdfDocument）；entries 空 = 纯文本版本合法；恶意代码判定占位（P1B-8 病毒扫描实装联动）。
- Open risks / parked: P1D-6~9 警告层/申诉/状态机/公开页；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1D-6（task-master 5.6）：发布审核警告层与结构化审核报告——§11.2 七类警告（方法逻辑/统计/图表/数据一致性/可复现性/引用/过度外推）+ 报告含证据位置与不确定性 + Research Reviewer 不裁定对错 + Citation Checker 不伪造来源 + 警告不阻断发布随版本存档 + 结构化存 AIReview.warnings。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1D-5）→ `project_index.md` → task-master 任务 5.6 → `docs/specs|plans/2026-08-04-p1d-5-*` → §11.2 警告层
