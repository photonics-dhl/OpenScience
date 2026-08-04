# Handoff — 2026-08-04 P1D-8 发布事务完成

- Current goal: Phase 1D Hermes Agent 系统。P1D-8 已闭环（迁移 18 + /publications，云上集成 99/99），下一任务 P1D-9 公开页（task-master 5.9）。
- Done:
  - 五决策（design gate）：迁移 18 / 三重前置 / status+publish 端点 / parentVersion 链 / 幂等+不可变
  - 迁移 18：VersionStatus 枚举扩展（8 态 §4.1）+ Version.parentVersionId + rollback，云上已 deploy
  - domain publish/：transitionVersionStatus（§4.1 状态机表）+ publishVersion（AI 审核 passed + 许可齐全 + R3 确认 + assignPublicId 内联 + Publication UTC 时间戳/哈希/免责声明 + version.published 事件 + 审计只追加 + 幂等）
  - POST /versions/:id/status + POST /versions/:id/publish
  - 测试：domain 单测 7 新增（275 总全绿）+ 集成 2 新增；**云上集成 99/99**（新增 P1D-8 2 + 既有 97）
  - task-master 5.8 done
- Constraints: 同前。新增：**createCommit published 拒绝已移除**（§2.2-3 增量版本合法，已公开不可变由发布管线保证）；内容哈希含 coreJson+entries（空 entries 版本哈希需区分）。
- Open risks / parked: P1D-9 公开页；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1D-9（task-master 5.9）：公开 RO 页面——§4.3 十标签（Overview/Manuscript/Methods/Data & Code/Figures/Versions & Diff/Issues/PRs/Reviews & Discussions/Citations）+ 必显信息（标题/作者身份/机构/摘要/许可/unique ID/版本 ID/发布时间/哈希/引用格式/AI 审核摘要/免责声明）+ 公开页 SSR + public 可索引/private 拒绝 + /research/OSR-YYYY-NNNNNN/v/N 稳定 URL。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1D-8）→ `project_index.md` → task-master 任务 5.9 → `docs/specs|plans/2026-08-04-p1d-8-*` → §4.3 公共页面 + §6.1/§6.2 + apps/web 现有公开路由（P1B-6 /research）
