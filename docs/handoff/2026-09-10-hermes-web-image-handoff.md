# Hermes / Workbench CURRENT Handoff

## 当前目标与状态
- 继续一站式Hermes：科学文档/公式 → 全文理解与科学自检 → 科学写作/引用 → 精美笔记/报告 → 多格式资料 → 图片/视频艺术风格、叙事与旁白。
- 2026-09-12：生产MiniMax-M3继续使用现有TokenPlan接口；Chat6Pro只辅助开发讨论，不要求新的强模型API或网页科学定稿。
- 最近真实任务62ae384d-5880-482d-8a44-05b08f416d9e虽succeeded，但六字段过长且存在相位条件/极性泛化，未采用/未发布。M3最终调用19256输入/20974输出tokens，review_received不代表科学通过。
- Chat6Pro已收到必要候选并完成诊断：审稿任务压过成稿任务、长候选锚定。结果/jobs/hermes-m3-actual-diagnosis-20260912.txt。当前候选改为原文优先的scientific-summary v1，六段精华与来源分开，不截断/不隐藏不确定性。
- e4bd5790已部署统一创建/附件/首条Hermes接续；d8de966f固定行内槽/覆盖全局锚点间距，资料区改用户语言，已部署。实际页面可打开、anchor208×208；不是独立首次创建全链路验证。

## 版本与工作树
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release；HEAD以Git为准，未合并main，根目录无关改动不碰。
- ECS应用57f00dc9ee7182fffe2e8e2a29d506a39ceeff4e；rollbackd8de966f40ca2922956d7fe82858eb1f5cff6fab。HEAD以Git为准，当前后续改动未部署。
- bbe已部署M3 model_self_check、paper-analysis v7中文、PPTX/XLSX/HTML上传和解析清洗；服务器必要build/start exit0，无测试/CI/本地构建。不是科学验收。
- e4bd部署日志 C:/Users/Mac/AppData/Local/Temp/xgs-summary-hermes-entry-release-deploy-20260912.log exit0。此前必要build发现浏览器timer类型、空task判空、六字段Record推断问题均已修，未跳过类型检查。
- 干净发布树 E:/Miscellaneous/XGS/.worktrees/deploy-m3-thinking；按精确提交部署，不带入尚未接通的写作文件。
- 网页生图provider d1630135d569d28364d295380bb4e0333c3ee264，rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；路线未改。

## 已有能力与边界
- M3显式adaptive thinking，分段16k/180s、整合32k/300s、temperature1/top_p.95。旧接口不传thinking默认off，4096/60s；旧失败不能证明M3能力不足。
- 真实全文阅读5窗口并发2+reduce，118秒66观察/94段/27限定段，34276输入24503输出tokens；6次均thinking开启/正常stop。文件/parser-jobs/hermes-reading-m3-thinking-20260912.json。仅内部候选，不是最终用户正文，不用其推算Codex整体节省率。
- Docling Serve CPU1.30与CodeFormulaV2缓存已接通；原TeX/页/bbox保留，安全KaTeX覆盖页面。真实26页32式：28式可排版、4式损坏保留低置信原文；核过两个代表原式，不宣称全部物理正确。
- XLSX/PPTX/HTML复用现有解析器。PPTX外部超链接清洗派生副本/媒体流式保留，HTML资源剥离；原件保留。格式安全定向复核完成，多样真实文件兼容仍未观察。
- 写作准备未接通：workspace-guide-contract、citation-management.ts、scientific-writing-source.ts、skills/scientific-writing.ts、research-note-formatting.ts；不要把本地准备冒称上线。
- 新“私有草稿+摘录→MiniMax长篇科学写作”调用曾被自动审批拒绝，精确授权问题本轮已重新呈现、仍未答；不重试被阻断操作。用户已明确批准技术方案/必要候选发送Chat6Pro用于开发复核；两者不同。
- 艺术图片、不同画风与构图、视频镜头/叙事/旁白后续保留；视频与批量冷启动暂缓。

