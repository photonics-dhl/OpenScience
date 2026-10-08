> Task 1–4 是已完成的历史实施记录，不据此重跑测试、迁移、生成或发布。末节「2026-10-08 原生论文视频接线」已获独立 High 有界设计 GO，仍待写权协调、尚未实施；运行状态、发布和实际质量仍以 [CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md) 为准。

# Hermes Presentation Assets Implementation Plan

> **COMPLETED / PRODUCTION.** Taskmaster Task 11 was accepted on immutable application release `b32d81c3474a0ba3c7cead5d4cacbc4a0e8fc4f7`; rollback is `0aaf52fed29e79bb19b15517ba9ef50545510f72`.
> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Taskmaster `hermes-research-intelligence` Task 11 with deterministic, provenance-bound SVG/HTML assets and a fail-closed administrator media workflow.

**Architecture:** The API authorizes and submits a durable `presentation.generate` AgentTask. Agent Worker reloads the version and source Claims, generates deterministic bytes, stores them under a content-addressed object key, and atomically persists the existing `PresentationAsset`/`PresentationAssetClaim` rows. Status changes remain domain-owned; MiniMax image/video requests are administrator-only and remain disabled unless the AI Gateway media capability is explicitly configured.

**Tech Stack:** TypeScript, Fastify, Prisma, Redis AgentTask queue, SeaweedFS through `StorageAdapter`, Vitest/Node test runner.

## Global Constraints

- Reuse migration 28 presentation tables; create no schema migration.
- Generated assets always use `label=presentation_not_evidence`.
- Only `succeeded` Claim rows from the exact Research Object version may be source Claims.
- Deterministic generators do not call an LLM, execute scripts, load remote resources, or include arbitrary HTML.
- MiniMax image/video calls may only cross `packages/ai-gateway`; default production capability remains disabled and video is not enabled before image acceptance.
- Every write is authenticated, membership/admin authorized, idempotent where created, audited, and covered by a contract test.

---

### Task 1: Domain contract and status workflow

**Files:**
- Create: `packages/domain/src/assets/presentation-asset.ts`
- Create: `packages/domain/src/assets/errors.ts`
- Create: `packages/domain/test/assets/presentation-asset.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces `submitPresentationGeneration`, `transitionPresentationAsset`, and `PresentationGenerationPayload`.
- Enforces exact version/Claim scope, workspace membership, administrator-only image/video, and `draft -> approved|rejected` only.

- [x] Write tests for cross-version Claim rejection, revoked membership, non-admin media rejection, idempotent task replay, label enforcement, legal/illegal status transitions, and optimistic `expectedUpdatedAt` conflict.
- [x] Run `npx pnpm@9.15.0 --filter @openscience/domain test -- presentation-asset.test.ts` and verify RED because the asset service does not exist.
- [x] Implement the minimal domain service using the existing AgentSession/AgentTask transaction path and audit helper.
- [x] Re-run the focused Domain tests and typecheck.

### Task 2: Deterministic Worker generators

**Files:**
- Create: `apps/agent-worker/src/presentation/chart-generator.ts`
- Create: `apps/agent-worker/src/presentation/interactive-html.ts`
- Create: `apps/agent-worker/src/presentation/handler.ts`
- Create: `apps/agent-worker/src/presentation/minimax-admin.ts`
- Create: `apps/agent-worker/test/presentation/presentation-generation.test.ts`
- Modify: `apps/agent-worker/src/index.ts`

**Interfaces:**
- Consumes exact `PresentationGenerationPayload` and server-reloaded Claim rows.
- Produces byte-identical SVG or CSP-safe HTML, SHA-256, object key, generator identity, asset ID, and source Claim IDs.

- [x] Write tests proving byte identity under input reordering, XML/HTML escaping, no scripts/network/LLM calls, exact Claim/version authorization, content-addressed object storage, idempotent persistence, and fail-closed image/video capability.
- [x] Run the focused Worker tests and verify RED because no presentation handler exists.
- [x] Implement canonical Claim ordering, deterministic SVG, no-script HTML using semantic `details` elements, bounded output, storage write, and transactional asset persistence.
- [x] Register `presentation.generate` in the Worker handler registry and crash-recovery allowlist.
- [x] Re-run focused Worker tests, typecheck, and build.

### Task 3: REST contract

**Files:**
- Create: `apps/api/src/routes/presentation-assets.ts`
- Create: `apps/api/test/presentation-assets-routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- `POST /research-objects/:researchObjectId/versions/:versionId/presentation-assets/generations` returns `202 {task}` and requires `Idempotency-Key`.
- `GET /research-objects/:researchObjectId/versions/:versionId/presentation-assets` returns authorized assets without private object keys.
- `PATCH /research-objects/:researchObjectId/versions/:versionId/presentation-assets/:assetId` accepts `{status, expectedUpdatedAt}`.

- [x] Write API tests for request/response schema, replay, cross-workspace denial, admin-only image/video, optimistic conflict, and absent private keys.
- [x] Run the focused API tests and verify RED because routes are unregistered.
- [x] Implement strict Zod schemas, session guard, domain delegation, 202 semantics, and stable error mapping.
- [x] Re-run focused API tests, typecheck, and build.

### Task 4: Task 11 acceptance and capability record

