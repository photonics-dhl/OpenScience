# Handoff — Hermes Wanko Live2D Companion

> **CURRENT active-memory，2026-08-24 09:02 +08。** 旧灯体、帽子、流苏、Cubism GUI 试验和被否决候选只从 Git history 查阅，不再作为实施入口。

## Goal

- 已交付的 v09 Hermes 是可移动工作助手，不是主页面内容：Dashboard 默认右栏停靠，整角色拖动后脱离；桌面/紧凑移动端精确为 `360/200px`。
- 保持 RO 创建流程为主任务；气泡、字段引导和 32 动作只提供短暂、可打断、不遮挡的辅助反馈。

## Version tuple

- Working branch / audited pre-sync HEAD: `codex/hermes-wanko-live2d` / `e4e6e6681b93de6d1b0434824a8bbc3965d784ef`（该 HEAD 是 release 后文档记录；本轮 docs-sync commit 位于其后）。
- Deployable application source: `5f4e73c10dace9f2d18f8788ead238863cd33312`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；`origin/main` 是 local main 的祖先，二者都早于当前工作分支。
- Remote feature: `origin/codex/hermes-wanko-live2d` 不存在；旧 `origin/codex/readable-hermes-guidance@c88c780` 不是本次候选。
- ECS release / rollback: `5f4e73c10dace9f2d18f8788ead238863cd33312` / `c97926ab4188d5d5fc7a6e58e0333d20a600c692`。

## Done

- v09 母版、帽子/流苏/灯/烟雾、两张 zero-alpha RGB-clean texture 和 12 motions 均保持不变；公网 runtime 与 immutable release tree 的五个关键 SHA 已一致。
- Task 21 已完成并部署：`360/200px`、drag-detach、viewport clamp、断点恢复、位置持久化、角色/气泡独立测量、protected-region/guide 避让与固定 4 秒 atomic autonomous beat。
- release 前门禁：Web `390/390`、5 个 Node contracts、typecheck、18 页 production build、Live2D/work-assistant gates、canonical product E2E `40/40`；两轮独立 Sol High review 无 Critical/Important/Minor。
- 2026-08-24 09:02 +08 只读复核：公网与 loopback HTTPS 200；API/Worker/Parser/data services healthy；27 migrations current；Parser `node/read-only/network=none/512MiB/64PID`；`.release-failed` absent；公网和本机 `.release-id` 均为 `5f4e73c`；rollback tree 存在。
- 最新数据库备份 `/var/backups/openscience/db-2026-08-24.sql` 为 441,411 bytes；当前保留 7 个 DB dump。未读取备份内容。

## Constraints

- 不读取/记录 `.env`、Secret 或真实用户内容；不删除用户资产、受保护 v09 母版或私有验收 RO。
- 生产写操作仍需用户单独确认；文档 commit 不部署，不运行 migration 或 seed。
- 只有用户显式接受的证据文本可进入 SDF；Hermes 必须如实披露 missing evidence。
- 不恢复旧 `336/176`、动作画廊、大卡片气泡、旧 pet/carrier runtime 或被否决美术路径。

## Open risk

- 当前缺少可安全复用的生产 session token，因此部署后 Dashboard 验收是三视口真实 UI/几何/点击/拖动 gate + 无写入 API 拦截，不冒充真实账号/数据库纵向 smoke。
- 工作分支尚未与 `main` 做集成决策。开始新任务前必须明确 merge / PR / 保留分支之一，禁止直接从较旧 local main 猜测现状。

## Next action

1. 先完成分支集成选择；在此之前保持 ECS `5f4e73c` / rollback `c97926a`，不要因 docs-only HEAD 重部署。
2. 新任务在最新已选基线创建独立 worktree；启动时重跑 worktree/branch/status、`git fetch origin` 和 ECS 只读 release/health 检查，再更新本 version tuple。
3. 若用户提供现有安全测试会话，可补不创建新数据的真实认证 Dashboard smoke；否则它只是可选证据，不阻塞现有交付。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
4. `docs/progress.md`
5. `docs/OpenScience_Kimi_Development_Spec.md` 的当前任务相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；Task 21 计划和旧 handoff/spec 只作 HISTORICAL evidence。
