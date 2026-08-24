# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-24 09:02 +08。完整历史由 Git history 保存；DEPRECATED、NO-GO、旧计划和 archive 不作为新 session 默认输入。

## Current version tuple

- Branch / audited pre-sync HEAD: `codex/hermes-wanko-live2d` / `e4e6e6681b93de6d1b0434824a8bbc3965d784ef`（本轮 docs-sync commit 位于其后）。
- Deployable application source: `5f4e73c10dace9f2d18f8788ead238863cd33312`。
- Local main / origin main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；两者都早于当前工作分支，远端 Hermes feature 不存在。
- ECS release / rollback: `5f4e73c10dace9f2d18f8788ead238863cd33312` / `c97926ab4188d5d5fc7a6e58e0333d20a600c692`。

## 2026-08-24 — Hermes movable work assistant deployed

- v09 形象和 runtime bundle 不再改动。产品尺寸为 desktop `360px`、compact/mobile `200px`；默认右栏 anchor，拖动后成为 viewport-clamped companion，位置按 desktop/mobile 持久化。
- 紧凑 ink-edge bubble、字段引导、protected-region travel、主流程避让和 32-action semantic director 已完成；自主短句与动作是固定 4 秒 atomic beat，交互和优先任务可即时打断。
- release 前 fresh evidence：Web `390/390` + 5 Node contracts、typecheck、18-page build、Live2D/work-assistant gates、canonical product E2E `40/40`；独立最终 review 无 Critical/Important/Minor。
- 生产以 `--skip-migrate` 部署；未 migration、未 seed。公网三视口 Dashboard click/drag/reload/resize/bubble/Create gate 通过且使用无写入 API 拦截；没有生产 session token，因此未声称真实账号/数据库纵向 gate。

## 2026-08-24 — Fresh local/server cognition audit

- Git：`origin/main` 是 local main 的祖先；当前 Hermes 分支在 local main 之后且未推送。主工作区的未跟踪 `docs/live_2D/` 与 `docs/user_ideas/8.10/` 用户资产保持原样。
- ECS：`.release-id` 与公网 `/__release` 精确为 `5f4e73c...`，`.release-failed` absent，rollback tree `c97926a...` present；公网 Cloudflare 与 loopback HTTPS 均 200。
- Runtime：API、Agent Worker、Document Parser、Postgres、Redis、SeaweedFS、Malware Scanner 全部 running/healthy；Web running。Parser 保持 `node/read-only/network=none/536870912 bytes/64 PID`。
- Database：27 migrations found，schema up to date；2026-08-24 03:00 +08 最新 DB dump 为 441,411 bytes，当前保留 7 个。未读取备份或 `.env` 内容。

## Constraints and next action

- 保持 ECS release `5f4e73c` / rollback `c97926a`；docs-only commit 不重新部署。
- Task 21 计划已经完成并降级为 HISTORICAL evidence；唯一 CURRENT Hermes design 仍是 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`。
- 下个任务开始前先选择：本地 merge、推送 PR、或保留当前分支；之后从所选最新基线创建独立 worktree，重新核对 branch / HEAD / release / rollback。
- 可选剩余证据：取得现有安全测试会话后，补一次不创建新数据的 authenticated Dashboard smoke。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. 当前任务唯一 CURRENT spec（Hermes 为 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`）
4. 本文件
5. `docs/OpenScience_Kimi_Development_Spec.md` 相关章节
