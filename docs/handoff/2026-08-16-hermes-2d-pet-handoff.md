# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** PR #86 工作流已部署；用户否定卡片作为图解交付，认可后续生成式科普插图方向。41秒连续配音CPU动画样片已在ECS渲染并通过公网播放验收，完整多模态产品尚未完成。

## Version tuple and production truth

- Worktree: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch: codex/product-workflow-design；本批base docs HEAD: 663e6a0，最新HEAD以Git为准；application HEAD: 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7。
- Production source / active / public /__release: 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7；rollback: c07c8d15e5ba3b722577f42d6ad72af8c83189fe。
- Core/search migrations 36/36、2/2；13 容器运行，目标服务健康；canonical journal cleared、retention completed，公网/loopback 通过。
- 根目录旧 main b9616cb 及既有 memory、.Codex 和用户资料未动，不是开发/部署源。

## Product scope and delivered work

- Research Intelligence Tasks 1–12 已完成，不恢复旧 MVP next action。用户要求功能/展示优先、成熟方案与现有基座优先、分段验收；允许自主下载 PDF 和选择安装必要开源方案，暂不支持上传音视频理解。
- 前批 PR #78、#81–84 已整合同事 18 个前端文件、优化 profile/settings/layout、修复 Hermes 入口和权限。frontend/nanqing 仍为 e5db5ae，未有新增；每日 10:00 巡检已有自动任务，勿重复创建。
- PR #86：RO 的 Diagram 页支持人工主张创建、精确版本/Claim 选择、生成、进度/恢复、认证私有预览与明确批准；加载失败、跨版本异步结果、只读角色/版本、5xx 幂等与审批冲突已处理。
- Hermes 确认后继续编辑会带入源 PDF；Editor 读取原 manifest 并按 logicalPath 合并，避免提交时遗漏旧附件。未确认或外部研究的任务不能附入。
- Claim 修改/删除在原事务中使关联 draft/approved 图解 rejected；生成器 v2 完整换行、不再将主张称为已验证，8192 高度超限明确失败而不截掉限定条件。v1 安全读取兼容保留。
- 摘录选择不再让头尾/重叠关键词消耗中段额度，保留 24,000 正文字符预算。当前不等于机制图、生成式图片、视频或语音闭环完成。
- 用户最新确认：RO凝练论文，图片须通过场景/结构/机制生动解释；原始图表/代码是可追溯Evidence而非自动证明。推荐仓库非强制，按质量与成本选择；先做真实科普样片，再固化RO/Hermes能力。
- 本批复用已有生成插图、Playwright/Chromium与本机中文TTS，FFmpeg采用项目局部工具；无MiniMax调用。成片与可编辑分镜置ignored `apps/web/test/visual/out/science-video/`，已部署独立演示，尚未接入任意论文自动生成。
- 成片`d2nn-science-explainer.mp4`：46.25秒、1280×720/24fps、H264+yuv420p/AAC、1.78MB；主线程全片解码exit0、本机Chromium首播/seek成功、390px无溢出，查看五层/干涉/探测画面。证据validation/playback-validation JSON；约21秒编码为文件时间估算，非性能基准。

## Fresh acceptance evidence

- 淡彩手绘候选：已生成并检查五层/十探测区原创全景，借鉴story-to-handdrawn-video的完整构图与线稿显色，复用Canvas/Chromium。配音保持已接受v4，五场景本地预览通过；服务器发布待执行。

- 历史独立视频演示：source617ed1ca4365d67c1e363b200e14fd39ef4f9f57，run617ed1c-20260905T101000Z；用户认可B口语方式后，五段Qwen/Serena旁白总长37.12秒、生成耗时91.82秒，新视频40.00秒/4,422,573bytes/720p，ECS渲染20.52秒。字幕按场景真实音频时长显示，手机另有同步可读字幕；章节0/7.541667/16.291667/25.75/32.166667。公网资源200、Range206、实际首播/跳转、手机字幕内容与无横溢出、完整解码均通过；应用390afc0/回滚c07c8d1保持不变。此前6a1b848-20260905T081000Z的46秒系统配音版保留，可按runbook回退；新增版本CI待完成。

