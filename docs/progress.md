# OpenScience 当前进度

## 2026-09-12 — MiniMax 主路由与多格式接入收尾
- branch codex/onchip-video-release；生产0d059852ebd4eb835815a670a99156c1640af00b，rollbackf2889c86；browser provider d1630135/rollback92cc416e。当前候选尚未部署，唯一接续入口 docs/handoff/2026-09-10-hermes-web-image-handoff.md。
- 已部署：MiniMax-M3显式adaptive thinking、分段16k/180s、整合32k/300s；Hermes形象大小按钮移除。实际部署日志xgs-m3-thinking-deploy-20260912.log exit0，无测试/CI/本机构建。
- 已观察：同一PDF既有解析结果由M3真实阅读118秒，5窗口+reduce，66观察/94段/27限定段；34276输入/24503输出tokens，无截断重试，6次thinking开启。内部结果仍过长/部分过强，未写RO，不当作定稿；不能据此推算Codex整体节省率。
- 当前候选：最终六字段经现有M3科学自检，真实provider/model/usage与model_self_check身份记录；paper-analysis v7中文凝练；未解公式仅影响相关字段，保护确认稿。Sol High定向复核无生产路由阻断。
- 格式候选：XLSX/PPTX/HTML复用Docling，PPTX外链清洗副本/媒体流式保留、HTML资源剥离；archiver7.0.1复用原锁，parser独立锁保留KaTeX/yauzl。没有新OCR或浏览器。
- 用户本轮已明确批准技术方案及必要论文候选发到Chat6Pro，m3-production-route-20260912已实际发送，待收回复。不能将此前自动审批拒绝称为Chat网络不通。
- 新增私有稿件+摘录发MiniMax写作曾被自动审批拒绝；精确授权问题未答。共享写作合同/来源/引用映射代码仍未接通，不纳入发布。
- 下一步：部署候选→同一真实论文产品再分析→继续统一创建/持续聊天附件与写作/笔记；图片视频艺术风格、叙事/旁白明确保留后续。

## 当前能力与产品结果
- Docling CodeFormulaV2增强、来源定位和安全KaTeX已部署；26页/32式中28式可排版，4式损坏保留低置信原文，已核两个代表原式；不是全部物理正确。源/parser-jobs/formula-reading-20260912.json。
- 已部署桌面任务分组/静默更新、跨页会话延续、简化编辑器资料、公开图文及探索卡片；实际账号跨桌面/编辑/探索/公开保持，短期观察不等于所有网络条件或7天后已证明。
- 用户认可冷白/青绿风格；贡献→核心图/可选视频→精华六字段→文末资料，Hermes主要对话入口。统一创建仍待改，不能恢复冗余选择/长制作指令。
- 已带图公开22-v10，RO c896802c-35dd-4b59-8db1-5f374f83a6d8；正式版本f4e2dc71-1fe8-406f-8c19-e1849503d698、草稿修订11，图b19a65bd-6497-4b61-bb81-0154b264d58c。保护已确认内容与公共ID。
- 旧19/20/21测试数据可恢复归档；真实论文、附件、Publication未删除。2–3篇精选、其余清理、视频和实际多图HTML尚未全部完成。
- 前序科学复核发现不同算例混用、相位/强度叠加限定遗漏；旧thinking关闭/4096预算结果不作模型能力上限证据。既有Chat校准仅开发参考，生产不能依赖网页科学定稿。
- 完整前序实现/部署日志与历史进度保留Git历史；当前只从唯一handoff与能力清单接续。

## 执行约束
- 用户禁止测试/预检/CI/本地构建；必要服务器build/start属于部署，实际产品任务按授权继续；不得以没有测试宣称质量已验证。
- 全文理解/写作由服务器Hermes调用已配MiniMax完成，不能用Codex手工内容冒充产品自动能力。
- 能力变化同步server-capabilities.md与hermes-capability-registry.md；安装前查现有缓存/服务，勿重复装浏览器/OCR。
- 发现产品叙事或科学事实方向错误及时对齐，不沿旧规划继续扩大。
