# Handoff — 2026-08-04 P1C-3 Issue 与评论完成

- Current goal: Phase 1C GitHub 式科研协作。P1C-3 已闭环（/issues API + 限流，云上集成 67/67），下一任务 P1C-4 许可选择（task-master 4.4）。
- Done:
  - 五决策（design gate）：作者或成员关 issue / 多态本期仅 issueId / 状态幂等 / 限流 2 行 / 评论仅创建+列表
  - 零迁移（Issue/Comment/IssueKind 模型 P1C-1 迁移 12 已建）
  - domain issue/（createIssue/listIssues/getIssue/updateIssueStatus/createComment + 三 FK 至多一个 + 归属同 RO CROSS_RO_COMMENT + 状态机 open/closed 幂等 + §4.2 读 canAccessRo/写 requireMembership）
  - /issues API 5 端点（嵌套）+ **rate-limit 中间件升级支持 `:param` 路径键（正则匹配）** + RATE_LIMIT_ROUTES 加 issues 20/60s + comments 30/60s
  - 测试：domain 单测 14 新增（184 总全绿）+ 集成 4 新增（collab 12/12）；**云上集成 67/67**（新增 P1C-3 4 + 既有 63）
  - task-master 4.3 done
- Constraints: 同前。新增：rate-limit 键支持 `:param` 段（正则编译）；private→public 属扩大被 P1B-7 审批阻断（202）——集成测试直接 DB 置 public 绕过审批验证继承。
- Open risks / parked: 许可选择（P1C-4）；Fork（P1C-5）；PR（P1C-6）；作者/CRediT（P1C-7）；Review/Merge（P1C-8）；通知（P1C-9）；协作前端（P1C-10）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）、病毒扫描（P1B-后续）、Version 发布状态机（P1B-后续）。
- Next action: P1C-4 许可选择（task-master 4.4）：§6.3 三类许可（文本/数据/代码）+ LicenseAssignment 实体（版本级可空），选择/更新许可并校验标准标识，/licenses API（§16）。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1C-3）→ `project_index.md` → task-master 任务 4.4 → `docs/specs|plans/2026-08-04-p1c-3-*` → 迁移 12 的 license_assignments + §6.3