- 独立服务器演示已部署：source 6a1b848a3df109098e5f1b9721e6c4df06c2c6d0，run 6a1b848-20260905T081000Z；公网 /demos/science-video/d2nn/。复用ScanSci Chrome151完整headless bundle，CPU渲染22.80秒生成46.25秒720p/H264/AAC视频（4,814,309 bytes），无新增付费API调用。全片解码、五项资源200、Range206、实际首播/章节seek、390px无溢出及零页面异常通过；内部路径最终404（input/先308规范化）。应用release仍390afc0。

- 全仓 build/typecheck/lint/test 通过；Web491+Node5、domain568、worker502、API130；独立 security/domain/UI/renderer/extractor 复审无剩余产品阻断。
- 本地 browser98/99 后修正唯一测试时序问题，图解9/9复验；main CI 33947575816 完整99/99与 Hermes 专项全部 GREEN。原有 search storage 集成8例需独立DB，未在本地 unit 环境执行。
- ECS 精确完整 build、Parser16-case、BGE runtime、ScanSci 真实 OA/Worker、迁移、内外网健康与 retention 均通过。本轮未发生 c07 曾有的 runtime entries 漂移；旧问题根因仍未定位。
- 实际下载 arXiv:1804.08711v2（D2NN，20页，4,000,593 bytes），通过真实页面上传→Hermes确认→源文件进入版本→创建3条主张→生成/预览/批准。匿名预览401且 private,no-store；真实修改 Claim 后旧图 rejected，恢复来源后重新生成并批准。
- 本批2026-09-05只读复验：release/rollback与公网390afc0/c07c8d1一致，13容器运行，checkup公网/loopback200；16 CPU、30GiB内存、约24GiB可用，lspci仅Cirrus VGA，无NVIDIA工具/宿主机FFmpeg。应用版本未变，独立演示另行部署。
- 相同 PDF 在新版本重跑解析成功，但 method/results/reproducibility 仍为空，与首轮相同。展示用三个字段均明确标注 Human-reviewed supplement；不能声称全自动或提取完整度已提高。
- 真实证据位于 ignored apps/web/test/visual/out/chart-workflow/：real-chart.png/svg、real-chart-approved-{desktop,mobile}.png、real-state.json、real-ingestion{,-after}.json、real-source-bound-commit.json、real-invalidation.json 及各日志。受控账户/RO为私有，未发布原论文，所有测试会话已注销；用户可查看本地图解/截图。

## Constraints and remaining risks

- 不读取/打印 .env、Cookie 或密钥；源码不删文件，不 broad prune；生产只走项目脚本。用户已授权本轮实施、合入部署和真实 PDF 验证，不重复问许可。
- arXiv 为向 arXiv 授予非独占传播权，非全文开放再许可；原 PDF 保持私有。Claims 和图解不是独立科学验证。
- Worker 拒绝落库可能留下无引用对象；媒体沿用 charged-on-submit；并发测试为确定性交错，不冒称 PostgreSQL 双会话验证。
- MiniMax image/video仍管理员限定且未注入provider；实际套餐权益未验证、不消费聊天提供的密钥。ScienceDirect仅官方授权。用户认可科普插图视觉方向，视频样片尚待验收。

## Qwen audition delivered

- CURRENT独立视频：f4b4db3df77c7568b0c2a7e266035dc6f5f42303，run f4b4db3-20260905T113000Z。用户已接受v4完整配音；原WAV41.28秒逐字节一致，直接AAC封装，无分段/补静音/变速。视频41.292秒/991帧/4,432,202bytes，ECS渲染20.50秒。字幕依据语句停顿，章节0/6.45/11/20.56/31.81；10项渲染测试、音频4项、lint/docs、独立发布复审、全片解码、公网200/Range206/实际播放跳转/390px字幕无溢出/零页面错误均通过。应用390afc0/回滚c07c8d1不变，旧demo617ed1c保留。PR88新CI仍进行中。下一步图片/画面艺术风格，声音后续微调。

