# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-18 — Hermes 真实静止问题与文档记忆收敛（进行中）

- **当前任务**：不是重新设计 Hermes 形象，而是查清真实账号页面为何仍呈静态 PNG，并让验收绑定真实用户可见 runtime，而非测试夹具。
- **已确认根因**：现有 90 秒动效门禁拦截认证/数据并使用全新 browser context，因此天然无用户历史偏好；生产 renderer 初始化异常被静默吞掉，UI 的“动效开启”只代表 preference=full，不代表 WebGL canvas ready/drawing。
- **产品职责基线**：Hermes 是常驻 Workspace 引导员和 Agent 入口；应理解当前页面/任务，在关键填写节点安全游动到语义锚点，提供 Explain/Draft/Check 与 reviewable diff，由用户显式 Apply；同时以可辨认的待机、指针、工作、成功、失败和审批动作维持生命感。
- **文档卫生**：`docs/progress.md` 从永久历史日志改为不超过 120 行的 CURRENT window；CURRENT handoff 不超过 80 行，`AGENTS.md` 不超过 100 行；历史只从 Git history 或显式 archive 查阅，不得进入默认启动链。
- **下一步**：在真实页面暴露并验证 `preference / WebGL capability / renderer status / draw activity / fallback reason`，以用户同条件复现后再写修复；未经该证据不得再次用录屏或 pixel-count 宣称完成。

## Version tuple

- Local branch / HEAD: `main` / `bf76e66`
- Remote Hermes branch runtime/test HEAD: `codex/hermes-2d-pet` / `fdba093`
- ECS release / rollback: `1b76b46` / `017bf1e`
- PR: <https://github.com/photonics-dhl/OpenScience/pull/3>

## Current production facts

- ECS 已部署 `1b76b46`，未迁移、未 seed；生产服务与公网健康检查此前 GREEN。
- 现有代码声明首次默认 full，并提供常驻 full/reduced 切换；审批态和用户主动 reduced 必须静止。
- 用户真实体验仍为“像一张静止图片”，因此视觉/runtime 验收状态为 **NOT ACCEPTED**；旧 GREEN 只保留为工程证据，不再代表用户可见完成。
- 高级 Quiet/Balanced/Active、sound/particle/proactive 设置，以及真实论文 per-field accept/edit/reject 完整矩阵仍未完成。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/OpenScience_Kimi_Development_Spec.md`（只读 Hermes / 权限相关段落）
4. `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`（只读 CURRENT summary / acceptance）
5. 本文件
