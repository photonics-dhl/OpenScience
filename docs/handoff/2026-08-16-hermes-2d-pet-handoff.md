# Handoff — Readable Workspace and Hermes Guidance

## Current truth

- 唯一产品入口是 `docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`；Tasks 1–7 已实现并部署，不重开 mascot、3D、Live2D 或旧 renderer 选型。
- ECS release `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`，rollback `8ecf96c193e0010329cdf3330819063d1ad7958d`；27/27 migrations current，公网 release identity 与服务健康已独立核验。
- 公网 blank-RO gate 用真实管理员、真实 MiniMax、零网络拦截完成。私有证据 RO `ad35cac3-cbd9-4a2a-9a00-9762fcc15e91` 保留：1 task、5 个 locator-backed 字段、Results missing、0 unsupported claim，edit-accept/accept/reject/save/reload/commit version 2 全部通过。
- Hermes 在该流程发布 `idle / travel / working / review`，review/approval 保持静止，自动 footprint 不遮挡字段、diff 或主操作；视觉证据只在 ignored `apps/web/test/visual/out/hermes-blank-ro/`。
- 真实 gate 暴露并已修复 draft SDF 400：draft 必须保留 schemaVersion + 六字段结构，但允许明确 unresolved 的空字段；非 draft 继续执行完整非空 core 校验。
- 旧 3D、Live2D、整图 PNG/CSS-signal 与 2026-08-16 mesh/contextual 路线均为 DEPRECATED/NO-GO。

## Version tuple

- Branch / implementation HEAD: `codex/readable-hermes-guidance` / `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8`
- Remote candidate: `origin/codex/readable-hermes-guidance`（release record commit 在其后）
- Local main: `c60ffdd16b85ea8f0d8b047493fa03a4c0230c05`
- ECS release / rollback: `06072c1fd3eb30148daec8d4c4a8572fa3bdacc8` / `8ecf96c193e0010329cdf3330819063d1ad7958d`
- Current branch PR: none

## Constraints

- 不读取/记录 `.env`、Secret 或真实用户内容；不使用本机 Docker，不删除用户文件或私有验收 RO。
- 生产最终标准是公网 ECS；本地门禁只作 preflight。新云写仍需单独确认。
- 草稿空字段不等于模型填充：Hermes 必须披露 missing evidence，只有用户显式接受的文本可保存。
- ECS Parser 继续保持 `network=none`、非 root、只读 rootfs、512MiB/64 PID 与 bounded IPC。

## Next action

1. 用户在 `https://openscience.428312321.xyz/` 做最终审美/操作体验复验。
2. 若通过，关闭本主题；下一 session 从新的 Workspace/RO 内容任务建立唯一 CURRENT spec/plan，不读取旧 Hermes 原型历史。
3. 若发现回归，先复现公网 release `06072c1`，不得回退到旧视觉路线猜修。

Read first：`AGENTS.md` → 本 handoff → CURRENT design → `docs/progress.md`；`project_index.md` 只用 `rg` 定向查 CURRENT 行。