- 用户已接受v4连续旁白41.28秒作为当前版本，后续再优化自然度。本轮将原WAV整段直接混入视频，不重新合成、不切分、不插静音；按语句停顿同步五段画面与字幕，候选章节0/6.45/11/20.56/31.81秒。该接入已完成，公网以本节最新f4b4db3记录为准。

- 用户反馈连续配音已明显改善、仍需更自然。v4仅修改讲稿（取消设问、连贯因果句），保持Serena/seed42/平实指令与全文单次生成；ECS音频41.28秒、生成103.41秒，完整解码通过，无新增安装/付费调用。试听与实际脚本在ignored science-video/voice-v4/、voice-v4.py；未替换公网视频，待用户听感反馈。

- 2026-09-05 用户否定完整视频配音：音色不一致、停顿/转折做作。发现五次独立生成与每段额外0.55秒padding；前者是音色漂移候选原因，未作因果定论。新增 continuity_audition.py，保持同文/Serena/seed42，全文单次生成：continuous沿用原指令39.20s/生成98.37s；plain简短平实指令39.84s/99.70s。ECS现有离线CPU环境、无新增依赖或付费调用，完整WAV解码均通过；自然度/音色/漏读须用户听验，尚未替换视频。证据ignored science-video/voice-v3/和voice-v3.log。下一步先听验再对齐画面，图片风格后置。

- 配音自然度二轮：用户反馈第一轮仍机械；复用Serena/seed42，新增可选script/delivery。A原文+聊天指令14.88s/生成37.07s，B口语短句+同指令21.84s/54.37s；ECS离线CPU完成、两段完整WAV解码通过，无新增依赖/模型/付费调用。用户选择B更自然，但后续五段完整视频未通过听感验收；原音频保留。

- User approved Serena/Uncle_Fu/Vivian same-text audition before production use. One fixed Qwen CustomVoice model downloaded (4.3GiB); reusable CPU torch/torchaudio2.11 base built (~0.97GB). BGE torch2.13/Transformers5.16 differs; no production dependency change. Child image download timeout fixed by600-second pip timeout; import/pip check passed.
- Source infra/tts-audition, server /opt/openscience-trials/tts; model /opt/openscience-models/qwen3-tts-customvoice-0c0e305. Logs in ignored science-video/tts-*. Three voices generated and fully decoded; next user listens before replacing production narration.
- Qwen三音色已在ECS CPU完成：Serena15.92s/生成39.57s、Uncle_Fu15.68s/39.45s、Vivian17.68s/43.99s；峰值进程RSS5.22–5.31GiB，4线程/BF16/SDPA，付费API调用0。三段WAV全片解码、有限非零波形通过；自然度与内容完整性待用户试听，不能把生成成功当作听感验收。基础镜像971705460bytes；子镜像2043364436bytes已含基础层；模型4520217432bytes。df可用101313294336bytes（94.36GiB），较清理后占用增加约6.11GiB；公网/loopback200、应用390afc0不变。

## Next action and read first

1. 用户已接受v4连续配音，f4b4db3已在ECS渲染/发布并验证；接下来优先图片与画面的艺术风格，评估story-to-handdrawn-video等成熟方案。正式任意RO自动生成仍未接入。
2. 正式接入需补有来源的叙事/分镜内容、Gateway媒体provider、隔离CPUrenderer、视频播放/Range与Hermes修订；现有生成器只接IDs、Worker10MiB/reader16MiB与Range416是已查缺口。复用Claim失效并覆盖Evidence变更；无需先新建表/hash/gate。
3. 提取空缺并行改进；区分模型未返回、证据匹配拒绝和片段覆盖，先取得受控证据再改提取逻辑。
4. 新session先Git/fetch/checkup核对生产，再读本handoff、需求基线相关章节、短progress与当前设计/计划。不要从根目录旧main或历史c07任务继续。
