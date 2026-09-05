# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-05 +08。** PR #86 图解工作流已部署并完成真实 PDF 验收；当前图解是主张摘要卡片，完整多模态产品尚未完成。

## Version tuple and production truth

- Worktree: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch: codex/product-workflow-design；application HEAD: 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7。后续 docs-only HEAD 以 Git 实测为准。
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

## Fresh acceptance evidence

- 全仓 build/typecheck/lint/test 通过；Web491+Node5、domain568、worker502、API130；独立 security/domain/UI/renderer/extractor 复审无剩余产品阻断。
- 本地 browser98/99 后修正唯一测试时序问题，图解9/9复验；main CI 33947575816 完整99/99与 Hermes 专项全部 GREEN。原有 search storage 集成8例需独立DB，未在本地 unit 环境执行。
- ECS 精确完整 build、Parser16-case、BGE runtime、ScanSci 真实 OA/Worker、迁移、内外网健康与 retention 均通过。本轮未发生 c07 曾有的 runtime entries 漂移；旧问题根因仍未定位。
- 实际下载 arXiv:1804.08711v2（D2NN，20页，4,000,593 bytes），通过真实页面上传→Hermes确认→源文件进入版本→创建3条主张→生成/预览/批准。匿名预览401且 private,no-store；真实修改 Claim 后旧图 rejected，恢复来源后重新生成并批准。
- 相同 PDF 在新版本重跑解析成功，但 method/results/reproducibility 仍为空，与首轮相同。展示用三个字段均明确标注 Human-reviewed supplement；不能声称全自动或提取完整度已提高。
- 真实证据位于 ignored apps/web/test/visual/out/chart-workflow/：real-chart.png/svg、real-chart-approved-{desktop,mobile}.png、real-state.json、real-ingestion{,-after}.json、real-source-bound-commit.json、real-invalidation.json 及各日志。受控账户/RO为私有，未发布原论文，所有测试会话已注销；用户可查看本地图解/截图。

## Constraints and remaining risks

- 不读取/打印 .env、Cookie 或密钥；源码不删文件，不 broad prune；生产只走项目脚本。用户已授权本轮实施、合入部署和真实 PDF 验证，不重复问许可。
- arXiv 为向 arXiv 授予非独占传播权，非全文开放再许可；原 PDF 保持私有。Claims 和图解不是独立科学验证。
- Worker 拒绝落库可能留下无引用对象；媒体沿用 charged-on-submit；并发测试为确定性交错，不冒称 PostgreSQL 双会话验证。
- MiniMax image/video 仍管理员限定、默认关闭；ScienceDirect 仅走官方授权条件，不引入绕过方案。当前图解视觉效果交用户验收，尚无用户接受反馈。

## Next action and read first

1. 按用户功能/展示优先的要求，下一段推进成熟方案支持的科学机制图/图片、视频和 Hermes 语音编辑讨论；提取空缺与自动主张/证据衔接作为并行质量改进。不把卡片截图当成生成式图片能力完成。
2. 复用现有 gateway、ingestion/parser/source map、Claims/Evidence、presentation API/Worker；区分模型未返回、证据匹配拒绝和片段覆盖，先取得受控样本证据再改提取逻辑。
3. 新 session 先 Git worktree/branch/status + fetch/checkup 核对生产元数据，再读本 handoff、需求基线相关章节、短 progress 与当前设计/计划。不要从根目录旧 main 或历史 c07 next action 继续。
