# Hermes / Workbench CURRENT Handoff

## 目标与约束
- 按已批准顺序完成一站式Hermes能力：科学文档/公式 → 全文理解与科学自检 → 科学写作/引用 → 精美笔记/报告 → 多格式资料 → 图片/视频艺术风格与叙事。统一创建页始终保留聊天、附件和再分析，用户尽量少操作。
- 生产继续现有MiniMax-M3，不要求新供应商/密钥。宿主skill目录不自动赋予产品能力，必须在Worker实际导入指令及工具。
- 禁止测试、预检、CI测试及本机构建；本机只编辑/静态读取/传输，服务器执行部署必要build/start与真实产品任务。保护已确认稿，不能用人工结论冒充Hermes。
- 2026-09-12用户明确批准向已登录ChatGPT6Pro发送相关技术方案和必要论文分析候选用于开发复核；不发凭据或无关资料。Chat开发复核与服务器网页生图分别判断，浏览器错误不代表Chat不可用。
- 新增“私有草稿+来源摘录→MiniMax科学写作”调用曾被自动审批拒绝，精确授权问题仍待回答；不要重试被阻断写作调用。旧DOC/ZIP降级为仅存储也被拒，当前兼容行为保留。
- 主屏保持：贡献 → 核心概念图/可选视频 → 凝练六字段 → 文末资料。Hermes对话为主要入口，不恢复冗余表单；视频/批量冷启动暂缓。
- 先读本handoff、docs/OpenScience_Kimi_Development_Spec.md相关段、docs/specs/2026-09-05-integrated-research-product-design.md、docs/runbooks/server-capabilities.md。

## 版本
- 工作树 E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。HEAD以git元数据为准；根工作区无关改动不碰，未合并main。
- 当前ECS应用0d059852ebd4eb835815a670a99156c1640af00b，rollback f2889c867826c30ceb72c6172f8b7d74434a93fa。
- 当前候选：M3最终model_self_check、paper-analysis v7中文、PPTX/XLSX/HTML解析入口与安全清洗；尚未部署，不能用下方历史结果声称候选通过。
- provider d1630135d569d28364d295380bb4e0333c3ee264 / rollback92cc416ee3fe921f62c75cbe6f69e48d0b55227d；生图供应商/账号路线未改。
- 最后成功应用部署日志 C:/Users/Mac/AppData/Local/Temp/xgs-m3-thinking-deploy-20260912.log，exit0。必要服务器build/start，无测试/CI/本地执行。
- 干净发布工作树 E:/Miscellaneous/XGS/.worktrees/deploy-m3-thinking 可用于精确提交部署；不要stash/覆盖主工作树未接通的写作代码。

## 能力事实
- 0d059852已启用M3 Anthropic接口adaptive thinking，分段16k/180s、整合32k/300s、temperature1/top_p.95；旧接口未传thinking默认关闭、4096/60s，旧失败不能证明M3能力不足。实际模型/预算/usage有审计，截断不按原预算盲重试。
- 真实已存PDF解析结果的新阅读：118秒、5窗口并发2+1reduce、66观察/94原段/27限定段；6次均thinkingEmitted=true/end_turn，无重试或截断；MiniMax报告34276输入/24503输出tokens。文件/parser-jobs/hermes-reading-m3-thinking-20260912.json。
- 此内部整合仍太长/部分过强，未写RO，不是科学定稿。候选最终校正用精确SourceMap和条件，标model_self_check；无原页图像不声称读PDF，未解疑点只影响相关字段。独立Sol High已复核生产路由与来源绑定，无剩余阻断。
- Docling Serve CPU1.30.0复用；CodeFormulaV2 revision ecedbe111d15c2dc60bfd4a823cbe80127b58af4，独立只读缓存/公式增强true。原文TeX/页码/bbox保留，ScientificText安全KaTeX覆盖编辑/公开/发布/Hermes。
- 真实26页/32式，28式可排版，4式乱码或结构破损已标低置信/保留orig；两个代表公式对照原页。不要将语法可排版当物理正确。原文件/parser-jobs/formula-reading-20260912.json及formula-source-20260912.pdf。
- 候选多格式复用现有Docling：XLSX/PPTX/HTML入口接通；HTML资源清洗后解析；PPTX外链Relationship/hlink引用清洗副本后解析，其他媒体流式保留，外部资源仍拒绝。无新OCR/浏览器；archiver复用已锁7.0.1，parser独立npm锁须包含全部5项原依赖。
- 写作准备：workspace-guide-contract、citation-management.ts、scientific-writing-source.ts尚未接通/导出，未授权模型调用不能纳入发布。独立长稿不占六字段/1200字summary。
- Hermes形象大小选择器已移除0d059852，quiet恢复compact；统一创建页仍待实施，不把此项误记成已完成。

