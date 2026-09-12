# OpenScience 当前进度

## 2026-09-12 — 真实质量闭环进行中
- bff63acb已部署/rollback0df87c9b，必要服务器build/start exit0。实产笔记ee842ec4覆盖100563字符/306段，正文2271字符/29引用，38437+5257tokens/43852ms；独立对原文发现6项实质科学修订，未判质量通过。
- 实际页面因GET task缺researchObjectId而不显示稿件；补已授权session派生scope。写作v3保留parser origin并强化研究性质/几何/积分对象/同位置阈值/假设/候选公式；待下一次必要部署后真实修订与保存。
- 未确认refresh当前f51c10ad，bridge两次schema拒绝（chosen type/length，results>4），无final/无可保留成功stage。原有约束已完整，候选仅使retry反馈携带现有全骨架，避免只修一处而漂移别处；不放行错误或增预算。
- 用户明确继续落实并实际校验质量；已开始当前论文私有约1000字中文笔记与已说明的语义续跑修复，不再等待旧问题。当前应用仍0df87c9b/rollback68a0e6b2。
- 真实写作37ba18af失败于结构化schema（used_source_marker_missing,unresolved_issue_fields），M3 16366输入+3598输出/34990ms/stop；没有成功稿，不把任务调用当质量通过。
- 读取生产SourceMap发现写作48k packet仅113摘录、遗漏193段；完整原文100563字符/290 blocks。正在修复为已有120k全文范围，程序从正文派生引用清单，保留未知ID拒绝与原输出/重试预算。
- extractor候选保留现有semanticStage的成功reduction/最小P绑定，同源续final，旧数据自然回到bridge；High静态审阅无阻塞。尚未部署/实际续跑。
- 引用High审阅发现并修复旧packet编号漂移、合并引用保存丢失；另修复论文refresh后旧笔记反向提取关联失效，仍按原私有sourceMap/已验证引用保存与修订。
- 已独立核对原论文10项科学要点；下一步修复上线后取真实成稿逐段比对，并验证实际阅读、引用和编辑保存。媒体成片/多样格式兼容未完成。

## 2026-09-12 — 接续写作部署
- 最终应用0df87c9bee98c2280396551ed522e66230eaf381 / rollback68a0e6b248891b308a963f75988bf230f1b832c4，媒体部署exit0；公网release一致，API/Worker healthy。video runner同0df87c9b，active/accepting，复用原镜像/模型和未变化的Gateway编译产物；旧service已留备份。日志xgs-media-direction-deploy-20260912.log、xgs-media-runner-deploy-20260912.log。没有新媒体任务。
- 68a0e6b2已部署exit0，rollbacka1ff2db9；公网/__release与.release-id一致、API/Worker healthy。写作/引用/笔记阅读编辑保存下载及失败用量诊断上线，首份真实写作稿件未生成；日志xgs-hermes-writing-build-fix-deploy-20260912.log。
- 媒体增强已部署：图片艺术指导/风格连续与视频叙事/旁白runtime指令，保留科学来源边界；视频元数据沿既有storyboard文件完整性机制传入runner，旧请求默认保持。独立High静态review无阻塞；中文视频入口保持，英文语音与新图/成片质量未观察。
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
