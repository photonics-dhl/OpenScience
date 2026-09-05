# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** PR #86 工作流已部署；用户否定卡片作为图解交付，认可后续生成式科普插图方向。46秒CPU动画样片已本机验证并交效果验收，完整多模态产品尚未完成。

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
- 本批复用已有生成插图、Playwright/Chromium与本机中文TTS，FFmpeg采用项目局部工具；无MiniMax调用。成片与可编辑分镜置ignored `apps/web/test/visual/out/science-video/`，未部署或接入任意论文自动生成。
- 成片`d2nn-science-explainer.mp4`：46.25秒、1280×720/24fps、H264+yuv420p/AAC、1.78MB；主线程全片解码exit0、本机Chromium首播/seek成功、390px无溢出，查看五层/干涉/探测画面。证据validation/playback-validation JSON；约21秒编码为文件时间估算，非性能基准。

## Fresh acceptance evidence

- 全仓 build/typecheck/lint/test 通过；Web491+Node5、domain568、worker502、API130；独立 security/domain/UI/renderer/extractor 复审无剩余产品阻断。
- 本地 browser98/99 后修正唯一测试时序问题，图解9/9复验；main CI 33947575816 完整99/99与 Hermes 专项全部 GREEN。原有 search storage 集成8例需独立DB，未在本地 unit 环境执行。
- ECS 精确完整 build、Parser16-case、BGE runtime、ScanSci 真实 OA/Worker、迁移、内外网健康与 retention 均通过。本轮未发生 c07 曾有的 runtime entries 漂移；旧问题根因仍未定位。
- 实际下载 arXiv:1804.08711v2（D2NN，20页，4,000,593 bytes），通过真实页面上传→Hermes确认→源文件进入版本→创建3条主张→生成/预览/批准。匿名预览401且 private,no-store；真实修改 Claim 后旧图 rejected，恢复来源后重新生成并批准。
- 本批2026-09-05只读复验：release/rollback与公网390afc0/c07c8d1一致，13容器运行，checkup公网/loopback200；16 CPU、30GiB内存、约24GiB可用，lspci仅Cirrus VGA，无NVIDIA工具/宿主机FFmpeg。未变更生产。
- 相同 PDF 在新版本重跑解析成功，但 method/results/reproducibility 仍为空，与首轮相同。展示用三个字段均明确标注 Human-reviewed supplement；不能声称全自动或提取完整度已提高。
- 真实证据位于 ignored apps/web/test/visual/out/chart-workflow/：real-chart.png/svg、real-chart-approved-{desktop,mobile}.png、real-state.json、real-ingestion{,-after}.json、real-source-bound-commit.json、real-invalidation.json 及各日志。受控账户/RO为私有，未发布原论文，所有测试会话已注销；用户可查看本地图解/截图。

## Constraints and remaining risks

- 不读取/打印 .env、Cookie 或密钥；源码不删文件，不 broad prune；生产只走项目脚本。用户已授权本轮实施、合入部署和真实 PDF 验证，不重复问许可。
- arXiv 为向 arXiv 授予非独占传播权，非全文开放再许可；原 PDF 保持私有。Claims 和图解不是独立科学验证。
- Worker 拒绝落库可能留下无引用对象；媒体沿用 charged-on-submit；并发测试为确定性交错，不冒称 PostgreSQL 双会话验证。
- MiniMax image/video仍管理员限定且未注入provider；实际套餐权益未验证、不消费聊天提供的密钥。ScienceDirect仅官方授权。用户认可科普插图视觉方向，视频样片尚待验收。

## Next action and read first

1. 用户认可46秒v1样片，要求自然过渡与突出动效；v2已完成并交验收，文件`d2nn-science-explainer-v2.mp4`（4.80MB/46.25s，实测渲染25.17s）。主线程全片解码并查看最终MP4抽帧通过；v1保留，模型调用0。Windows旁白需Linux替代；本地播放不等于生产交付。
2. 正式接入需补有来源的叙事/分镜内容、Gateway媒体provider、隔离CPUrenderer、视频播放/Range与Hermes修订；现有生成器只接IDs、Worker10MiB/reader16MiB与Range416是已查缺口。复用Claim失效并覆盖Evidence变更；无需先新建表/hash/gate。
3. 提取空缺并行改进；区分模型未返回、证据匹配拒绝和片段覆盖，先取得受控证据再改提取逻辑。
4. 新session先Git/fetch/checkup核对生产，再读本handoff、需求基线相关章节、短progress与当前设计/计划。不要从根目录旧main或历史c07任务继续。
