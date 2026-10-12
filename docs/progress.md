# CURRENT Progress Window

> 业务摘要；精确版本、CI、资产、写权与下一步见 [Hermes CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。历史细节留在 Git。

- 2026-10-12 15:26：UI 替代 session 完成剩余 P2 类型契约修复 `5e1c4831`：PresentationWorkbenchProps 与 ResearchPresentation/StoryboardPanel/StoryboardPlans 统一为 `void | Promise<StoryboardWriteOutcome>`；13/13、Web typecheck、diff-check 通过，canonical 未改，独立 High 复审待回。
- 2026-10-12 15:31：独立 High 对 `5e1c4831` 正式 GO（无 P0/P1）；P2 为 void 可继续丢弃 outcome 与潜在 type-only 依赖审计边，现有路径无运行时回归。已 cherry-pick/push 为 canonical `c258da85`，等待该提交精确 workflow 回执，未部署。
- 2026-10-12 15:41：canonical `c258da85` 的精确 push workflow `38270923462` 已回执：browser-entry/web build 全通过；相同两项非 UI queue-recovery 断言失败，UI typecheck 与 storyboard 定向 CI 被跳过。未重跑、未部署、未安装，canonical 工作树干净。
- 2026-10-12 15:51：UI session 修复 `silent:true` abort/stale-scope 反馈，普通失败仍明确提示并释放锁，静默结果回 idle；提交 `d9afe946`，13/13、Web typecheck、diff-check 通过，canonical 未改，独立 High 复审待回。
- 2026-10-13：生图真实验收更新：RO `aa450f1e-fafc-46d8-a072-d935e01b0544` 唯一 Hermes 提交完成，产出私有 art-only draft `writing-draft-4237cbcf-8371-4222-bc53-4f6eb45b2111`（部分待核对）；已审批无图场景未接入提交入口，故 Synclip=0、无 receipt/oncekey/PNG/SHA/质量。High GO；Worker 210/206通过/4跳过、TC/ESLint通过；不重试、不扩预算。
- 2026-10-13：UI silent abort/stale-scope 修复 `d9afe946` 获独立 High GO 后已合入 canonical `b82594d8`；普通失败反馈、静默回 idle 与锁释放保持，13/13/typecheck/diff-check owner 证据已记录。等待该提交精确 workflow，未部署。
- 2026-10-12 15:20：canonical `eb4adf021600c21f0812de1582d7759d435da446` 干净已推送。UI 写反馈三轮 High GO 后已合入 `035efaac`、`06fb102e`、`9e837b93`；定向 13/13、owner typecheck/diff-check 通过。
- UI push workflow `38268914069`：四组 browser-entry 与 web build 通过；`agent-worker queue-recovery.test.ts` 两个既有非 UI 断言失败，导致 UI typecheck 与 `storyboard-panel.test.tsx` CI 步骤跳过。未重跑、未部署、未安装；不能称 workflow 全绿。
- 生图：admission/floor/reader 与 adapter/worker 代码均已独立 High GO 并合入；admission 191/195（4 skip），Worker typecheck/diff-check 通过，journal 缺 RO/version 身份保持 fail-closed。当前真实阻塞是已审批无图场景未接入提交入口；唯一 Hermes art-only draft 保留，Synclip=0，不重试、不扩预算。
- 视频：native-only/fixture 交付与 browser-entry/native-video-planning 已收并合入；Media/Journal 的已知 CI 阻塞均定位为 queue-recovery/旧夹具前提，未观察到本次视频代码回归。无真实短片/试听质量认可，未部署。
- 三篇真实论文的整体验收、普通用户旅程、完整视频、整站审美仍未完成；单测、CI、部署或单图认可不代替科学/产品质量确认。
- 当前可执行下一步：图像仅在确认可用的 >=gpt-6.1-sol 容量路径后复用现有单次提交做一次受控私有验收；视频等待具体授权的能力缺口或真实短片/语音比较；UI 写反馈范围完成，若明确授权才处理共享 queue-recovery 非 UI 问题。无关检查不填充 idle。
- 保护边界：不重放未知 paid/started CP，不切换主 Gateway/Native M3，不新增预算/安装/重启；保留原 PDF、SourceMap、图片、公开标识、sealed、失败与 receipt/oncekey。
- 2026-10-12 docs-sync：`docs:lint` 272 files/0 issues，`audit:docs-sync` 7/8（唯一失败为历史 progress 文件超过 16 KiB，已压缩本窗口后待复跑）。
