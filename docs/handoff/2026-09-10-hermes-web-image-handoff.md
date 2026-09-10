# Hermes Web Image CURRENT Handoff

## Goal and constraints

- 真实用户流程：上传论文→服务器解析/OCR与Hermes全文理解→六维凝练及原文证据→用户确认→内容驱动生图→人工审核→发布→公开RO。视频暂停。
- 产品落地优先；禁止测试、预检、CI和本机运行。服务器只执行部署必需构建/启动及真实产品任务。不得用手工内容冒充服务器能力，不得自动批准科学资产。
- 六维不是章节模板；隐含方法必须由Hermes跨全文归纳，所有结论保留可核对来源。

## Version tuple

- worktree `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`
- branch / HEAD：`codex/onchip-video-release` / `d850fadbbe579481f68ab4d57f53f6910dee4120`
- production / rollback：`d850fadbbe579481f68ab4d57f53f6910dee4120` / `0c635525e3bffcd7a30199b0770cc3af37d3bc1b`
- browser provider bundle：`0c635525e3bffcd7a30199b0770cc3af37d3bc1b`

## Completed

- 服务器 `chatgpt-web` provider 已由真实Hermes `presentation.generate`任务端到端生成并回传产品草稿；不是Codex手工生图，也未走API计费fallback。
- task/asset `eb48809b-c402-4983-969d-ee82d0fe6200`：`succeeded` / `draft`，PNG 1280×720、971354 bytes，hash `773ed60431c3f04c07463df0f24fae54db9f1ea5ab003c04d7e8907268ef76be`。
- canonical Chat会话 `6aa23223-62f8-83e9-9b43-19d424eb51a6`；source claim `7397c444-19d4-4900-b060-b9e1004261f4`；approved storyboard `5076fcc6-54a8-4ee0-a40b-517c38e58090`。
- 恢复链已部署：精确request/result/provider/task/prompt hash与PNG证明；复用原prompt/result而不重新规划；提交后最多一次浏览器重启并回到精确会话续取，绝不重发。
- 旧rejected图片从主画廊移除但保留审计；生产截图已观察当前草稿与批准/退回操作。
- 图片中的自由空间传播模、Bethe经典描述边界、局域孔径模式量子化问题均有论文原文证据。仍需用户人工批准后才可进入发布候选。

## Chat 6 Pro

- 既有6 Pro方案要求单写入者、精确canonical、提交后只续取不重发、PNG入产品才算链路成功、发布前人工科学审核；实现遵循该方案。
- 2026-09-10再次在服务器页面确认选择6 Pro；同一新规划请求及一次页面Retry均返回平台错误，未取得新方案，因此停止重复消耗。Chat整体可用，不能把本轮网页错误写成接口不可用。

## Open risks and next action

1. 当前图片为 `draft`；等待用户选择“批准进入发布候选”或“退回修订”。批准必须绑定上述exact hash。
2. 批准后生成发布预览；公开发布仍需用户明确确认，不自动发布。
3. 当前三条RO中两条是同一Quantization PDF；`deep-sub-cycle pulse`无附件、ingestion或artifact。用户需上传一份不同PDF才可完成第二篇精选。
4. 上传页已接好ingestion轮询、六字段提案、仅填空字段、保留用户修改和逐字段证据；下一篇用真实上传继续观察，不创建演示数据。
5. 视频保持暂停；先完成图片与公开RO的高质量闭环。

## Read first

- `AGENTS.md`
- `docs/OpenScience_Kimi_Development_Spec.md`相关章节
- `docs/runbooks/server-capabilities.md`
- `docs/runbooks/chatgpt-browser.md`
- `docs/plans/2026-09-05-integrated-research-product-plan.md`
