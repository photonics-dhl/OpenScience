# Handoff — 2026-07-28 P1A-3 本地完成，集成测试待阿里云

- Current goal: P1A-3（邀请码注册/邮箱验证/登录）代码与本地门禁完成，终审 fix wave 收口；剩余 P1A-2+P1A-3 集成测试等阿里云执行，随后 P1A-4 Workspace（2.4，先 design gate）。
- Done: 迁移 2 四表（users/invitations/email_verifications/mail_outbox + rollback.sql）；`packages/auth`（argon2id、guarded updateMany 原子核销、验证码 sha256/静默冷却/5 次锁、Redis session 7 天滑动、DevOutboxMailer、login dummy hash 计时垫）；`apps/api` Fastify 5 骨架 + `/auth` 六端点 + env 快速失败 + 生产 Mailer 守卫；`scripts/invite.mjs` CLI；单测 59/59、lint/typecheck/build/audit/docs:lint 全绿；Task 1-6 逐 task 评审 + 终审 + fix wave + re-review 全 ADDRESSED。
- Evidence/commands: `npx pnpm@9.15.0 build|typecheck|lint|test` 全绿（59/59）；`node scripts/invite.mjs` exit 64 + Usage；SDD ledger `.superpowers/sdd/2026-07-28-p1a-3-invitation-auth-plan/progress.md`。
- Constraints: 不读/打印 `.env`；无 git commit/push（逐次用户批准；P1A-3 全部产物当前未提交，待用户批准检查点提交）；pnpm 一律 `npx pnpm@9.15.0`；本机不做 Docker（用户 2026-07-28 指示），集成测试在阿里云执行；主模型 MiniMax-M3、回退配置化；task-master 2.2/2.3 须云上集成测试通过后才可置 done。
- Open risks: P1A-3 全部产物未提交（工作树唯一副本，尽快批准提交）；云上 `test:integration` 前需先 `node packages/database/dist/migrate-cli.js deploy` 且 `DATABASE_URL` 指向云上栈；guarded updateMany 真实竞态分支建议云上补并发用例；parked 项见 progress.md 终审条目；`.worktrees/p1a-1` 残留未清。
- Next action: ① 用户批准后提交 P1A-3；②（云上）migrate deploy + 三包 `test:integration`（database/storage/api），全绿后置 2.2/2.3 done；③（本地）P1A-4 Workspace design gate：brainstorming → writing-plans。
- Read first: `AGENTS.md` → `.agents/skills/docs-sync/SKILL.md` → `docs/OpenScience_Kimi_Development_Spec.md` → ADR-001/002 → `docs/specs/2026-07-28-p1a-3-invitation-auth-design.md` + `docs/plans/2026-07-28-p1a-3-invitation-auth-plan.md` → `docs/progress.md` → `project_index.md` → SDD ledger（p1a-2 + p1a-3 两份）→ task-master 任务 2 → Memory 实体 `XGS-*`。
