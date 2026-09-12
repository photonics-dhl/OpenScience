# Hermes / Workbench CURRENT Handoff

## 当前目标与状态
- 继续一站式Hermes：科学文档/公式 → 全文理解与科学自检 → 科学写作/引用 → 精美笔记/报告 → 多格式资料 → 图片/视频艺术风格、叙事与旁白。
- 2026-09-12：生产MiniMax-M3继续使用现有TokenPlan接口；Chat6Pro只辅助开发讨论，不要求新的强模型API或网页科学定稿。
- 最近真实任务62ae384d-5880-482d-8a44-05b08f416d9e虽succeeded，但六字段过长且存在相位条件/极性泛化，未采用/未发布。M3最终调用19256输入/20974输出tokens，review_received不代表科学通过。
- Chat6Pro已收到必要候选并完成诊断：审稿任务压过成稿任务、长候选锚定。结果/jobs/hermes-m3-actual-diagnosis-20260912.txt。当前候选改为原文优先的scientific-summary v1，六段精华与来源分开，不截断/不隐藏不确定性。
- 当前候选同时统一创建入口（Hermes对话+附件），精确任务接续与既有草稿冲突/撤销机制；正收尾账号隔离和附件/对话scope竞态。尚未部署。

## 版本与工作树
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release；HEAD以Git为准，未合并main，根目录无关改动不碰。
- ECS应用bbe4e4a6630202ce451f57a5e86902a276fa8948；rollback0d059852ebd4eb835815a670a99156c1640af00b。
- bbe已部署M3 model_self_check、paper-analysis v7中文、PPTX/XLSX/HTML上传和解析清洗；服务器必要build/start exit0，无测试/CI/本地构建。不是科学验收。
- 应用部署日志 C:/Users/Mac/AppData/Local/Temp/xgs-m3-science-formats-fixed-deploy-20260912.log。前次997首次build的Archiver ESM类型导入失败已在bbe修复，勿重复排查。
- 干净发布树 E:/Miscellaneous/XGS/.worktrees/deploy-m3-thinking；按精确提交部署，不带入尚未接通的写作文件。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264，rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；路线未改。

## 已有能力与边界
- M3显式adaptive thinking，分段16k/180s、整合32k/300s、temperature1/top_p.95。旧接口不传thinking默认off，4096/60s；旧失败不能证明M3能力不足。
- 真实全文阅读5窗口并发2+reduce，118秒66观察/94段/27限定段，34276输入24503输出tokens；6次均thinking开启/正常stop。文件/parser-jobs/hermes-reading-m3-thinking-20260912.json。仅内部候选，不是最终用户正文，不用其推算Codex整体节省率。
- Docling Serve CPU1.30与CodeFormulaV2缓存已接通；原TeX/页/bbox保留，安全KaTeX覆盖页面。真实26页32式：28式可排版、4式损坏保留低置信原文；核过两个代表原式，不宣称全部物理正确。
- XLSX/PPTX/HTML复用现有解析器。PPTX外部超链接清洗派生副本/媒体流式保留，HTML资源剥离；原件保留。格式安全定向复核完成，多样真实文件兼容仍未观察。
- 写作准备未接通：workspace-guide-contract、citation-management.ts、scientific-writing-source.ts、skills/scientific-writing.ts、research-note-formatting.ts；不要把本地准备冒称上线。
- 新“私有草稿+摘录→MiniMax长篇科学写作”调用曾被自动审批拒绝，精确授权问题仍未答；不重试被阻断操作。用户已明确批准技术方案/必要候选发送Chat6Pro用于开发复核；两者不同。
- 艺术图片、不同画风与构图、视频镜头/叙事/旁白后续保留；视频与批量冷启动暂缓。

## 保护数据与真实产品
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，草稿修订11。
- 公开 https://openscience.428312321.xyz/research/OSR-2026-000022/v/10；PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批准核心图b19a65bd-6497-4b61-bb81-0154b264d58c，源plan3a6ed136-002a-4301-8505-ca14e3dbbc53。
- 原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2/sourceAgent1e324308-fd26-4cc1-8612-8a1c269909a9受保护。
- 新未确认ingestion840e24f9-cf9b-471f-a38c-7331705b1003/agent62ae384d-5880-482d-8a44-05b08f416d9e已succeeded。完整坏候选/jobs/hermes-m3-product-result-20260912.json；不要重发原reanalyze。
- 候选只在未confirmed refresh中把没有compositionSkill的旧M3结果转到既有scientific_review_v4复用原文路径；原确认reanalysis/权限/幂等/SourceMap保护不变。部署后走该ingestion的/refresh，仅重跑final。
- 已部署桌面任务分组/静默更新、编辑资料归文末、公开图文/探索缩略图、跨页SessionProvider。一次短期会话观察不等于所有网络/长期登录已证明。
- 旧19/20/21已可恢复归档，真实文件/Publication/公共ID保留。已有一篇带图发布；2–3篇精选及多图HTML/视频未全部完成。

## 后续执行
1. 收尾并精确部署科学摘要和统一创建UI；按server-capabilities复用已有服务，不新增浏览器/OCR。
2. 通过当前未确认ingestion的refresh处理真实论文；只观察最终精炼/条件/引用与模型usage，不重复完整阅读。不覆盖确认稿或放行已知错误。
3. 科学写作的数据调用待精确审批回答；其余已授权页面/能力继续推进。同步能力台账，不能把准备/部署/实际可用混写。

## 约束与操作入口
- 禁止测试/预检/CI/本机构建。允许服务器部署必要build/start及本次真实产品任务；本机仅编辑、静态阅读、传输。
- 主屏贡献→核心概念图/可选视频→六字段精华→文末资料，Hermes对话主入口；按项目frontend-design/apple-design/emil-design-eng，不恢复冗余表单。
- SSH仅infra/scripts/ssh-run.sh，Windows显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS；不读取打印.env/Secret/cookie。
- 当前权限danger-full-access、approval_policy=never；不要传sandbox_permissions。旧os206及require_escalated恢复方式已过时。
- Worker openscience-prod-agent-worker-1；代码/opt/openscience-releases/<SHA>，/opt/openscience不一定是当前源码。
- 浏览器openscience-chatgpt-browser，复用/app/node_modules/playwright-core与CDP127.0.0.1:9233；登录页内fetch的CSRF字段csrfToken，不是token，不打印。
- 开发Chat6Pro https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581；技术规划/jobs/hermes-m3-route-plan-20260912.txt、真实结果诊断/jobs/hermes-m3-actual-diagnosis-20260912.txt均已收到，不重复发送。