**Files:**
- Modify: `.taskmaster/tasks/tasks.json`
- Modify: `docs/runbooks/hermes-capability-registry.md`
- Modify: `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
- Modify: `project_index.md`
- Modify: `docs/progress.md`
- Modify: `docs/handoff/2026-08-16-hermes-2d-pet-handoff.md`

- [x] Run Domain/Worker/API focused tests and the affected workspace build/typecheck/lint gates.
- [x] Run a server candidate with one deterministic chart and one interactive HTML asset; verify identical hashes on replay, public retrieval, CSP/no-script contract, and source Claim IDs.
- [x] Keep MiniMax image/video disabled unless exact provider/model/price/secret and one administrator approval journey are available; record this as an optional blocked capability, not a Task 12 blocker.
- [x] Set Taskmaster Task 11 to `done` only after deterministic production acceptance. Production RO `OSR-2026-000019` replayed SVG/HTML hashes exactly (`8d5f8f23…c640` / `b20f83cc…1198`), served the safe HTML publicly, and enforced `presentation_not_evidence`.
- [x] Sync CURRENT docs and run docs gates.

## 2026-10-08 原生论文视频接线（已审设计，候选实现中；未部署）

### 目标、基线与复用边界

- 用户目标：正确理解论文后生成精美、自然配音的商业模型视频。Hermes 自动完成中间处理与技术审阅，用户决定最终效果和采用；不增加逐幕、逐图、逐阶段的强制人工确认。保留来源、权限、额度、未知付费终态和最终公开边界。
- 代码定位基于 canonical `7755a5ef7ab0a6bfa5184b54dd93c4054f883be4`，包含刚集成的旧 paid ART 重放兼容；该身份只标设计审查来源，不是线上版本。开始写代码前由总控确认最终生图提交及符号归属。
- 复用唯一 Nous Hermes Agent、`paper-illustration` profile、`presentation.generate`、既有队列/SourceMap/六维/Claims/Evidence/科学与艺术工具。视频模型只消费已审表达，不重新理解论文；不新增 planner、Agent、任务库、队列、数据库迁移或科研内容样本答案。
- Synclip Gateway/spool/broker、paid 恢复及 Linux 路径/权限验证已由总控集成验收；本设计不重跑未变检查。账户权限、无水印且科学正确的帧、自然旁白和真实成片仍未验收。

### 最小请求与工具字段

使用既有 `storyboard.output='video'` 和 `narrative=true` 表示原生全文叙事；仅扩展 narrative 对 video 的合法组合，不新增 nativeVideo 标志。未携带原生执行标记的旧任务、旧请求键和保存会话继续原路径。新 UI/Hermes 视频意图传入该组合，不让用户选择内部执行引擎。

| 既有工具 | 新视频分支的最小差额 | 固定不变的约束 |
|---|---|---|
| `paper_illustration_context` | 返回原设置、已理解全文、Claims/sN、可用参考与实际已实现的 frame/audio 策略 | 重用已审理解；paper_read/paper_view 核对原文，不做第二次全文分析 |
| `paper_illustration_science` / `_science_repair` | 根增加现有 `videoProduction`；scene 增加 `durationSeconds`、现有 `videoDirection` | 仍保留原 title/narration/message/domain/encoding/labels/subjects/basis/constraints；运动、生成对象、条件与旁白均须由同 scene 的已有来源支持。局部修复保留精确 scienceToolCallId |
| `paper_illustration_art` | 输入沿用 scienceToolCallId 和逐幕 layout/treatment/style；输出完整 video document 及逐幕帧、视频提示词 | art 只表达已保存含义，不添加运动事实或改旁白；新科学含义返回 science 修订 |
| `paper_illustration_review` | 核对 exact planToolCallId 的完整 document、帧提示词、视频提示词和旁白 | accepted/blocked 绑定完整候选；不能拿静态图片审阅代替动作、时序、镜头、旁白、条件和限制的审阅 |

`videoProduction` 和 `videoDirection` 直接复用 `packages/domain/src/assets/storyboard.ts` 的已有字段/枚举。新 LTX 计划按已实现的 5/10/15 秒、3–6 幕和原总时长/旁白边界规划，执行时不再默默把原生计划时长取整。艺术侧继续生成 `IllustrationBrief`；新视频 document 保留逐幕 illustration 和原 narrative，避免只剩 visualAction 文本而丢掉参考帧的已审科学设计。

`parseStoryboardDocument` 增一个内部解析选项，由已验证的 settings.narrative 与 output 共同选择新视频形状；默认旧调用的键集合和校验语义不变。`presentationStoryboardView` 从原 provenance.storyboardSettings 传该选项；`handler.readStoryboardCheckpoint` 必须去掉新分支固定按 image 解析的假设，并从已验证的 expected.payload.storyboard 取得同一模式。science/ART 物化、保存视图、checkpoint 恢复、终态采用及帧/视频父项消费均传同一模式；checkpoint 内保存的 payload、父计划模式或调用者模式不一致即拒绝，不能丢掉视频字段再当图片读取。新分支同时执行既有插图来源校验及视频方向校验，不放宽 sourceNotation/数值/空间关系规则。

不新增一个视频规划工具或最终提交接口。现有 `illustrationPrompts` 每项保持 `{sceneIndex,prompt}`，新视频项扩展 `videoPrompt`；当前新增的视频工具合同同时保存该帧实际 `renderResources`（既有 Skill id/version/upstreamCommit/resources），用于避免单幕风格改变污染其他帧的资源资格。旧图片和原 Stage A 三字段视频回执均不改写；历史缺逐帧元数据时仍保守比较原整份资源，实际消费前完整回放私有工具记录。`compileShotPrompt` 从现有 spool 私有函数变为同文件导出的确定性函数，供原生 ART/REVIEW 和 spool 共用；不能在审阅之后另写一套镜头提示词。

### 原调用链与完整消费绑定

1. 原 generations API → `persistAgentTaskCoreInTransaction` → `supportsNativeIllustration`，仅在创建合法新视频任务时附原 `initialNativeAgentExecution(...,'paper-illustration')`。请求重放先复用旧任务；不将旧 fixed-Worker/paid 任务升级为原生，也不再次扣费。
2. `createPresentationGenerationHandler` → 既有全文/Claims/Evidence 权威读取 → `prepareNativeIllustration` → `runNativeIllustrationTask`。继续每轮检查任务、权限、来源、父计划及 CAS；视频进入同一 science→art→review 循环，终点仍是私有计划。
   原 `research-run.ts` 承担自动推进：新建 run 的既有设置绑定 video 意图，原生计划和帧的技术审阅合格后直接创建下一阶段，最终停在已有 awaiting_video_review；不在原生 Agent 内发起生图/视频收费。不得把旧只授权图片的 grant 升为视频，新增 video step 要占原 validGrant 的已授权槽位，sceneLimit 从剩余预算预留该 step 后计算；不足时缩小合法计划或明确预算不足，不扩大 maxAgentTasks。
3. `finish/reconstruct` → 原 `storyboardCheckpoint/storyboardReview/illustrationPrompts` → 原资产落库。`review.candidateHash` 与真实终态 checkpoint 同时绑定完整视频 document 和工具回执；沿现有调用记录证明被审的 prompt 等于实际 prompt，不增加新 hash、账本或门禁。
4. 原 scene.image 分支共用现有原生父计划核验，允许合法的 native video 父计划。图像只消费已保存的该 scene.prompt；图像完成后的科学/像素检查仍自动执行，合格私有帧可被后续视频技术步骤采用，不新增人工按钮。
5. 原 `video.create` → `requireVideoGenerationParents` → 原 handler → `SynclipVideoSpool.generate`。保持同 RO/版本/来源、当前父计划和有序图片任务 ID；补传已核验的逐幕 videoPrompt。spool 重新用同一编译函数对照后才消费，缺失/不一致在外部提交前失败；旧任务保持原编译与恢复路径。
6. broker 继续核对图片回执、已审 PNG、保存原图及刷新后的原图字节，使用短 HTTPS 首帧链接。现有 `inputHash` 已覆盖完整 storyboard 与每帧文件；旁白、镜头和帧都绑定该输入，不另建媒体清单库。
7. 配音是同一 video.create 的执行步骤：仅使用 scene.narration 的完整顺序文本，不另手写脚本。复用 Synclip 既有异步合同及 Gateway 边界补音频适配，TTS receipt/终态按原任务与 sceneIndex 保存；字节实测时长后完成镜头对齐、音量与 mux，再写原 video 资产。未知 TTS 提交也不得重发。失败保留片段/音频/回执，不能宣称完整成片。

当前 broker 只实现 start-reference + Synclip 图片回执，且 external-narration 尚未完成音轨消费；不能因为枚举包含其他选项就宣称 start/end、paper-original、native/hybrid 或 burn-in 可执行。规划可记录未完成的 intended 策略，但执行预检须明确拒绝不支持的策略，不能静默丢掉或回退。带配音的最终交付不得把 audio-pending/静音标为成功。

TTS 先于首次视频 POST 做实际时长检查；过长不能重新打开已 accepted 的 science，也不能在旧 video.create 下换父计划。确定性执行流程为：

- Worker 核对实际音频长度与原计划后，保留音频与其绑定，返回明确的音频时长诊断；只有原 spool 中所有视频 attempt/receipt 均不存在，才能记录“尚无视频外部提交”。旧 video task 及 spool 保持终态不可支付，原任务/父项不改。
- 原 research-run owner 在 Serializable/CAS 下重验 actor/run/来源/原父项、上述零视频提交证明及剩余授权槽位，沿既有替代/修订谱系只创建一次 base-bound storyboard 修订任务，给出原声轨时长和 source-faithful 口语目标。新任务走正常幂等/收费，不调用仅用于 rejected science 的 repair 工具来重开旧终审。若现有替代路径不能保留旧任务或预算不足，私有停止并说明原因，不开新 run 或扩大 grant。
- 新计划完成真实终审后，重新判定所有帧的消费资格/复用范围，再创建一个绑定新父项和输入的 video task；迟到的旧 Worker 回调、旧 receipt 或旧 step 不得使旧任务再可提交。视频提交前始终检查新计划的音轨长度。
- 音频恢复绑定 provider + 原远端 task ID + sceneIndex + **确切 narration 文本和 TTS 参数**（已选 voice、speed 及任何实际支持并发送的字段），不能只比较文本；完全相同才能 GET/复用已成功音频。文字或参数变化是原授权/预算内的新生成，旧 receipt 保留。未知 TTS/视频提交不触发自动新付费修订；预算耗尽或未知结果保持明确私有失败/阻断，不变速强塞、静音降级或新增人工阶段审批。

### 父分镜修订与现有资产复用

新建原生视频与旧第三幕返工是两个接入验收点。当前 `supportsNativeIllustration` 排除 baseAssetId，`requireNativeIllustrationTerminalSource` 要求 context.baseIdentity=null；仅开放新建无法修复第三幕。

- 新修订仍创建原 `presentation.generate` 私有任务，保留 baseAssetId 与源身份；每轮和终态用原 `readStoryboardPlanningContext` 重验该父项，不覆盖旧任务、图片、审阅或公开版本。
- 单幕修订需要在既有 StoryboardRequest/API 增加可选 `revisionSceneIndex`，仅 video + baseAssetId 时合法。它防止“只修第三幕”的指令意外重写其他幕；自然语言要求和全量父 ID 本身不足以强制该范围。最终固定 scene 数量/顺序、root narrative/videoProduction（包括全局 visualContinuity）、全局 style/locale/figurePlan 与影响其他幕的资源选择；除目标 scene 外，科学、旁白、艺术、方向字段及已保存帧/视频提示词均须与父项原样。新 instruction 只作用于目标幕，不得借它改变其他幕的渲染结果。没有该字段的合法修订保留全量修订语义。
- `requireVideoGenerationParents` 当前要求每帧直接属于当前 storyboard，不能直接把旧帧重新登记到新父项。跨父复用只允许明确 base 链、同 sceneIndex、相同 scene 全内容/来源/原审核/帧身份，且**该帧的确切已验证 prompt 与实际渲染设置/资源版本均一致**；全局风格或资源变化不能仅靠 scene 相等复用。新计划若明确沿用父项资源，须先由原 native 完整回放证明该父 prompt/资源，而不是复制一个未经核验的 saved prompt。保留真实原任务 ID/审批/来源，不制造别名或伪造新回执；变化的 scene 必须重新制作/审阅，不能借此接受水印或错误几何。
- 自动执行保持资产 draft，不伪造 `status=approved`。新原生视频父计划以真实完成 checkpoint + accepted storyboardReview 证明技术合格；帧复用 `sceneImageReviewTaskResult` 和 `requireAcceptedSceneImageReview` 校验保存像素/来源/真实拥有任务，draft 或原 approved 都必须满足该技术条件。现有导入/历史副本的跳过分支不能给新视频自动消费背书；blocked/rejected/deleted、旧无回执或来源已变始终拒绝。用户最终采用/公开仍执行原授权与状态变更。
- 将上述判定共用在 `requireVideoGenerationParents`、资产列表的既有 canGenerateSceneImage/canGenerateVideo 投影及 research-run 自动推进。客户端可获得服务端派生的有序 videoFrameAssetIds，替代当前仅查 status=approved 的选择逻辑；这只是同一资格判定的读投影，不增加持久状态或人工审批。服务端写入前仍重新加载验证，不信任客户端布尔值/ID。

### paid / sourceNotation / Skill 兼容

- 新视频工具定义只加入新建会话；保存会话从首轮真实 request.options.tools/allowedTools 恢复原定义。`nativeIllustrationToolProfile` 必须从已保存且已识别的工具 schema/description 恢复**整个能力元组**：media 形状、scienceFeedback、sourceQuantityAnnotations/Prose/Locations、defaultPaperOriginalRef、deferDesignGuidance、scienceRepairCallIdFeedback、sourceNotation；新建与恢复视频须得出同一个元组，不能仅修 sourceNotation。新视频定义的显式匹配增加到既有 profile 判定中，不另存一份可漂移标志；未知定义不得猜测升级。历史 image 定义仍走原来的各项精确判定。
- 原 `savedResult/reconstruct/finish` 保留 `7755a5ef` 的 **current-first → verified saved 完整 prefix/exact call → 唯一 v19 Execution fallback → 整 receipt deepEqual** 边界。fallback 只处理已识别资源差异并恢复调用前状态；science profile 不回退，不信任/拼接 saved prompt，不把历史 tool output 当成新模型结果。视频新分支不得扩大 fallback 的资源版本或适用工具；新增状态也必须在重建失败时一并恢复。
- sourceNotation 只复用已收敛的通用表达式识别；不修改 stripStructuralReferences/scientific-comparison 或放宽科学关系。新视频参数沿现有 science/art 物化边界传递，旧模式接受/拒绝集合及原结果字节保持。
- 不扩大 maxTurns、重试、原费用或未知终态恢复授权。供应商/API/音色选择留在 Gateway/执行器，Hermes 文本不得携带 key/URL 或调用外部 API。

### 准备申请的文件与精确符号

| 分组 | 文件 / 符号 | 写入界限 |
|---|---|---|
| 入口与终态 | `packages/domain/src/agent/native-agent-execution.ts`：supportsNativeIllustration、requireNativeAgentExecutionAuthority、requireNativeIllustrationTerminalSource、nativeAgentTerminalResult；`agent.ts`：persistAgentTaskCoreInTransaction 的既有路由调用 | 保留 profile/队列/收费/CAS；新请求与修订明确分支，不改变旧 marker |
| 自动推进与资格 | `packages/domain/src/agent/research-run.ts`：既有新 run/故事板设置构造、任务预算、storyboard/scene_image 完成后的 advance 与 authority；`assets/presentation-asset.ts`：既有资产资格投影；`assets/scene-image.ts`：现有只读 review 校验调用 | 只对新绑定 video 意图和授权的 run 自动推进；草稿技术可消费不等于用户采用/公开 |
| 数据形状 | `packages/domain/src/assets/storyboard.ts`：StoryboardRequest、parseStoryboardRequest、parseStoryboardDocument、presentationStoryboardView；`video.ts`：requireVideoGenerationParents | 复用现有类型/来源/父项校验；仅增加视频叙事字段与明确的局部修订范围 |
| 原生工具 | `apps/agent-worker/src/native-agent/illustration-task.ts`：工具 schema/description、nativeIllustrationToolProfile、createNativeIllustrationMaterializer.call/reconstruct/finish、runNativeIllustrationTask | 同一个 Agent 和 science/art/review；在生图 owner 最终提交之后才获写权 |
| 确定性物化 | `presentation/illustration-planner.ts`：materializeIllustrationScience、materializeIllustrationArt；`illustration-review.ts`：materializeIllustrationReview/parseIllustrationReview；`storyboard.ts`：现有 sourceBoundAnimation/materialize 的兼容投影 | 只补视频字段，复用既有科学绑定；不改来源/表达式识别函数。兼容动画元数据不能当商业运动已验证 |
| 消费 | `presentation/handler.ts`：readStoryboardCheckpoint、prepareNativeIllustration、原生父计划/scene.image、video.create；`host-video-spool.ts`：输入类型；`synclip-video-spool.ts`：compileShotPrompt/generate；`infra/synclip-video/broker.mjs`：已有逐镜执行/音轨组装 | checkpoint 模式全链一致；共用原生父计划核验，提示词/帧/旁白同源，保持 paid 恢复及资源边界 |
| API/意图 | `apps/api/src/routes/presentation-assets.ts`：storyboard 请求 schema；`apps/web/components/hermes/HermesPresentationAction.tsx`：既有新建/修订视频请求；对应 API 客户端类型 | 新视频默认原生全文叙事；仅局部修订增加 revisionSceneIndex；UI 文件须由总控与生图 owner 定序 |
| 音频真缺口 | `packages/ai-gateway` 的 Synclip 音频适配与对应 broker 消费 | 单独安排后续写权；仅补 GET voices / POST audio / 同任务轮询与有界音频读取，不建立第二套 TTS 服务或队列 |

### 必要验收与发布边界

1. 无外呼定向回归：旧 paid science/art/review 逐项重放相同；v19/v20、sourceNotation 及整个能力元组不漂移；新视频首次/恢复/checkpoint/父项消费识别相同合同和解析模式；拒绝伪造 review ID、改旁白/运动/帧提示词、父项或来源变化。
2. 原 handler 合同：新 narrative video 真进入原生 Agent，终审完整计划；scene.image 和 video.create 消费同一计划、同一顺序；跨父复用同时比较源/帧/prompt/渲染资源；单幕修订拒绝改变 scene 数量/顺序、全局连续性/风格和其他幕 prompt；中间技术审阅不新增人工确认。
3. 执行合同：音频时长/策略先检；长音频只能由原 run owner 创建一次有预算的新父项修订，旧 video task 始终不可支付，资格重验后新任务绑定新父项；文本相同但 voice/speed 改变不能复用旧音频；成功/失败/未知 TTS 与视频都保留 receipt，恢复不重复 POST；最终 result 不再为 audio-pending。
4. 按改动范围运行 Native/Domain/API/Worker 的既有定向测试、类型检查及对应 Linux CI。复用未变视频接口/路径/权限证据；不为了本设计重跑旧验证或模型任务。
5. 独立 High 先审本设计与新增差额，协调写权后才实施；发版复用原发布/回退流程。真实论文的科学与艺术、连续运动、语音自然度和最终用户采用仍须以实际产物验收，计划/CI 不能代替。

### UI 接线与 Linux 最小验收

普通用户复用既有 `POST /research-objects/:id/hermes-runs`，保留同一意图的 `Idempotency-Key`，请求如下（ID 替换为用户当前已上传论文的真实 ingestion task）：

```json
{"ingestionTaskIds":["<ingestion-task-uuid>"],"generation":{"profile":"visual-narrative-v1","maxAgentTasks":9,"locale":"zh","style":"auto","instruction":"为未读论文的人讲清主旨、机制与成立条件，形成自然旁白和连贯镜头的私有讲解视频。","output":"video"}}
```

同视频意图已存在时读取既有 run，不能换键绕过 failed/unknown；已审图片意图的论文理解可复用，原图片 grant 不升级。中间 draft 计划/帧按真实技术回执自动推进，最终沿原 `awaiting_video_review`/资产 review 入口由用户决定采用。

既有资产列表 `GET /research-objects/:researchObjectId/versions/:versionId/presentation-assets` 新增可选、有序 `videoFrameAssetIds`；原 `canGenerateSceneImage/canGenerateVideo` 共用资格校验。客户端不要再单凭 `status=approved` 选帧，也不要制造新父项别名。管理员手动沿原 generations 路由提交 `kind=video`、当前 `sourceClaimIds`、`video={profile:"content-driven-v1",storyboardAssetId,sceneImageAssetIds:videoFrameAssetIds}`；普通用户仍由 Hermes run 自动执行。现有 `videoEnabled/sceneImageEnabled` 和用户角色边界保留。

总控复用现有视频 CI 执行 `node --test infra/synclip-video/broker.test.mjs infra/synclip-video/image-reference.test.mjs`，并核日志确认 **existing ffmpeg decodes, aligns and muxes real synthetic media through the narrated broker path** 实际运行；`CI=true` 下缺可用 ffmpeg/ffprobe 直接失败，不跳过，既有 sudo 步骤须保留该环境值。另一平台用例 **result directory and files are worker-readable despite restrictive inherited permissions** 需 Linux 权限环境。现有 codec 需要 MP3 decoder、PCM s16le、AAC、libx264；合成测试另用 libmp3lame 造可解码测试音，复用 loudnorm/adelay/apad/alimiter/scale/pad/fps/setsar。测试音只验证编码/时序，不证明自然人声或真实论文视频质量；无需本机安装新二进制或新建 workflow。

### 设计审查与实现检查点

2026-10-08 独立 High（Avicenna，`01a11988-3321-7e33-b76b-e771098c92a7`）对照上述固定源码身份审查并复核增量，结论为 **Bounded design GO**。四项 P2 已闭合：完整能力元组恢复、长音频后的权威修订/旧任务不可支付、局部修订与跨父复用的全局 prompt/资源约束、checkpoint 到消费的解析模式传递；未发现新增 P1/P2 设计阻断。该结论只批准进入协调后的实现，不证明代码、原子防陈旧提交、回放相等或真实音画已完成。

总控已分配 Native/Domain/Worker/自动推进/API 与 Synclip 音频适配的实现写权；独立候选树已合入上述最终生图基线。当前不改 Web、CI、全局状态文档和生产，不执行真实模型/视频/TTS 请求；旧 unknown/paid 任务继续保留。

实现检查点：`e660e5bf` 完成视频 science/art/review 形状；`5f0a80e9` 修复 handler 旧 image-only 权限阻断，32/32 离线真实 handler 回归且 High 闭合。`c3ae6f68` 是音频适配提交（179/179、source/test TC、lint、独立 High GO）。`bf627c59` 完成显式 video intent、来源复用、九任务预算、私有技术草稿自动推进、完整父链回放、逐帧资源与有序帧投影、TTS 时长诊断及追加式修订，以及完整解码/音视频时间线校验。High 新发现的完整 video-parent identity 与 storyboard-only identity 错配已修正并 RED→GREEN 57/57；Domain 父项/投影 175/175、Native 兼容/局部资源 13/13、旧 v19 paid 重放 15/15、API 合同 7/7。代码候选的 High 增量已收口；未部署、无真实模型/TTS/视频请求。总控从已集成 7755 基线顺序取上述四个新实现提交，不重取历史 828/ec/a4 或合并旧交付线；UI 调用及 Linux 验收按上一节接线。

最终增量 High：Carson 闭合完整父身份 P1、逐帧资源及原 Stage A 回放 P2；Avicenna 闭合完整 PCM 解码、实际音视频时间线与 stdout 尾部样本 P2。Worker 定向 67/67、Domain 父项/投影 175/175、run-owner 57/57、API 7/7；Domain/Worker/API TC、定向 lint、docs:lint/audit:docs-sync、脚本语法与 diff 检查通过。扩大到既有大型文件的 lint 仍有 43 项未改行历史错误，未扩入本次修复，不能称全仓 lint 通过。

上一候选的本机音轨 broker 观察为39通过、2项因无可用 ffmpeg/ffprobe 和非 POSIX 环境跳过；完整 PCM 解码按 stdout 全部排空及 child close 后的样本数计时，不另落 PCM 文件；最终分别核对真实帧时间线上的视频/AAC 起点、跨度与缺口。2026-10-08 总控随后确认 d3fa 视频 push CI 全success，broker/reference 114/114、0skip，真实 codec/mux 与 worker-readable 两项实际执行；本轮复用，不重跑，也不冒称真实生成音画已合格。执行仍仅 start-reference + scene-artwork + external-narration + 无字幕；sidecar/burn-in/native audio/start-end 在付费前拒绝，音色来自当前目录且须支持旁白语言。未知收费与旧任务/回执继续保留。

共享 Skill 依赖：`createNativeIllustrationMaterializer.reconstruct/finish`、`replayNativeVideoPlan`、handler `readVerifiedVideoPlan`、Domain `requireNativeVideoSceneImage` 校验真实完整回执/逐帧版本资源；当前候选按 Skill20，视频不开放 v19 fallback，原 Stage A 三字段回执按原 context 恢复。20→21 必须先保留 v20/v19 paid 的 science/plan/review/render 消费语义；不能只检查 pixel checkpoint。详细证据在忽略目录 `tmp/synclip-video-contract/`；Web、CI、CURRENT/progress/index 和生产由总控定序，本会话不改共享 Skill、`gateway.ts`、`provider.ts` 或 Worker `index.ts`。

### 2026-10-08 Synclip host 更新差额（只读实核／候选设计）

历史只读观察（17:48）：视频服务当时指向独立 bundle `ca9405869cc85583b242f4e066d90a2f56c168e2`，配置为 v1／inline，无 audio；Worker 已有 inbox rw／results ro 挂载，共享 Key 只核元数据。证据 `tmp/synclip-host-readonly/server.json` 不再代表当前 host，更不是发布时的空闲证明。

18:42 并行期刊发布后的定向只读确认：host source-id 与应用同为 `42fe1a974fb62e5a868d3a4f1da812065cb148b1`，配置已 v2／synclip-receipt，adminModelsEnabled=false、无 audio；timer enabled/active、oneshot 当时 inactive，renderer digest 与早先完全相同且仍存在。当前 bundle 无音频 JS、无 previous；其 source installer 仍只支持初装并拒绝已有安装。证据 `tmp/synclip-host-readonly/after-journal.json`、`current-paths.json`。后续只补当前 v2 的可恢复更新与音频闭包，不重做初装或切回 v1；旧 v1 仅保留兼容保护。应用/Native 最新基线与并行发布排程统一查 CURRENT，不根据本节历史快照操作。

现有 renderer `sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f` 已含 FFmpeg／ffprobe 5.1.9；MP3/H.264/AAC/PNG decoder、PCM s16le/AAC/libx264 encoder、MP3/s16le/MP4/concat 格式及当前 mux 所需全部滤镜均只读列举成功。合成 CI 所需 libmp3lame 也存在。不需下载安装二进制；尚未在生产执行实际编码、TTS 或视频请求。

当前可恢复更新缺口在 `infra/synclip-video/install.sh`：已上线 42 的该脚本仍只允许初装，已有 config/service/timer 即 exit69；当前 bundle／provider 根未发现可复用的更新入口或 previous 快照。复用 `infra/synclip-image/install.sh` 已有 provider flock、不可变 bundle、previous 备份、原子 config 与失败回退方式，不另建发布服务。精确候选范围为视频 `install.sh`、对应 `install.test.mjs` 和本计划；不改模型 adapter、Web、CI 或共享 Skill。

拟议增量：保留原初装参数，已有安装要求 `--defer-timer`；升级在 provider FD8 下操作，不覆盖总控继承的生产 FD9。已有 v1 的固定 spool/key 路径和 renderer 迁移到 v2/synclip-receipt，默认 adminModelsEnabled=false 且无旁白；已有 v2 则保留已配置的 audio/admin。允许显式 `--config` 选用该 provider private 目录下 root 0600 的完整非秘密配置，严格验证固定挂载/Key 路径，不推断音色或管理员权限。只导入运行闭包、验证配置，绝不运行 broker 或读取 Key。

切换前保存原 service/timer/config/.ready 及启用状态；移除旧 ready、原子换 config、安装匹配 unit 并 daemon-reload，defer 期间 timer 停止且 disabled，待总控完成配对应用发布后显式激活。ERR/INT/TERM 仅恢复原组件配置/状态，不杀运行任务；FD8 忙则原样退出。显式 `--confirm --rollback <candidateSHA> --defer-timer` 沿同一锁恢复 previous 配置/units，但 timer 始终 disabled、live ready 缺席；配对应用和确认 spool 兼容后才恢复原 timer 状态。previous 不覆盖、不消费，半恢复后可重试同一 rollback。所有 inbox/private/结果/付费回执保留。发布前总控须阻止新视频准入并等待执行器自然空闲；单机安装锁不能阻止 Worker 写 inbox，不能把观察时空目录或 timer inactive 当作排空证明。

原 High 增量指出 v1 回退兼容 P2：v1 不能安全消费新格式或留存终态目录，任何重新激活前 inbox/private 必须无 UUID 目录，包含过期/已终态作业；非空时只恢复文件，保持 timer disabled、无 ready，绝不清理回执以满足条件。自动失败恢复仅在完整恢复成功、旧应用仍配对且满足此兼容条件时恢复原 timer；显式 rollback 始终延迟激活。上述语义已纳入最小设计，最终实现仍须复审。

原 High 已对这一设计差额最终 GO，无新增设计 P1/P2；此结论不替代脚本实现、fixture 或实际发布验收。脚本与测试分别由原音频 worker／Domain worker 在两文件范围实施，主线程只维护操作说明与整合，不重复修改两个实现文件。

本地实现检查点：升级／显式回退脚本候选已通过原 High 最终有界 GO，无新增 P1/P2。原初装脚本对既有安装 exit69 的 RED、转义 v1 兼容 RED 和九边界重复恢复 RED 均已保留；语义判定与不重入修复已完成。最终受影响范围 13/13（4组＋9边界）GREEN，复用 19 个未变组覆盖全部23个根组；不是一次最终全套重跑。日志与源快照比对在 `tmp/synclip-host-readonly/install-green.log`，source delta 仅 recover，当前源码与实测 snapshot 相同。禁止据本地候选直接激活生产；17:48/17:53/18:42 仅只读服务器元数据及固定镜像能力，无 Worker exec／服务写操作／模型请求。

这轮仅授权只读服务器和本地候选，禁止安装/重启/新模型 POST。现有 image installer 隔离 shell fixture 复用于验证：已有 v1 升级、配置/旁白保留与显式配置、忙锁/坏闭包/不安全路径拒绝、延迟激活、失败原子恢复和可执行的 previous 回退；新增断点覆盖 config/service/daemon-reload 阶段失败及 INT/TERM、半恢复重试、FD9 保留，不重跑未变模型或 broker 套件。

#### 前置检查（供总控未来发布，不在本轮执行）

1. 按 [部署手册](../runbooks/deployment.md) 使用干净、已推送、精确 CI 通过的完整 SHA；同源 Gateway dist 已构建，生产 FD9 事务仍由总控持有。`HERMES_VIDEO_ENABLED` 控制 API/Worker 视频能力；受控维护窗口中停止新视频准入，等待旧 Worker 与 broker 自然排空，不能用杀进程或仅停 timer 代替。
2. 复用已实核 renderer digest。若变更镜像，先补相应 FFmpeg 实编码证据；本次不新下载、不换镜像。CI 的真实 mux 与 Linux 权限两项仍须实际运行。
3. 完整旁白配置只在 provider 的 `private/host-config.json` 准备，root 0600、无 symlink、无 Key 内容；包含固定 spool/Key 路径、v2/synclip-receipt、显式 audio provider/voice/speed。音色必须来自当前 Synclip 目录且支持所用语言；LTX 管理权限须另有账户证据，不能由生图成功推定或让 installer 默认开启。配置默认安全迁移并不代表旁白已启用。

#### 执行步骤

1. 总控在既有生产锁与维护窗口内，从 `/opt/openscience-releases/<candidateSHA>/infra/synclip-video/install.sh` 执行 `--confirm --source /opt/openscience-releases/<candidateSHA> --renderer-image sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f --config /opt/openscience-synclip-video/private/host-config.json --defer-timer`。只迁移 runtime 时可不传 `--config`，此时不会自动启用音频或 admin。不要从 `/opt/openscience/infra/` 猜源路径：实核该处无 installer。
2. 确认 host 切换成功、timer disabled、无 live ready；保留该 bundle 的 `previous`。沿原正常应用发布流程切换匹配 Worker/Native Skill，应用失败先保持视频 timer disabled。
3. 只有账户权限、voice、应用/host 合同与旧 spool 恢复条件均确认后，由总控显式 `systemctl enable --now openscience-synclip-video.timer`。安装器本身不调用 broker、不生成媒体。

#### 回滚步骤

1. 再次停止视频准入并等待 FD8 空闲；使用本次候选脚本执行 `--confirm --rollback <candidateSHA> --defer-timer`。它恢复该候选的 previous 配置/units，不消费 previous，不触碰 Key/输入/结果/回执；重复运行允许完成半恢复。
2. 显式 rollback 后 timer 始终停止且 disabled、无 live ready。恢复匹配的旧应用；如果 previous 是 v1，inbox/private 中任何 UUID 目录都会阻止再激活，包括已终态目录。保留这些作业，由总控判断兼容恢复，不删除或重发以跨过阻断。
3. 如果 config/service/daemon-reload 或信号中断造成部分恢复，保留现场与 previous，排除具体文件/服务错误后重试同一 rollback；恢复失败不得重新启用 timer。

#### 验证命令与观察边界

- 复用 `systemctl show openscience-synclip-video.service openscience-synclip-video.timer` 的指定状态/path 属性、`stat` 的 owner/mode、Worker 指定 Mounts 与 bundle source-id，核对同源完整 SHA、inbox rw/results ro 和受保护文件；不要打印 Environment、config 全文或 Key。
- 激活后仅检查既有 `.ready` 的 provider/revision/accepting/narration 元数据及新 Worker 的对应配置。installer/心跳可用、codec 列举和合成 CI 均不证明自然人声或论文视频质量，真实成片仍沿原任务与私有审核路径单独验收。
- 总控在现有视频 CI 的 Gateway build 之后增加 `node --test infra/synclip-video/install.test.mjs`；该 fixture 不使用真实 Docker、systemd、Key 或供应商，无需 sudo／新依赖。本地 shell 行为覆盖和真实 codec/mux／POSIX 权限验收分别判断；先前 Linux 缺 FFmpeg／ffprobe 的失败已由总控修复，d3fa CI 为114pass/0fail/0skip，无须重跑本机套件。

### 2026-10-08 UI 接线新增差额（总控优先指派）

UI High 发现既有 workspace.guide 未接受／保存 `researchRunDraft.output`，现有 run 查询又会把同一论文的图片与视频意图串线。沿原入口补接：明确整篇论文视频请求的 draft 仅新增可选 `output:"video"`，图片与旧草稿省略；它不是 grant 或任务启动。既有 `GET /research-objects/:id/hermes-runs?ingestionTaskId=<uuid>` 新增可选 `output=image|video`，省略按图片；视频只找显式 video，旧无 output／null settings 仍作图片。响应 `{run|null}`、actor/RO/原 source/版本/权限与 unknown/幂等保护保持，不新增端点、队列或模型链；Web 类型与消费由 UI owner 更新。

主线程负责 `workspace-guide.ts` 和其既有测试，原音频 worker 负责 Domain `getExistingHermesResearchRun`／API query schema 与直接测试，Carson 仅审此增量；不碰期刊文件、共享模型或生图 Skill。Guide 已实际 RED→GREEN 21/21，Domain 意图查询 26/26，真实 API handler 23/23；包括同源双意图、actor/RO/source/profile 隔离、原版本/grant/key 不变、legacy null／无 output／显式 image、跨两页与短页、failed/unknown 不跳过、非法值及无权限拒绝。只读 `narrativeSettingsView` 补齐返回兼容，不改变保存记录或严格执行校验。Carson 对 guide 与 Domain/API 差额分别最终有界 GO，无新增 P1/P2。Domain build、Worker 源码与 API 现有类型检查、guide scoped lint 均0；Domain原20项未改行 lint 未扩修。完整日志 `tmp/video-intent-boundaries/`；当前新 UI／真实模型效果未验收，host 候选和上述验证独立保留。

上述六文件后端差额独立提交 `16003486f455198518784e2034af4fde402add57`，可先由总控／UI接入；不是生产发布身份。本计划与 host 两文件另交付，既有四个视频实现提交和9914文档已由总控逐项全等集入，不再重复取回旧分支。

2026-10-08 总控后续确认：后端差额与 host `3603a426` 分别全等集入 `68edf1cf`／`92bfaf0c`，已推送代码 `0b71ef9f09e64747e6cb66a4ca34381d4c331d2c` 的 push／PR 六项媒体、视频和期刊 CI 全成功。Linux 实际执行 guide21、intent-query26、API23、host fixture32（23个顶层组含子项）及 broker/reference114，均0skip，真实 codec 与权限用例已运行。本轮复用总控证据，不重新验 CI；尚未部署该候选或调用供应商，不能据此验收真实音画质量。

### 2026-10-08 LTX 原生声音／完整成片合同核实

本轮只读官方公开文档与既有源码／回执，不发付费 POST、不读取 Key、不安装或重启。匿名 GET 已取得 Synclip 当前 Admin／Audio 文档 HTML及其公开文档组件、i18n；静态解析不执行下载的脚本。原始来源和字段摘录在 `tmp/synclip-contract-audit/{docs-fetch,api-contract-extract,api-cards}.json`。网页工具无法读 dev 页面时的错误不解释为供应商 API 故障；猜测的 `/dev/docs/tasks` 页面404也不是 `/v1/tasks/:id` 调用结果。

- **原生能力确实存在。** [Synclip LTX 2.5介绍](https://synclip.ai/blog/ltx-2-5-ai-video-generator-synclip)宣称联合音视频与原生多镜头，且明确模式／套餐影响可用控制。[LTX 官方提示指南](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide)支持用引号给出台词，并指定语言、口音、切镜和声音连续性。不能把现有 external-only 实现说成 LTX 只会生成无声单镜头，也不能仅因没有独立台词字段就断言 prompt 不能产生旁白。
- **Synclip 已公开的可调用合同有边界。** [当前 Admin API](https://synclip.ai/dev/docs/video-admin)把 `ltx23/ltx23fast` 标为 LTX 2.5；LTX 时长仅5/10/15秒，`audio_urls/video_urls` 是 Seedance 多模态输入。轮询示例只给 `output.type=video`、视频URL和缩略图，没有音轨存在、逐字转录或词级时间戳保证；有声与编码格式仍须看实际返回文件。[上游 LTX API](https://docs.ltx.io/models/ltx-2-5)另有 audio-to-video／自动时长等能力，不能直接套进 Synclip 包装接口。其 native multi-shot 是一次短片内多次切镜，不等于当前 API 一次返回我们的24–90秒论文成片。
- **external-narration 的依据是可控性，不是原生音频不存在。** 分段／总时长和旁白来源是两个独立选择：15秒上限解释为什么长片要拼接，不能证明旁白必须外置。当前方案可把同一份已审 `scene.narration`、目录中的 voice 和 speed 单独绑定回执，先测实际声音时长，再付费生成对应镜头，便于跨片段保持同一声音和独立修订。它没有证明实际音频逐字正确，也没有证明声线更自然；仍须听验专名、数字／单位、漏读与表达。现有对齐是按幕和实际流时间线，不是逐词与动作的语义同步。
- **明确哪些步骤可以省。** 若每段原生结果已满足该段已审台词、声音偏好与科学内容，则 `prepareAudio`／单独 TTS 时长解码和 `muxSynclipNarration` 的替换音轨可省；多段原生音视频仍能保留声音后拼成24–90秒片，只有单请求已覆盖整片时才可再省 concat。符合交付编码／尺寸／帧率的片段可评估视频流直接复制，避免每幕都缩放重编码。当前没有这种合格 LTX 实片回执，暂不删除已审处理或增加模式；下载完整性、真实音画审阅与来源绑定仍需保留。本地 FFmpeg 是媒体检查与编辑，不是再次运行 LTX 扩散模型；媒体解码、视频重编码与云模型生成也不是同一步。
- **已知实现取舍。** `compileShotPrompt` 明确要求旁白外置；`requireSupportedPlan`拒绝native模式，这是项目实现限制。`muxSynclipNarration` 使用 `-map 0:v:0 -map 1:a:0`，原生人声、氛围声和音乐均被独立TTS取代；当前不能宣称保留了供应商的完整音效设计。将来若保留或混合原生轨道，须先确认不会引入重复人声或错误叙述，本轮不改该已审实现。

| 字段／证明 | 最近已有证据 | 具体未决项 |
|---|---|---|
| `adminModelsEnabled`／账户 Admin 能力 | 18:42 host 元数据为false；Key只核存在与0600。成功图片不证明视频Admin权限 | 分别核实账户实际 entitlement 和有权限的显式启用；不把false改true当验证 |
| `audio.provider` | 最近实核audio整个字段缺失；已审架构固定Synclip | 后续保护配置中显式填写，不新增供应商／TTS服务 |
| `audio.voice`／语种／试听 | [Audio API](https://synclip.ai/dev/docs/audio)要求有效 voices ID，提供 languages／preview_url；文档样例不是本账户目录 | 获取当前账户有效ID与所需zh/en支持并实际试听；本轮未选择声线偏好 |
| `audio.speed` | 最近配置缺失；文档描述正倍率，样例用数值 | 明确实际采用值并听验；参数表把type写string、各语言示例用number，现adapter沿数值示例，尚非真实接受证据 |
| 原生 LTX 声轨／旁白成片 | 已知321b任务阻断于分镜、无Synclip POST；H3 hook原片属于另一供应商 | 没有可证明本账户LTX音轨、准确旁白或整篇成片的真实回执，不以模型宣传或codec CI替代 |

此表为当前 external 实现的未决配置；若后续批准原生旁白路线，独立 TTS 的 voice/speed 并非所有视频都必须配置的字段。

本轮保持已审 external 路线，不启用新模式；权限待真实核实，音色／语速偏好未代选，保留旧 paid／unknown。仅此合同与取舍说明更新，不改 Web、共享 CI/CURRENT、Gateway／Worker 工厂或检索能力。

Avicenna 对上述合同差额独立 High 复核为 GO、无 P1/P2；复核只读，未重新执行模型、codec 或 CI。

### 2026-10-08 账户权限／目录只读前置核实（20:06–20:09 CST）

复用 Chrome 已有登录态，通过正常 Audio Studio 页面观察已经发出的 `GET /api/users/profile`、`GET /api/voices` 响应，仅提取权限与目录字段，不读取 Cookie／认证头／Key，不调用猜测的私有路径。网页资料明确返回 `tier=free,isAdmin=false`；但网页账户尚未与服务器 Key 归属关联，**这不是服务器 Key 无 LTX 权限的证据**。

目录 HTTP200、共77项、`hasMore=false`；其中zh16项／en40项，均标为active且UI id等于providerVoiceId，没有同时标记zh+en的音色。完整56项实际ID／名称／Premium标记在忽略证据 `tmp/synclip-contract-audit/account-voices-readonly.json`。示例：中文 `Chinese_male_yunxia`（文博）、`Chinese_female_xiaoxiao`（静雅）；英文 `English_male_michael`（Nathan）、`British_female_emma`（Olivia）。这些是**实际网页目录ID，尚非服务端 Key 的 `/v1/voices` 有效ID证明**，不直接填入配置。相关56项原始 `sampleUrls` 全为空数组，未取得已有试听链接，未点试听／生成或代选偏好；Premium标记不证明本账户的额度、权限或单价。

[官方 Audio 文档](https://synclip.ai/dev/docs/audio)定义只读目录 `GET /v1/voices`；[Usage & Limits](https://synclip.ai/dev/docs/usage)定义 `GET /v1/usage`，返回Key所属账户余额和在途任务数，未给Admin／LTX权限字段。[General](https://synclip.ai/dev/docs)将收费关联到生成任务完成，目录查询不创建生成任务，未列独立查询收费；这不是本账户已认证GET的计费实测。本轮没有手工调用上述v1接口。当前公开合同及既有客户端未找到可只读核实Key的LTX entitlement接口，不能用付费POST来替代。

20:06 CST通过既有SSH wrapper只读配置字段和文件元数据：配置root:0600、`adminModelsEnabled=false`、整个audio字段缺失；实际broker仍为既有运行包，包内没有 `synclip-audio-api.js`；入口盘点仅限provider根目录及其bin/scripts的.sh/.mjs文件，未见查询入口。共享Key仅stat确认root:root／0600／普通非symlink文件，不读取内容。短证据为 `tmp/synclip-host-readonly/audio-preconditions.json`，生产没有改动。源码虽已有 `SynclipAudioClient.listVoices()`，它需要调用方提供认证；已装broker CLI只执行队列并更新心跳，不能为查目录启动它，且本轮不写临时凭据脚本绕过缺少只读入口的问题。

| 激活前置 | 当前确切缺口与可执行接续 |
|---|---|
| Key权限与账户对应 | 通过供应商已有控制台／私密交接核对**服务器现用Key所属账户**及Admin/LTX授权；网页登录用户非Admin、图片成功、配置false均不替代此证明，不擅自新建或替换Key |
| 受保护的只读API查询 | 复用现有Gateway客户端与host受保护认证边界，先取得服务器Key实际 `GET /v1/voices` 和 `GET /v1/usage` 结果；当前已核Synclip入口没有独立只读CLI可直接运行，不启动会消费spool的broker，不新建凭据脚本 |
| 当前external的声音配置 | `audio.provider=synclip` 已定；voice须由实际API目录确认、匹配旁白语言，speed与音色偏好仍未选定。网页目录没有可复用试听链接；不以宣传或ID名称验收自然度 |
| 已审候选／host激活 | 总控沿已交付的defer升级／回滚安装器切换同源应用与含audio客户端的host bundle，保护旧队列与回执；填完受保护配置并取得权限证据后才显式启用，当前未执行安装、重启、配置写入或付费请求 |

上述前置不新增模式、供应商或收费重试。旧paid／unknown未触碰，媒体／CI测试继续复用既有通过证据；真实声音与论文成片尚未验收。

Avicenna独立High仅复核本节及两份短证据，GO、无P1/P2；未运行模型、SSH或测试。
