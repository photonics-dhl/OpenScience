# OpenScience 当前进度

## 2026-09-12 — 第2项已部署，真实阅读格式纠错收尾
- b254400e部署exit0，rollback76ead135，parser/worker已启动；日志xgs-stage2-deploy-20260912.log。未运行测试/CI/本机构建。
- 真实MiniMax-M3阅读返回内容但部分观察省略空qualifierPassageIds，旧guard拒绝并产生无效重试。修复仅接受缺省，内部归一[]；已有ID和非法值继续严格校验，High定向复核无阻断。真实候选已保留，可经新guard复用，只需继续reduce。完整理解尚未取得，不声称科学质量通过。

## 2026-09-12 — 公式缺陷修复与第2项理解能力候选
- 已查看原PDF第2/3页，两个代表公式与原图一致；产品ScientificText生成实际阅读HTML，32式中28式可排版，4式重复/混入正文/括号损坏，不能将此前warnings=[]视为全正确。未修改公开RO。
- 候选修复：隔离parser接入既有KaTeX依赖，坏公式保留orig与页/bbox、confidence0/low_confidence；不猜补公式，不重跑整篇PDF。受限识别结果仍需来源上下文判断。
- Chat6Pro实际回复“观察—来源—适用条件”结构建议，原回复/jobs/hermes-stage2-chat-plan-20260912.txt。候选按观察保留来源/限定/算例，程序分配ID并展开原文，保留未选假设/限制/不确定材料，非法ID不再静默删除。
- scientific-critical-thinking项目运行时适配已实现，map/reduce/final按阶段注入，复用Gateway与现有独立科学复核，不改DB或发布权限。当前生产仍76ead135；候选待服务器必要构建/部署与真实理解观察。图片/视频风格及写作后续保留。

## 2026-09-12 — 第1项文档与公式已部署、取得真实输出
- 用户批准按清单逐项落实，并明确保留后续图片/视频艺术风格、构图、叙事、镜头/旁白能力。本轮只交付文档/公式，不开启媒体或批量冷启动。
- 服务器复用Docling Serve镜像，仅补缺失CodeFormulaV2 0.3B模型，revision ecedbe111，权重630993616字节。只读独立缓存挂载、公式增强开关；解析保留TeX/页码/bbox，公式空识别与高级回退明确标记质量下降。
- Web增加KaTeX统一科学文本，研究理解skill v5通过Worker显式导入；主线程实现解析/部署、Sol Medium做Web、Sol High定向风险复核。当前release76ead135、rollback5c655bea，服务器必要build/start完成，无测试/CI/本机构建。
- 真实论文经docling-serve-cpu1.30.0完成26页、32公式，warnings=[]，原结果/parser-jobs/formula-reading-20260912.json。未修改RO/SDF/发布内容；逐式原图核对与新公式产品显示尚未确认。旧公开图文已观察正常，不能替代公式质量结论。

## 2026-09-12 — 服务器能力盘点与接入顺序
- 用户认可一站式方案，先要求准备论文理解、科学写作/撰稿、精美输出与文档/公式能力。通过项目SSH入口只读查看生产release、容器、指定包/非敏感配置与已有skill，release仍363257aa；未安装、部署、测试或重跑论文。
- 确认Docling Serve CPU1.30.0已生产，公式增强false，应用缺少统一数学渲染；宿主research-paper-writing存在但Worker只显式加载内置分析skill。已纠正旧candidate表对当前Docling状态的误导。
- 已查原始仓库：K-Dense科学写作/批判分析/引用技能可按项目适配；MarkItDown补格式入口，不能代替公式OCR；beautiful-notes未定位唯一来源，不冒装同名App。按文档公式→理解→写作引用→精美输出→格式扩展→媒体顺序记录到能力台账。
- 当前只有文档变化；完整准备清单位于docs/runbooks/hermes-capability-registry.md，具体运行入口位于server-capabilities.md。Chat6Pro完整回复e2850072已取回；采纳实际技能加载、分离文档类型、格式优先复用Docling、按需导出；文档公式缺口前置。静态git diff --check通过。

## 2026-09-12 — Hermes持续协作与创作能力方案，尚未实施
- 用户只要求先思考给方案；已定向阅读创建页、对话合同与媒体编排，确认旧blank/import分流、必填标题、空上下文和有限风格合同；方案原地追加于2026-09-05产品设计spec。
- 建议统一首次创建/追加附件/再次分析，自动形成可撤销草稿并保护手改；移除形象大小切换，随后增强全文理解、视觉策划、多风格生图和视频叙事。
- 本轮仅文档方案；源码HEAD4b2dda83，沿用上轮生产363257aa/rollbackc0fdc389记录，未重新查询服务器、改产品代码、部署或运行测试。Chat同一6Pro会话完整回复a9aa220b已取回并纳入；已明确制作指令不重复确认。静态git diff --check通过。

