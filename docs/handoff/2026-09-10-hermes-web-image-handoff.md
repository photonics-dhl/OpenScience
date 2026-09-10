# Hermes Web Image CURRENT Handoff

## Goal and constraints

- 真实用户流程：上传论文→服务器解析/OCR与Hermes全文理解→六维凝练及原文证据→用户确认→内容驱动生图→人工审核→发布→公开RO。视频暂停。
- 产品落地优先；禁止测试、预检、CI和本机运行。服务器只执行部署必需构建/启动及真实产品任务。不得用手工内容冒充服务器能力，不得自动批准科学资产。
- 六维不是章节模板；隐含方法必须由Hermes跨全文归纳，所有结论保留可核对来源。

## Version tuple

- worktree `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`
- branch / application HEAD：`codex/onchip-video-release` / `4b4e365cd5cce60a9659a0f175f775a3356f7f87`
- production / rollback：`4b4e365cd5cce60a9659a0f175f775a3356f7f87` / `d60ab6313c07620262206cef0bb0a2d0967f4bb9`
- browser provider bundle：`4b4e365cd5cce60a9659a0f175f775a3356f7f87`

## Completed

- 服务器 `chatgpt-web` provider 已由真实Hermes `presentation.generate`任务端到端生成并回传产品草稿；不是Codex手工生图，也未走API计费fallback。
- 原PDF的区域附件上传已真实成功；科学审阅独立锁、30分钟窗口与exact candidate-hash恢复已部署。图片与科学审阅可并行，彼此不再争用全局执行锁。
- task/asset `eb48809b-c402-4983-969d-ee82d0fe6200`：`succeeded` / `draft`，PNG 1280×720、971354 bytes，hash `773ed60431c3f04c07463df0f24fae54db9f1ea5ab003c04d7e8907268ef76be`。
- canonical Chat会话 `6aa23223-62f8-83e9-9b43-19d424eb51a6`；source claim `7397c444-19d4-4900-b060-b9e1004261f4`；approved storyboard `5076fcc6-54a8-4ee0-a40b-517c38e58090`。
- 恢复链已部署：精确request/result/provider/task/prompt hash与PNG证明；复用原prompt/result而不重新规划；提交后最多一次浏览器重启并回到精确会话续取，绝不重发。
- 旧rejected图片从主画廊移除但保留审计；生产截图已观察当前草稿与批准/退回操作。
- 图片中的自由空间传播模、Bethe经典描述边界、局域孔径模式量子化问题均有论文原文证据。仍需用户人工批准后才可进入发布候选。
- Deep-sub-cycle真实PDF已由science-v4纠正章节抽取语义：task `1e324308-fd26-4cc1-8612-8a1c269909a9`、6 Pro review `6cc0a17c-e4df-5655-8819-34788e45bced`成功，六字段均非空且`needsMoreEvidence=[]`。字符数依次为problem110、insight129、method182、results206、limitations143、reproducibility191；页面已观察六个textarea与数据库一致。
- Method跨正文、公式、图注和参数概括研究路径；Reproducibility给出可据文重建的最小配方，并把有限元网格、边界、收敛与归一化疑义作为披露缺口，而非字段缺失。用户SDF与后续机器MediaBrief保持分离。
- science-v4 review合同将补证影响范围改为结构化`affectedFields`，`blocked`只用于无法形成不误导摘要或核心物理冲突未解。合同版本进入attempt身份；旧v3答复不复用。
- 候选复用与网页答复复用已分离：任何能重新绑定同一SourceMap的既有六项草案可直接复核；只有候选hash与合同版本全同才复用网页答复。当前任务在该优化部署前曾对method/reproducibility各执行一次MiniMax定点修复；后续相同升级不再产生这两次调用。
- 科学review broker在持有单实例flock期间每15秒原子刷新ready；实际长任务超过60秒仍保持新鲜。补证调用失败或合同无效时保留初审产物，只按审阅者显式`【影响…】`范围阻断；协议版本进入补证attempt身份，刷新幂等键恢复父attempt谱系。

## Chat 6 Pro

- 既有6 Pro方案要求单写入者、精确canonical、提交后只续取不重发、PNG入产品才算链路成功、发布前人工科学审核；实现遵循该方案。
- 2026-09-10再次在服务器页面确认选择6 Pro；同一新规划请求及一次页面Retry均返回平台错误，未取得新方案，因此停止重复消耗。Chat整体可用，不能把本轮网页错误写成接口不可用。
- 2026-09-11同一规划会话再次使用6 Pro复核readiness、部分保留和幂等方案；答复确认根因与最小方向，并要求显式影响范围、补证request去重和旧结果不能覆盖新状态，已落实到当前release。

## Open risks and next action

1. 六字段提案已可确认，但尚未写入canonical SDF；下一步等待用户对当前完整提案作一次明确确认，不得替用户批准。
2. 用户确认后由Hermes从已确认版本生成详细内部生图brief，走现有网页生图provider，随后审核、发布和公开RO。
3. v3补证原始答复`03bc4bee…`仍为历史invalid_response审计产物；当前science-v4以新attempt完成，不覆盖旧记录。
4. 当前三条RO中两条是同一Quantization PDF；第二篇精选须使用不同PDF，不能把重复论文计数。
5. 视频保持暂停；先完成图片与公开RO的高质量闭环。

## Read first

- `AGENTS.md`
- `docs/OpenScience_Kimi_Development_Spec.md`相关章节
- `docs/runbooks/server-capabilities.md`
- `docs/runbooks/chatgpt-browser.md`
- `docs/plans/2026-09-05-integrated-research-product-plan.md`
