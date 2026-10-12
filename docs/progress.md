# CURRENT Progress Window

> 业务摘要；精确版本、CI、资产、写权与下一步见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。历史细节留在 Git。

- 2026-10-12 15:26：UI 替代 session 完成剩余 P2 类型契约修复 `5e1c4831`：PresentationWorkbenchProps 与 ResearchPresentation/StoryboardPanel/StoryboardPlans 统一为 `void | Promise<StoryboardWriteOutcome>`；13/13、Web typecheck、diff-check 通过，canonical 未改，独立 High 复审待回。
- 2026-10-12 15:31：独立 High 对 `5e1c4831` 正式 GO（无 P0/P1）；P2 为 void 可继续丢弃 outcome 与潜在 type-only 依赖审计边，现有路径无运行时回归。已 cherry-pick/push 为 canonical `c258da85`，等待该提交精确 workflow 回执，未部署。
- 2026-10-12 15:41：canonical `c258da85` 的精确 push workflow `38270923462` 已回执：browser-entry/web build 全通过；相同两项非 UI queue-recovery 断言失败，UI typecheck 与 storyboard 定向 CI 被跳过。未重跑、未部署、未安装，canonical 工作树干净。
- 2026-10-12 15:51：UI session 修复 `silent:true` abort/stale-scope 反馈，普通失败仍明确提示并释放锁，静默结果回 idle；提交 `d9afe946`，13/13、Web typecheck、diff-check 通过，canonical 未改，独立 High 复审待回。
- 2026-10-13：生图真实验收更新：RO `aa450f1e-fafc-46d8-a072-d935e01b0544` 唯一 Hermes 提交完成，产出私有 art-only draft `writing-draft-4237cbcf-8371-4222-bc53-4f6eb45b2111`（部分待核对）；已审批无图场景未接入提交入口，故 Synclip=0、无 receipt/oncekey/PNG/SHA/质量。High GO；Worker 210/206通过/4跳过、TC/ESLint通过；不重试、不扩预算。
- 2026-10-13：UI silent abort/stale-scope 修复 `d9afe946` 获独立 High GO 后已合入 canonical `b82594d8`；普通失败反馈、静默回 idle 与锁释放保持，13/13/typecheck/diff-check owner 证据已记录。等待该提交精确 workflow，未部署。
- 2026-10-13：生图阻塞根因已定位：`StoryboardPlans` 只暴露当前 scene 按钮并依赖 native select，多 scene 的无图 scene 没有稳定独立入口。UI session 正在补按 scene 展开的显式 action group（AX/键盘/坐标可触发），复用现有守卫与失败反馈，不自动调用 Synclip。
- 2026-10-13：UI 入口修复提交 `43d0923d`：在 approved + canGenerateSceneImage 守卫内为每个 scene 增加显式 action group，保留 selector/主按钮、锁与失败反馈；25/25、Web typecheck、diff-check 通过，未调用 Provider/部署，独立 High 复审待回。
- 2026-10-13：独立 High 对 `43d0923d` GO（无 P0/P1）；已 cherry-pick/push 为 canonical `b06a8fab`。精确 push workflow 待回执；下一步是观察真实 approved storyboard route，不重试 Hermes/Synclip、不扩预算。
- 2026-10-13：`38277069403` 已完成：browser-entry/Web build 通过；skill-path 仅复现 queue-recovery 两项非 UI 断言失败，后续 UI typecheck/storyboard 步骤因 fail-fast 跳过。已交视频 session 做最小兼容修复；部署继续等待 High、精确 CI 与真实路由证据。
- 2026-10-13：用户明确图片模型策略：2.5 返回明确不可用时自动切换 image-2 并提示实际模型；超时、网络错误或状态未知先恢复原任务，不直接二次提交。生图 session 已接手定位路由符号与定向测试，尚未调用 Provider。
- 2026-10-13：视频 queue-recovery 两失败确认是过时夹具；`af42e5e2` 仅更新 marker/result fixture，定向 45/45、Worker typecheck、diff-check 通过，独立 High 待回，未部署。
- 2026-10-13：`af42e5e2` 独立 High GO 后已合入 canonical `2e1a28de`；精确 Media CI `38280757897` 正在运行，未部署。
- 2026-10-13：精确 Media CI `38280757897` 已通过：skill-path 与 4 个 browser-entry 全部 success；`af42e5e2` 的两个 queue-recovery 过时夹具阻塞已闭合。无部署、Provider 或付费任务；视频真实短片/试听质量仍未验收。
- 2026-10-13：生图首图最小 brief/普通 writer beta gate `2ae3133d` 已通过 Domain 114/114、API 140/140、build/typecheck/diff-check；独立 High 待回，未调用 Provider、未部署。
- 2026-10-13：独立 High 对 `2ae3133d` P1 NO-GO：scene spend 检查在事务外且只查 approved child，普通 writer 可用不同幂等键并发双扣；生图 session 正在修复原子 guard 并补并发回归，未合入/未部署。
- 2026-10-12 15:20：canonical `eb4adf021600c21f0812de1582d7759d435da446` 干净已推送。UI 写反馈三轮 High GO 后已合入 `035efaac`、`06fb102e`、`9e837b93`；定向 13/13、owner typecheck/diff-check 通过。
- UI push workflow `38268914069`：四组 browser-entry 与 web build 通过；`agent-worker queue-recovery.test.ts` 两个既有非 UI 断言失败，导致 UI typecheck 与 `storyboard-panel.test.tsx` CI 步骤跳过。未重跑、未部署、未安装；不能称 workflow 全绿。
- 生图：admission/floor/reader 与 adapter/worker 代码均已独立 High GO 并合入；admission 191/195（4 skip），Worker typecheck/diff-check 通过，journal 缺 RO/version 身份保持 fail-closed。当前真实阻塞是已审批无图场景未接入提交入口；唯一 Hermes art-only draft 保留，Synclip=0，不重试、不扩预算。
- 视频：native-only/fixture 交付与 browser-entry/native-video-planning 已收并合入；Media/Journal 的已知 CI 阻塞均定位为 queue-recovery/旧夹具前提，未观察到本次视频代码回归。无真实短片/试听质量认可，未部署。
- 三篇真实论文的整体验收、普通用户旅程、完整视频、整站审美仍未完成；单测、CI、部署或单图认可不代替科学/产品质量确认。
- 当前可执行下一步：图像仅在确认可用的 >=gpt-6.1-sol 容量路径后复用现有单次提交做一次受控私有验收；视频等待具体授权的能力缺口或真实短片/语音比较；UI 写反馈范围完成，若明确授权才处理共享 queue-recovery 非 UI 问题。无关检查不填充 idle。
- 保护边界：不重放未知 paid/started CP，不切换主 Gateway/Native M3，不新增预算/安装/重启；保留原 PDF、SourceMap、图片、公开标识、sealed、失败与 receipt/oncekey。
- 2026-10-12 docs-sync：`docs:lint` 272 files/0 issues，`audit:docs-sync` 7/8（唯一失败为历史 progress 文件超过 16 KiB，已压缩本窗口后待复跑）。
- 2026-10-13：生图 session 提交 `ad812d38` 修复 scene spend 原子事务与不同幂等键并发回归，Domain 115/115、API 140/140、build/typecheck/diff-check 通过；独立 High 待回，未合入/未部署。
- 2026-10-13：独立 gpt-6.1-sol High 对 `63a3fc00` 发现 P1：beforePersist 先于 exact idempotency replay，导致相同幂等键并发后者被 pending/running guard 拒绝而非 coalesce/replay；不同键双扣风险已修复，生图 session 继续补同键并发回归。
- 2026-10-13：18dbd19c 后续 High 发现同 key 的 approved-child 窄竞态：外层 replay 读空后，后请求拿 parent lock 时 approved guard 无 idempotencyKey，可能返回 VALIDATION_ERROR 而非 coalesce；生图 session 继续修复。
- 2026-10-13：High 复审继续发现生图 Worker 执行阶段仍要求 platform_admin/Hermes authority；普通 beta writer 会先扣费再被 Worker 拒绝（P1）。生图 session 正在统一 Worker gate 并补普通 writer→Worker 回归，未合入。
