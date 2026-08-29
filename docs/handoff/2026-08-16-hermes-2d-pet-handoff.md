# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 用户已要求继续 Task 8，并在完成后尽快推进生产上线、服务器卫生和分支收口。Landing/Hermes 视觉仍冻结。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 7/12：Tasks 1–7 已生产部署；Task 8 已正式置 `in-progress`，代码仍未提交/未部署；Task 10 dependency-ready。
- 证据整理稿位于 `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`；当前主线恢复为 Task 8 生产验收。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / HEAD: `codex/hermes-wanko-live2d` / `2add415853570c4cd3cacbca13dfeb0f1e3825d4`，含未提交 Task 8 改动。
- Production application source / immutable release: `5e5ae36a08ae314d0c35ee2b976e306aec73d219`
- Rollback: `6cabe422a8459dfa358786c9f5aae84558949f6b`; core/search migrations `30/30` / `2/2`
- 本地 `main` 为 `b9616cb…`，不得用它推断生产；上述 production tuple 已在 2026-08-29 重新从 ECS 只读核验。

## Production truth

- Public/loopback `/__release` 均返回 `5e5ae36…`；release marker mtime 为 2026-08-29 19:03:27 +08:00；目标容器和数据服务 healthy。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Task 8 local work preserved

- 计划入口：`docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`；当前修改/新增文件以 `git status --short` 为准，禁止 reset、checkout 或覆盖。
- 已实现但未发布：可信 content-addressed SourceMap ref、Claim/Evidence CRUD 与 strict API、乐观锁/审计、locator resolver、发布 blockers、narrative snapshot/hash、public version immutability、external-rights fail closed 与 SourceMap redaction。
- 当前新鲜本地门禁：全仓 build/typecheck/lint/test 通过；Domain 52 files / 470 tests、API 14 / 78、Agent Worker 26 / 452 均通过，release contract 91 pass / 7 platform skips / 0 fail。CI 和 ECS 尚待执行。

## Review decisions and remaining gate

1. Code locator 已失败关闭：API 不接受 `codeRange`，Domain 也拒绝；待未来 Version 有权威 source revision 后另行开放，禁止把 UUID `commitId` 冒充 Git revision。
2. SourceMap/object-storage 解析已移出 Claim/Evidence Serializable 事务；短事务重新校验 version/manifest/artifact/hash、SourceMap ref 与 CAS 时间戳。
3. `review.analyze` 已在 API payload、Domain submit 和 Worker save 前强绑定 session/payload/version 同一 RO；Worker 只使用持久化任务 payload。
4. Presentation reuse 改为按全部受审 Evidence hash 精确查找，不再依赖可截断的资产前缀。SourceMap 为可共享的内容寻址对象，Task 8 不盲删；GC/retention 在 Task 10 建立全引用扫描后实施。
5. 剩余完成门禁：全仓顺序验证、deep review、commit/push/exact CI、ECS immutable deploy、真实 RO Claim/Evidence/review/publish journey 与 exact cleanup。

## Constraints

- 服务器验收为准；本地不运行 Docker。Windows 远程操作只用显式 `C:/Program Files/Git/bin/bash.exe` 调 canonical wrapper。
- 不读取/打印 `.env`；不 broad prune；不删除文件或服务器对象，除非用户明确批准 exact scope。
- Task 8 未完成前不改 Taskmaster done 状态，不创建 release，不把本地 API 作为生产证明。

## Next action

1. 完成最终 deep self-review 与 docs gates，提交并推送 Task 8。
2. Commit/push，等待 exact CI；CI 绿色后走 ECS immutable deploy 与真实 RO journey。
3. 验收后把 Task 8 置 done，同步 release tuple；再审计服务器磁盘与 Git 分支，只清理可证明冗余且可恢复的 exact targets。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`
4. `docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`
5. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
6. `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；不要从较旧 `main` 或历史 release 段落推断现状。