## 保护数据与真实产品
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，草稿修订11。
- 公开 https://openscience.428312321.xyz/research/OSR-2026-000022/v/10；PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；已批准核心图b19a65bd-6497-4b61-bb81-0154b264d58c，源plan3a6ed136-002a-4301-8505-ca14e3dbbc53。
- 原确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2/sourceAgent1e324308-fd26-4cc1-8612-8a1c269909a9受保护。
- 新未确认ingestion840e24f9-cf9b-471f-a38c-7331705b1003当前agent0e38446e-041c-4cc3-a890-f0c7dc27b450。62ae384d是上一候选，完整记录/jobs/hermes-m3-product-result-20260912.json；不要重发原reanalyze。
- 候选仅把未确认且缺少compositionSkill或精确scientific-summary v1的旧M3结果转到既有scientific_review_v4原文复用路径；confirmed reanalysis/权限/幂等/SourceMap保护不变。新语义部署后该ingestion只做一次bridge+final，不重跑解析/map。
- 已部署桌面任务分组/静默更新、编辑资料归文末、公开图文/探索缩略图、跨页SessionProvider。一次短期会话观察不等于所有网络/长期登录已证明。
- 旧19/20/21已可恢复归档，真实文件/Publication/公共ID保留。已有一篇带图发布；2–3篇精选及多图HTML/视频未全部完成。

## 最新实际成稿结果
- agent0e38446e-041c-4cc3-a890-f0c7dc27b450已succeeded；同一840e24f9 ingestion的既有/refresh返回202，只重跑final，scientific-summary v1/MiniMax-M3/stop，12083输入+7297输出=19380 tokens，比旧final40230减少51.83%。此对比只涵盖M3最后一步；因质量未达标，不算质量不降的已验收节约。
- 新稿仍多算例堆砌、5%/20倍对照对象缺失、位置到接收时间误成角度转换、幅值最大误成相位最大；角积分/特定模型比较本身有原文依据，未采用/发布。完整结果/jobs/hermes-summary-product-result-20260912.json。停止再次生成；已把真实核心与所引原文发送同一Chat6Pro，marker source-first-summary-observed-20260912，回复已收到。
- 新建页实际截图/jobs/hermes-unified-entry-20260912.png；Chrome全页截图可能受现有缩放裁切，DOM无横溢出；真实anchor0×464为已确认布局问题。

## 后续执行
1. 57f00dc9已部署exit0，日志C:/Users/Mac/AppData/Local/Temp/xgs-hermes-semantic-deploy-20260912.log。创建页移除错误assistantOpen，服务器实际anchor208×208/opacity1，未重新创建测试数据。
2. extractor/paper-analysis v8/scientific-summary v2已部署，Sol Medium实现、独立Sol High静态复核四文件无明确blocker。可变语义点替换默认reduce，条件/对照/操作整体入final；旧v1与短文一次raw-P bridge+final；无算例的理论结果可保留。domain exact v1未确认升级已纳入。semantic/final用量分开，map未计入semantic。
3. 840e24f9/refresh产生5b615d36，现已结束：业务succeeded但blocked_scientific_review、6字段空，source_bridge两次SCHEMA_VALIDATION，无final。窗口内M3 21145+19483和21218+17273=79119tokens/280533ms；未采用/发布。根线程发现prompt未给精确六字段骨架/部分长度限制，不能断言它是唯一拒绝原因。Worker正在补完整契约和安全精确诊断；新版本部署前不重发。预备store semanticContractRefresh（sourceAgent5b615d36，未执行）；现结果/jobs/hermes-semantic-product-result-20260912.json。
4. 科学写作的数据调用待精确审批回答；其余已授权页面/能力继续推进。同步能力台账，不能把准备/部署/实际可用混写。

## 约束与操作入口
- 禁止测试/预检/CI/本机构建。允许服务器部署必要build/start及本次真实产品任务；本机仅编辑、静态阅读、传输。
- 主屏贡献→核心概念图/可选视频→六字段精华→文末资料，Hermes对话主入口；按项目frontend-design/apple-design/emil-design-eng，不恢复冗余表单。
- SSH仅infra/scripts/ssh-run.sh，Windows显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS；不读取打印.env/Secret/cookie。
- 当前权限danger-full-access、approval_policy=never；不要传sandbox_permissions。旧os206及require_escalated恢复方式已过时。
- Worker openscience-prod-agent-worker-1；代码/opt/openscience-releases/<SHA>，/opt/openscience不一定是当前源码。
- 浏览器openscience-chatgpt-browser，复用/app/node_modules/playwright-core与CDP127.0.0.1:9233；登录页内fetch的CSRF字段csrfToken，不是token，不打印。
- 开发Chat6Pro https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581；技术规划/jobs/hermes-m3-route-plan-20260912.txt、真实结果诊断/jobs/hermes-m3-actual-diagnosis-20260912.txt均已收到，不重复发送。