## 2026-09-11 — 研究桌面与公开阅读体验已部署
- branch codex/onchip-video-release；worktree .worktrees/onchip-video-release。ECS应用/源码363257aa2a98a47e847f676aa32fd675f53f1ad6，rollbackc0fdc389d06d0dfd49213945d0641644854e7090；provider d1630135/rollback92cc416e不变。后续docs-only HEAD不是新的应用release。
- 服务器必要build/start完成，deploy --no-tests --skip-migrate --reuse-unchanged-capability-images exit0；未运行测试/CI/本机构建。。日志C:/Users/Mac/AppData/Local/Temp/xgs-ui-final-deploy-20260911.log。无测试、CI、本机构建或新模型/生图调用。
- 研究桌面明确继续研究与需处理/后台任务；保留真实并发与历史；初次读取、部分失败、真实无任务分开，专用任务接口失败不吞掉global成功结果，可见页/focus静默更新。
- Hermes卡片保留透明形象与实际对话Drawer，关闭桌面旧全局重复头像。研究卡片直达编辑器；加载期与成品背景一致。
- 编辑器四个大块资料归入文末“资料与修改记录”；未确认AI提取只在正文实际操作处展示，保留必要来源/缺失字段确认。
- 公开页贡献→完整核心图/可选视频→六字段→折叠来源历史；版本/日期/复制引用同行，无内部枚举和假图；不存在的视频保留短行。
- 探索与首页复用已发布版本真实缩略图/标题/洞见；只有一条结果时图文横卡。“最新公开”按publicId倒序，不冒称人工精选或最新版本时间排序。
- 3条Task/E2E（19/20/21）经既有domain脚本可恢复归档完成；实际公开index仅22，原文件/Publication/公开ID保留。
- 根SessionProvider、validated /me Cookie续期、跨标签状态和迟到请求竞态已实现；实际/me200且Set-Cookie续604800秒，桌面→编辑器→探索→公开页账号保持。未复现真实401，不能以短期浏览证明长期绝不失效。
- 363最终实页：桌面floating stage=0、卡片头像=1，真实2项需处理任务和6条历史可見；对话Drawer可打开/关闭，未发送新模型请求；探索单篇横卡图文同屏且账户保持。已查看最终桌面/探索及未变化的c0fd公开/编辑器截图。
- 项目apple-design/emil-design-eng/frontend-design实际用于实现，入口skill增加页面职责/缩略图/资料层级约束；无重复安装。Chat6Pro完整产品规划已取得并采纳；Sol Medium桌面、Sol High会话及独立风险复核，未降低科学标准。
- 实际截图发现的旧global头像和假空任务已再修，不因必要构建通过就宣称页面完美。完整截图使用非css CDP layoutViewport尺寸，已解决Chrome125%造成的取图裁切。

## 真实带图公开成果（保持）
- https://openscience.428312321.xyz/research/OSR-2026-000022/v/10 ，RO c896802c，正式v10=f4e2dc71，草稿修订11。
- Hermes对话发布201，2026-09-11T14:39:38.371Z；b19核心PNG1672×941经主会话/Sol High/Chat6Pro审阅并approved，公开naturalWidth1280。
- 复用原高级解析和Hermes六字段；48context来源人工确认、2标题引用移除、重复节点归supporting，102Evidence/12claims/6core、原PDF/历史/图片来源保留。
- 既有发布恢复与review校验前移已部署；不放宽publish终检，不放行旧rejected科学错误。
- 本轮没有重新提取或生图。既有完整样例含人工浏览器恢复、证据确认与节点整理，不能冒充任意论文全自动可靠处理。

## 下一阶段与边界
- 本轮UI之后再提升Hermes全文理解、来源关联、去重和科学自审，减少人工纠错；不以减少按钮替代科学质量。
- 当前一篇真实带图公开；2–3篇精选目标尚未全部完成。视频、真实多图HTML样本/独立导出与更大范围旧数据清理仍待后续，暂停批量冷启动。
- 唯一CURRENT：docs/handoff/2026-09-10-hermes-web-image-handoff.md；版本、原始素材ID、归档和控制入口以其为准。