## 已交付产品与保护数据
- 桌面任务去重分组/静默更新/失败保留旧结果；编辑资料/来源/历史归文末；公开完整图文；探索真实缩略图；Next Link/根SessionProvider及7天Cookie续期已部署，短期导航观察成功，不承诺所有网络/长期都不掉线。
- 设计按项目frontend-design/apple-design/emil-design-eng；已安装来源/许可证保留。主屏保持已认可布局。
- 受保护RO c896802c-35dd-4b59-8db1-5f374f83a6d8，正式v10 f4e2dc71-1fe8-406f-8c19-e1849503d698，草稿修订11。
- 公开 https://openscience.428312321.xyz/research/OSR-2026-000022/v/10；PDF7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；核心图b19a65bd-6497-4b61-bb81-0154b264d58c，已approved。
- 当前已确认ingestion2fdb78de-b52b-40f6-832f-faa3fdd9f4e2 / sourceAgentTask1e324308-fd26-4cc1-8612-8a1c269909a9。部署后真实再分析用既有confirmed reanalyze接口，保留确认稿/公开版。
- 图源plan3a6ed136-002a-4301-8505-ca14e3dbbc53，服务器/jobs/b19a65bd-6497-4b61-bb81-0154b264d58c/output/image.png。原Chat6aa4065f-b358-83ea-a624-11ce6cdc21b3取回图有人工异常恢复，不能冒称无需干预。
- 旧19/20/21测试RO已可恢复归档；Publication/公共ID/PDF未删除。已有一篇带图发布，其余2–3篇精选、更多清理、多图HTML/视频尚未全部完成。

## 下一步
1. 完成格式定向安全复核与锁文件同步，和M3自检候选一起commit/push[skip ci]、服务器deploy --no-tests --skip-migrate --reuse-unchanged-capability-images，rollback0d059852；不要带入未接通写作文件。
2. 用同一已登录服务器产品会话做一次真实再分析，观察最终中文字段/科学条件/来源/实际模型消耗，保留原确认稿；不再用重复内部map测试代替交付。
3. 读取已发Chat m3-production-route-20260912回复，处理明确建议。写作数据调用待精确用户回答；统一创建/持续对话及精美输出可以继续独立准备。
4. 能力表逐项更新；后续图片/视频艺术风格、构图/叙事、镜头/旁白必须保留，不能因公式修复而遗忘。

## 操作入口
- SSH仅项目infra/scripts/ssh-run.sh；Windows显式C:/Program Files/Git/bin/bash.exe，XGS_CONFIG_ROOT=E:/Miscellaneous/XGS。禁止打印.env/Secret/cookies。
- 当前实际worker openscience-prod-agent-worker-1；不可用旧openscience-agent-worker-1名字。/opt/openscience根目录不一定是当前release；精确代码在/opt/openscience-releases/<SHA>。
- 服务器浏览器openscience-chatgpt-browser，现有/app/node_modules/playwright-core，CDP127.0.0.1:9233；复用登录，页面fetch走原浏览器，CSRF仅页内使用不打印。
- 开发Chat6Pro https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581；本次技术方案标记m3-production-route-20260912已发送，勿重复。之前科学校准/jobs/hermes-stage2-chat-final-20260912.json仅开发参考。
- 普通sandbox/apply_patch当前因os error206初始化失败，已授权操作使用require_escalated；任何新的自动审批拒绝另行说明，禁止绕过。
