# Handoff — 2026-08-01 P1A-5 RBAC 云上收口完成，平台底座剩 2.6–2.9

- Current goal: Phase 1A 平台底座。P1A-5 RBAC 已全链路闭环（本地门禁 + 云上集成测试 11/11），下一任务 P1A-6 审计日志（task-master 2.6，先 design gate）。
- Done:
  - RBAC 双层共源：`packages/domain/src/workspace/permissions.ts` 动作×角色矩阵（9 动作，唯一事实源）+ domain 7 处 `requireAction` 纵深 + `apps/api/src/routes/workspace-guard.ts` preHandler 守卫挂 9 条路由（9 挂 6 不挂，C/D 类端点不挂）
  - 迁移 4 `20260801010000_user_platform_role`：User.platformRole（user/moderator/platform_admin，默认 user，无消费方，纯预留）云上已 applied
  - 测试：本机单测 116/116（含矩阵 54 条笛卡尔积断言 + 守卫 5 用例）；云上 `test:integration` 11/11（database 2 + storage 1 + api 8）
  - 终审 whole-branch review clean（Ready to merge: Yes）；3 项 deferred minor 非阻塞
  - task-master 2.5 done（details 已同步修订：判定落点 auth→domain，用户确认的偏离）
  - 提交：`d8365e9`（迁移 4）`5e03493`（矩阵）`ace9d04`（domain 收敛）`f2dab74`（守卫）`f4caf06`（集成用例+knip 修复+文档）`f4ff738`（progress 修正），已全部 push origin/main
- Constraints: 不读/打印 `.env`；git mutation 逐次用户批准；pnpm 一律 `npx pnpm@9.15.0`；本机不做 Docker；云上写操作前用户确认；**云上跑集成测试前必须全量 build**（见下「坑」）；主模型 MiniMax-M3、回退配置化。
- Open risks / parked:
  - **坑（已记入 AGENTS.md）**：云上只 build database 会让其他包 dist 过期——vitest 跑 TS 源但跨包 import 解析到目标包 dist；本次首轮集成 3 用例 500 即 `can` undefined 所致
  - 云上 `/tmp/repro-invite.mjs` 调试脚本待清理（rm 需 --confirm + 用户批准）
  - 终审 deferred minor ×3：① WorkspaceRole 枚举穷尽性校验（1B 扩展角色前补）② `workspace-guard.test.ts:6` unused eslint-disable（1 warning，可顺手删）③ spec §3 守卫示例缺 `deps` 参数（spec 迭代时修）
  - 遗留：MiniMax 代理 key 在 git 历史（建议轮换，用户已知悉）；服务器实例密码建议轮换；`.worktrees/p1a-1` 残留；P1A-3 终审 parked 项；CI/CD 归 2.9
  - 2.6 挂接点已就位：domain 各写操作与守卫拒绝点均有 `// audit(2.6): ...` 注释
- Next action: P1A-6 审计日志（task-master 2.6）：brainstorming → design spec（用户逐节确认）→ writing-plans。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md`（2026-08-01 两条目）→ `project_index.md` → task-master 任务 2 → spec/plan（`docs/specs|plans/2026-08-01-p1a-5-rbac-*`）。
