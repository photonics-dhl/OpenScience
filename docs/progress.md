# OpenScience 当前进度

## 2026-09-12 — 接续写作部署
- 实际生产仍a1ff2db9、rollback57f00dc9；aa5d2e85上次已进入服务器构建，但Web因lib/api.ts漏导入/导出SourceLocator而失败，尚未切换应用。日志xgs-hermes-writing-deploy-20260912.log。
- 按systematic-debugging/architecture-guard定向静态定位，复用domain已有类型，仅补Web类型导入/导出；继续必要服务器build/start，无测试/预检/CI。
- 836d6018服务器Web构建完成，Worker随后报TS18046（引用检查回调丢失shape.body类型收窄）；改用已收窄局部变量，引用校验行为不变。该轮未切换生产；日志xgs-hermes-writing-fixed-deploy-20260912.log。
- 沿用已批准的私有写作与Chat开发复核范围。语义续跑补丁仍单独待定，不阻塞写作部署；后续媒体艺术、构图、叙事与旁白继续。

## 2026-09-12 — 私有科学写作与失败诊断
- branch codex/onchip-video-release；ECS a1ff2db9ecc6f8f598c2a72d05aaee3c7dfd1889 / rollback57f00dc9ee7182fffe2e8e2a29d506a39ceeff4e；唯一任务接续 docs/handoff/2026-09-10-hermes-web-image-handoff.md。
- 实际agent a1c0da49 bridge首次成功42191tokens/124574ms；final主接口provider_empty、备用HTTP401，六字段为空，未采用/公开。失败final用量未知，不能依据旧0值计费或推断原因。
- MiniMax-M3、Docling/公式/KaTeX、多格式解析、统一创建入口均已部署；新建页Hermes实际208×208/opacity1。
- 用户明确批准按写作指令处理当前研究私有草稿/必要摘录。backend科学写作/引用、frontend宽阅读/编辑/Markdown下载已实现待部署。High修普通问答误触发、旧链接覆盖新稿；直接保存不调用模型。
- 空响应诊断High静态复核通过，缺失usage记null、安全finish/block数量，明确length停止同预算fallback，待部署。
- 语义结果复用补丁两次自动审批拒绝（新增复用校验必要性说明不足），已停止并披露，待用户明确批准；extractor无残留。只存hash不能恢复旧bridge正文。
- 未测试/预检/CI/本机运行；下一步完成定向review与必要服务器build/start，按实际结果继续。原RO正式v10/已审核心图保持，2–3精选、多图真实样本/视频尚未全部完成。
- 图片/视频艺术风格、构图、叙事/旁白仍列第6项，写作落地后继续，不改服务器网页图片路线。

历史完整进度见Git；当前结果/成本边界和受保护ID见CURRENT handoff。
