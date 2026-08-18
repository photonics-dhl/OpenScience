# OpenScience (XGS) Current Progress

> 本文件只保留 CURRENT window；完整历史由 Git history 保存，不作为新 session 默认输入。

## 2026-08-18 — 可读工作台与 Hermes 空白创建引导（设计待书面确认）

- **用户复验结论**：公网 Hermes 已有视觉运动，但优雅度、生命感和真实引导仍不足；截图同时证明 guide action 按钮出现浏览器白底/浅色文字，且 Hermes/气泡遮挡字段与 diff。全站大量 10–12 px、宽字距、低对比信息导致阅读吃力。
- **已确认方向**：采用 B「平衡学者工作台」；分别优化 authenticated workspace、public RO 与 Landing，不把三套视觉系统同质化。Hermes 保留现有角色/renderer，改为待机→发现缺项→安全游动→抵达→Explain/Draft/Check→字段 diff→反馈的真实编舞，并把不遮挡 active input 设为硬约束。
- **真实验收**：公网真实管理员从 blank RO 开始，输入一段无实验结果的受控研究构想；MiniMax 必须准确生成五类有依据字段并对 results 明示未知，完成 accept / edit-accept / reject、保存、刷新和 commit。不得用 mock、API interception 或 visual harness 代替。
- **CURRENT 入口**：`docs/specs/2026-08-18-readable-workspace-hermes-guidance-design.md`；产品方向已确认，等待用户书面 spec 复核后再写实施计划，业务代码尚未修改。

## 2026-08-18 — Hermes 真实动效修复（已部署并通过公网真实账号验收）

- **根因与修复**：真实 Dashboard 把队列中的 `needs_review` 错映射成 `awaiting_approval`，导致 Hermes 按审批静止合同长期显示 fallback；旧录屏使用空任务 mock，掩盖了该分支。`main@39c752b` 已改为 Dashboard `needs_review → suggesting`，并让真实六字段审批页仅在服务端 task state 为 `needs_review` 时静止，确认/刷新后恢复 idle。
- **自然运动修复**：废弃同一整图在六个重叠椭圆中被连续缩放/重复变形的路径；新 part-rig shader 从 bind UV 一次计算各语义部件的刚体位移，重叠区只归一化一次，不缩放解剖部位。新增 renderer heartbeat、真实 context-loss 单次自动恢复与有界手动 retry。
- **产品职责基线**：Hermes 是常驻 Workspace 引导员和 Agent 入口；应理解当前页面/任务，在关键填写节点安全游动到语义锚点，提供 Explain/Draft/Check 与 reviewable diff，由用户显式 Apply；同时以可辨认的待机、指针、工作、成功、失败和审批动作维持生命感。
- **文档卫生**：`docs/progress.md` 从永久历史日志改为不超过 120 行的 CURRENT window；CURRENT handoff 不超过 80 行，`AGENTS.md` 不超过 100 行；历史只从 Git history 或显式 archive 查阅，不得进入默认启动链。
- **工程证据**：合并树 Web `308/308`、typecheck、17-page production build、production E2E `14/14`、Hermes release gate、根 lint/docs 与独立复审均 GREEN。真实像素门禁区分 affine mutation 与独立关节；idle/pointer 分别有 `451/505` 次 renderer draw。
- **生产发布**：release `39c752b`，rollback `1b76b46`。前后巡检健康，备份 `384K / 7/7`，dry-run 后执行 `--confirm --skip-migrate`；远端 build、Parser-first health、应用重启、Nginx 与硬 HTTP 检查通过，未迁移/seed。
- **公网真实账号**：真实管理员 Dashboard 含 9 个 `needs_review` 任务时呈 `suggesting`，而非错误的 approval-still；`preference=full`、`renderer=ready`、`inputReady=true`、fallback reason 为空，heartbeat 推进 `516.6ms`，待机 pose/PNG 与 pointer PNG 均变化，gesture=`focus`，浏览器错误 0。短时验收 session 已删除。
- **下一步**：由用户直接体验公网自然度；后续只继续高级动作/主动提示与真实论文 per-field accept/edit/reject，不再重开已否决的整图重复拉伸路线。

## Version tuple

- Local branch / application HEAD: `main` / `7eb2f5b`（设计候选未提交）
- Integrated candidate source: `codex/hermes-2d-pet` / `b9db36e`
- ECS release / rollback: `39c752b` / `1b76b46`
- PR: <https://github.com/photonics-dhl/OpenScience/pull/3>

## Current production facts

- ECS 已部署 `39c752b`，生产真实队列不再触发 Dashboard 误静止。
- 现有代码声明首次默认 full，并提供常驻 full/reduced 切换；审批态和用户主动 reduced 必须静止。
- 本轮 runtime/映射修复已通过公网真实账号自动验收；最终审美仍以用户直接体验为准。
- 高级 Quiet/Balanced/Active、sound/particle/proactive 设置，以及真实论文 per-field accept/edit/reject 完整矩阵仍未完成。

## Read first

1. `AGENTS.md`
2. `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`
3. `docs/OpenScience_Kimi_Development_Spec.md`（只读 Hermes / 权限相关段落）
4. `docs/specs/2026-08-17-hermes-workspace-companion-motion-design.md`（只读 CURRENT summary / acceptance）
5. 本文件
