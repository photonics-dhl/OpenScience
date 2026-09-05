# Hermes Research Intelligence CURRENT Handoff

> CURRENT active-memory，2026-09-06 +08。RO内Hermes分镜生成、自然语言修订、对比与审批已部署并通过真实模型验收；任意论文自动生图/视频与全局Hermes对话编辑尚未完成。

## Version tuple

- Worktree E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance；branch codex/product-workflow-design；application source/main d6507eaa07edfdacabe135fd30ff9f91183e0c02（PR93）；后续docs HEAD以Git为准。
- Production active/public/loopback d6507eaa07edfdacabe135fd30ff9f91183e0c02；rollback 64ae87252ebf183742bb0cdfa96941be0fea3cf6。Canonical deploy与retention完成，journal/failed/pending标记均无；core36/search2迁移最新，13容器运行、10健康检查通过，约94GiB磁盘/24GiB内存可用。
- 独立淡彩demo source381705a32deeed38fb94564eccbcbb2c66fb7739，run381705a-20260905T121000Z；/demos/science-video/d2nn/?v=watercolor-v1。应用版本与demo分开记录。
- 根目录旧main和用户未提交资料未动。启动先Git/fetch/checkup/实际release，再读本handoff、需求基线相关章节和当前设计/计划。

## Product decisions and delivered behavior

- 功能/展示优先、成熟方案与已有基座优先、分段效果验收。RO凝练论文，衍生图解释做什么/怎么做，原始图表/代码进入Evidence而非自动证明；暂不做用户上传音视频理解。
- PR86：PDF→Hermes确认→Editor保留源附件→人工Claims→概念图已部署。method/results/reproducibility仍有提取空缺，不声称自动完整理解。
- PR88/89：受审PNG/MP4管理员CLI+原workspace写权限、精确draft版本/Claims、来源/审计/幂等；原生私有视频与单Range；Claims修改使素材rejected，恢复文字不会复活审批。
- PR91：媒体优先、桌面双列/手机单列、完整contain、来源折叠、任务错误可见、当前研究标题和准确文案。
- PR93：选择1–12条当前RO主张，设置中英文与淡彩/技术/水墨预期方向，通过Gateway生成3–6幕分镜；旁白、画面动作、时长和来源逐幕显示。自然语言反馈生成独立新draft，旧稿保留、对比后沿用既有审批；已审批稿仍可作为修订来源。
- 分镜为interactive_html显式子类型，JSONB中存有界结构，DTO只返回验证后的document/locale/style/baseAssetId；HTML转义且仅附件下载。无新表、依赖、队列或SDK；原概念图免费确定性路径保持。
- 分镜任务每次提交1AI Credit，幂等重放只扣一次。Worker模型前与Serializable落库前重验权限、draft、来源、父稿；父稿批准允许继续，拒绝则阻止；异常元数据不可批准。
- 分镜仅使用所选RO Claims及条件/限制，不读取原始Evidence/SourceMap。风格是规划方向，尚未自动调用生图或视频；Hermes入口在RO分镜面板，不等于全局自由对话已接通。

## Fresh acceptance

- 全仓build/typecheck/lint/test通过（现有search storage.integration8项因无测试库跳过）；最终Web503+5测试、11浏览器流程通过；独立后端安全/并发与前端复审通过，PR93及最终main CI通过。
- 最终SHA服务器全build、Parser16-case正式source/image报告、BGE真实向量和ScanSci运行/OA检查通过；无迁移，部署前备份core28M/search20K、7/7保留。
- 受控管理员私有RO bcbf1586-b6bd-44b6-ab66-c675fcddce78，version57d10269-2ba7-4eaa-88fc-622a00d20ef5。没有修改普通用户权限、邀请或公开发布。
- 真实MiniMax-M3：3任务/4调用（Worker日志确认1次结构化重试），3扣额/3生成审计；重复提交没有重复素材/扣额，成本日志美元值null，不编造金额。
- 初稿72bfd097-68cd-4b75-8d39-1ce465a14e10及首次修订e959a696-22a0-477c-b2ab-03bb2474f3ef保留draft；科学核对修订74ef00f4-be7e-4a95-9256-c22dbee7ad33已approved，六幕合计45秒为规划时长。
- 初稿错误地把“平台说明不是独立实验验证”推成“论文没有独立复核”。通过反馈纠正了该无来源判断、研究者称谓和波前表达后才审批；模型内容仍需科学审阅，未把JSON有效当作科学正确。
- 公网en/zh×1440/390显示/无溢出、父稿对比、批准/刷新、会话注销通过。旧插图可解码，原41.291667秒视频仍可播放；原两媒体保持rejected（历史Claim失效测试状态）。
- Evidence ignored apps/web/test/visual/out/science-video/: storyboard-browser-evidence.json、storyboard-audit-evidence.json、storyboard-approved-{1440,390}.png、storyboard-parser.log、storyboard-deploy.log。控制账户不是用户个人RO，勿把其链接当作用户可访问展示。

## Constraints and next action

- 用户已授权实施/合入/部署/真实论文验证/必要开源方案，不重复询问。不得读取/打印.env、Cookie、密钥；云上仅项目SSH/deploy脚本。
- 复用Chromium、CPU Canvas、离线Qwen；torchCPU基础约0.97GB，Qwen子镜像约2.04GB含基础，模型4.52GB。BGE依赖不同，不合并可变环境；无GPU，不重装模型。
- 用户接受v4 Serena完整41.28秒WAV；原WAV不分段/补静音/变速。淡彩视频41.292秒/3,203,000bytes，ECS渲染37.76秒；未以本轮分镜重生成配音或视频。
- 已知边界：来源/权限在扣额后改变可使任务失败；模型返回到素材提交间故障可能重复provider调用；Storage先写后DB失败可留私有无引用对象。公开review digest未纳入媒体的历史债务在扩大公开发布前复核。
- 下一步：以已核对分镜作为输入，接可溯源图片资产与隔离CPU视频渲染，保留当前声音；再把分镜/媒体目标接入全局Hermes对话。优先复用现有渲染和成熟方案，实际测质量/成本；未接的能力不显示假成功。
- 同事frontend/nanqing上次核实e5db5ae；已有每日10:00巡检自动任务，勿重复创建。下一次合并前重新fetch比较。
