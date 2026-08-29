# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** Task 8 已生产验收并完成磁盘卫生；下一产品任务是 Task 9 Claim-first 公开 RO。Landing/Hermes 视觉仍冻结。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 8/12：Tasks 1–8 done；Task 9 是下一产品任务，Task 10 dependency-ready。
- 证据整理稿位于 `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`；当前产品主线转入 Task 9。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application-code HEAD: `codex/hermes-wanko-live2d` / `4c73469fe24abe685054f1d917d452adc5371d35`；其后仅 Taskmaster/文档收口。
- Production application source / immutable release: `4c73469fe24abe685054f1d917d452adc5371d35`
- Rollback: `cf68bfa7baba9610dcd010fed0fcf5fd0deeab2f`; core/search migrations `30/30` / `2/2`
- 本地 `main` 与其他 worktree 有用户改动，不得触碰或用它推断生产；上述 tuple 已从 ECS 重新实测。

## Production truth

- Public/loopback `/__release` 均返回 `4c73469…`；目标容器和数据服务 healthy，BGE CPU runtime、Parser 与公网入口全绿。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Task 8 accepted

- 计划入口：`docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`。实现包括可信 SourceMap ref、Claim/Evidence CRUD、乐观锁/审计、locator resolver、发布 blockers、narrative snapshot/hash、公开版本不可变、外部权利 fail closed 与 SourceMap redaction。
- SeaweedFS HEAD 不返回自定义 checksum metadata 的生产兼容已在 `4c73469…` 修复：缺 metadata 时对原件做有界流式 SHA-256，同一对象复验只读一次；有 metadata 时仍直接校验。
- Exact CI `33257516418` / job `99113706374` success。ECS parser acceptance 与真实 RO journey 通过：5 source blocks、3 Claims/Evidence、未核验阻断、locator 篡改拒绝、核验后 review/publish、公开页 200、残留用户 0。

## Decisions and hygiene

1. Code locator 已失败关闭：API 不接受 `codeRange`，Domain 也拒绝；待未来 Version 有权威 source revision 后另行开放，禁止把 UUID `commitId` 冒充 Git revision。
2. SourceMap/object-storage 解析已移出 Claim/Evidence Serializable 事务；短事务重新校验 version/manifest/artifact/hash、SourceMap ref 与 CAS 时间戳。
3. `review.analyze` 已在 API payload、Domain submit 和 Worker save 前强绑定 session/payload/version 同一 RO；Worker 只使用持久化任务 payload。
4. Presentation reuse 改为按全部受审 Evidence hash 精确查找，不再依赖可截断的资产前缀。SourceMap 为可共享的内容寻址对象，Task 8 不盲删；GC/retention 在 Task 10 建立全引用扫描后实施。
5. Task 8 已完成。公开页 journey 的 RO 由一次性 fixture 预置为 public；正式“扩大可见性审批”不得借 generic PATCH 绕过，应与 Task 9 的发布/公开衔接一起关闭。
6. `/opt/openscience-evals` 的 40 个历史工作目录已在生产锁内精确清理；6 份小报告与 cleanup receipt 在 `/opt/openscience-acceptance/capability-evaluations`，7/7 checksum 通过。根盘当前约 36G used / 106G available。

## Constraints

- 服务器验收为准；本地不运行 Docker。Windows 远程操作只用显式 `C:/Program Files/Git/bin/bash.exe` 调 canonical wrapper。
- 不读取/打印 `.env`；不 broad prune；不删除文件或服务器对象，除非用户明确批准 exact scope。
- 不把本地 API 或本地 Docker 当生产证明；服务器验收继续是最终门禁。

## Next action

1. 提交本次 Taskmaster/docs 收口并等待 exact CI。
2. 合并当前 PR 到 `main`；先为仍有独立历史的旧 Live2D 分支建 archive tag，再关闭/删除已合并或被取代的远端分支，禁止触碰 dirty 本地 worktree。
3. 将 Task 9 置 `in-progress`，实现 Claim-first 公开 RO、Evidence rail/mobile sheet、默认展开偏好，并关闭发布到 public visibility 的显式审批衔接。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`
4. `docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`
5. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
6. `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；不要从较旧 `main` 或历史 release 段落推断现状。
