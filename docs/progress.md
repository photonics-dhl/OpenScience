## 当前推进：订阅生图 skill 接入候选
- 2000f508发布在服务器build期间SSH重置退出255；production仍85f65451，无部署进程/残留journal，未应用新迁移。
- imagegen-skill.md/imagegen-prompting.md复制自官方预设skill，固定只读注入Codex内置生图，不走API fallback、不开放其他工具。install同步bundle。单图宽幅展示，多图2xl双列。候选待发布。

# Progress

## 图片流程实际推进
- production85f65451，分析Agentadfc1d11仍partial，保留全部草稿；只确认有明确来源的problem到version58a45cb5，并创建Hermes run46442dc4（图片流程）。
- confirmSourceReview实际发现DB旧grant约束遗漏image-v1，事务已回滚。新增仅扩展image7组合的迁移，回滚保留扩展schema不删记录。待部署后继续。

## 实际重新分析已返回
- production c40350a3 / rollback a9b6c154。Agent5cc63d4d使用skill v2且OCRreuse=true，method/results综合草稿保留但source ID约束未通过。候选移除独立6ID上限（32blocks/8k证据总量不变），继续实际处理。未确认或生图。

## 2026-09-09 — 按用户要求重新处理（进行中）
- 补齐当前格式的显式重新分析入口，沿现有计费/权限/幂等与OCR复用，不再为单篇新增contract版本。候选未部署，实际旧任务仍needs_review。

## 2026-09-09 — 纠正全文理解方向（已部署）
- 浏览器已恢复；实际向原Chat发送任务并读取6 Pro回复：全文综合→六维组织→来源核对，同次调用，来源失败保留草稿。
- runtime skill v2允许跨章节概括隐含方法，区分论文类型、假设/适用域/极限；extractor不再要求先选证据再填表。
- 新增unverifiedSummaries只读待核对摘要，保持core/evidence隔离，UI明确技术失败不等于论文未报告。没有新模型轮次/重试版本。
- production a9b6c154 / rollback11ae6200；服务器构建与--no-tests部署exit0，日志1788949130443-30772096-3fba-4f5f-b77b-e4a344100593。未重新处理论文；此前科学忠实性问题不能因此宣称修复。

## 2026-09-09 — 来源分段与格式恢复已部署，科学忠实性仍未完成
- production11ae6200 / rollbackfa751b16；--no-tests部署exit0，日志1788945551137-935b9b0c-8548-4835-9e08-d29c08fac925。
- 当前Agent5dba592b retry1返回五字段，method缺失（passage_ids_required）；grounded-passages-v2/sourceMapReused=true。
- 实际对照所选原文发现科学错误：把近/远场极限讨论写成Eq40适用条件，把j1近似与完整形式因子混淆，局限有过度排除性结论。未确认，未生图，不能称论文处理完成。
- 已部署OCR地区/授权修复、服务端精确passage选择（≤5blocks/1200chars/P）、完整JSON结构与格式反馈、保留已验证partial、OCR复用、图片profile和画廊。
- 浏览器重连仍nodeRepl.fetch失败，无网页Chat复核/截图。未运行测试或本机构建，只有必要服务器构建部署和真实论文处理。
- 下一步是服务器语义忠实性复核与正常重新分析能力，不能继续为单篇加合同版本/免费重试；详细实际状态见唯一CURRENT handoff。
