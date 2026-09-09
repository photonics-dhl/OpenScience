# Progress

## 2026-09-09 — 全文凝练、定向OCR与图片优先（候选，尚未部署）
- 起始HEAD413948af；实读production1267e298 / rollback1df9f617。本轮新代码未部署，不混用历史成功记录。
- 修正core=原文摘抄：Hermes runtime skill凝练六字段，独立原文证据精确回读；全文≤120k不静默裁中间；更长文档尚需分层处理。
- 受控sidecar PNG→worker授权MiniMax视觉OCR；公式信号和quota-only备用。现有主/备用已配置，未读写secret；候选compose开启vision。
- image-only profile让图片审批后完成，不自动制作视频；规划/绘图读取已审核原文并绑定来源变化。
- 结果画廊、来源折叠、独立图片规划和错误恢复候选完成；服务器部署及实际页面观察待继续。
- 用户回复浏览器恢复后CUA仍nodeRepl.fetch失败；本轮没访问Chat/没有截图，代码继续推进。
- 未运行测试、预检或本机构建；仅静态阅读和必要生产配置bool读取。
- 当前纸张Agentf286cc57仍partial未确认；本轮尚无新论文或图片产品结果。精确状态见唯一CURRENT handoff。

## Retained production facts
- production1267e298部署exit0，日志1788936975803-c258f311-74ba-4fd0-8c37-030fe1e13227；旧exact-quote提取仍不满足用户目标。
- 已部署上传自动整理/预填、人工编辑保护与Hermes导航/窄屏修复；当前问题清单和历史实际观察见集成产品计划。
- 先前另一论文方法讲解四图和23.459秒视频可用，不能替代当前论文全文理解或自动流程结论。
- 更早逐轮记录由Git历史保留；本轮不恢复旧测试清单。