# Integrated Research Product Design

## 2026-10-01 全站入口与视觉收敛（本轮目标）

本节按用户最新批评重新整理。早先六步页边指南是未经产品质量认可的候选；用户已明确否定其防御性文案、冷漠标题、叙事和审美。暂停沿该候选实施与发布，先研究成熟产品、明确整站表达，再比较具体构图。用户最新决定：当前 Landing 主视觉与正文保留并退出改版与比稿；10-01 后续明确允许统一首页导航。判断必须以真实网页为准。UI 本身也须设计，覆盖成熟网页的视觉、交互和使用状态。本节的文案与构图均为讨论建议；执行、部署及用户反馈只见 [Hermes CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)。

已确认的方向继续有效：公开首页承接研究与期刊探索；私有研究桌面承接创建与继续研究，创建退出全站导航；Hermes 是私有工作主要操作入口。保留已认可黑白光学体验与原 Hermes 形象，冷白／墨色／青绿、学术编辑设计及瑞士现代主义 2.0；整站合理使用艺术与动效，阅读保持焦点。

### 先学方法，再解释自己的产品

以下是实际阅读官方公开材料与浏览首页的观察，不能据此推断产品转化率、内部工作区或 OpenScience 的能力：

- [Linear 的设计开发方法](https://linear.app/method/manage-design-projects)先核实问题，再探索多个方案，利用早期反馈找出设计和故事的缺口，选定方向后细化；设计与工程从规格阶段协作。这支持本轮先处理叙事问题，不能只改样式。
- [Linear 与用户共同开发](https://linear.app/method/build-with-users)要求持续在产品愿景与用户反馈之间校正，追问使用情境和真正问题。用户本轮指出的是研究者动机与页面表达失配，不是缺一个装饰组件。
- [Linear 首页](https://linear.app/)先说明面向团队与代理的产品开发用途，随即展示进行中的 issue 和工作界面。借鉴其“具体任务＋画面证明”，不照搬项目管理状态密度。
- [Elicit 首页](https://elicit.com/)当前标题为“AI for Scientific Research”，视频展示研究问题、论文搜索和带引用的报告。借鉴研究者可识别的输入与输出；不沿用其宣传数字或将企业子站当作首页。
- [ResearchRabbit 首页](https://www.researchrabbit.ai/)用好奇心吸引进入，再展示从一篇论文展开关联的文献图。品牌图形与核心探索动作相连；OpenScience 应找到自己的科学内容与动作关系。
- [Linear 入门](https://linear.app/docs/start-guide)先提供产品概览／demo，再讲工作区和角色操作；[Notion 创建页面](https://www.notion.com/help/create-your-first-page)用视频、屏幕图和短动作说明帮助开始。引导可以解释操作，重点在第一项有意义的行动。

### 对现有页面的具体诊断

早先静态首页截图不能代表当前网页，基于它提出的首页构图判断撤回。已从真实 Landing 观察原有光学体验与公开研究；用户原先确认整个首页保留，10-01 后续明确允许仅同步导航：探索、期刊、使用指南为公开入口，研究桌面与账户为工作及工具入口；导航中的创建归桌面，设置/API/期刊审核归账户菜单。主视觉、文案、内容和光学动效继续保留，共享 CSS 不得连带改版。

被否定的指南用了大标题、叠纸图形、六步目录和示例框，却没有呈现一个可读的科学成果或实际产品操作。叠纸只有空线，不能承担产品证明；整页同一灰白层级，图与文字缺少轻重关系。“公开前须人工确认”“公开不代表同行评审”“非真实研究”等挤进主引导，阅读体验变成系统规程。把六步缩成三步不会解决这个问题。

桌面候选虽有继续入口与 Hermes 形象，测试截图仍以泛化的“正在进行的研究”和文件名占据内容。下一版应让研究题目、真实进展和此刻可做的动作有主次；用真实内容判断布局，不能把 fixtures 的整齐当成产品质感。

### 中心叙事与页面职责

产品愿景沿用 Science evolves. / Beyond papers. Toward living research.。落实到用户收益：读懂一个新研究，把自己的成果讲清楚，并在同一个研究空间继续完善。公开阅读用作品让人产生兴趣，私人工作让人推进自己的研究。

下面是逐页讨论稿。按钮必须有明确目标；阅读页、编辑器和即时偏好控件不强行补一个大主按钮。区域顺序兼容既有能力，不新增文献关系图、评论活跃度或虚构演化记录。

| 页面／此刻目的 | 区域顺序及表达 | 主操作与目标 | 次级操作及原因 |
|---|---|---|---|
| Landing：保持已认可体验 | 原光学品牌、文案、内容、动效保留；导航按最新授权与公开页面统一 | 公开探索／期刊／指南，与桌面／账户分工 | 工具放账户菜单；正文不参加本轮重做／比稿 |
| 探索：找到感兴趣的研究 | 可用搜索／筛选；题目、贡献、图和作者；与排序含义一致的研究列表 | 题目／图进入对应公开研究版本，直接开始阅读 | 搜索与已有筛选供缩小范围；不另加泛化“查看研究”按钮重复整行链接 |
| 期刊目录：选择阅读领域 | 真实期刊名称、封面／已有图形和办刊范围；每本期刊主页入口 | “浏览期刊”进入对应 `/journals/[slug]` | 期刊入驻与编辑工具放次级区域，读者不先看到管理任务 |
| 期刊主页：阅读该刊内容 | 期刊身份与简洁介绍；已有公开文章目录；单篇标题、贡献和图 | 文章标题进入真实文章／解读页 | 投稿或编辑部操作按实际角色展示，不与阅读争抢 |
| 公开研究：理解具体贡献 | 题目／作者／一句话贡献；完整核心图与已有视频；凝练六项正文；文末资料 | 正文直接可读；媒体的“下一张”只在确有多图时出现 | “查看原文／引用／版本”在资料区满足深入阅读；不在已经打开的正文上再放“阅读研究” |
| 研究桌面：继续手头工作 | 最近研究的实际题目与下一步；需要处理／后台进行；Hermes 陪伴入口；创建与研究列表 | “继续研究”进入对应工作页；新用户空状态把“创建研究”作为主操作 | “上传 PDF 或资料／从空白开始”均从桌面进入既有创建路径；资料管理为次级工具 |
| 创建：把自己的材料带入研究 | 返回桌面；论文或想法起点；已有附件控件与清晰开始动作 | 使用当前可用的开始分析／开始研究动作进入该研究，文案随材料状态变化 | 追加／移除附件服务当前输入；不用额外的“创建空间确认”再加一道表单 |
| 研究工作：完善研究表达 | 贡献、核心图与正文；Hermes 常驻对话；资料和修改记录按需打开 | 在正文直接修改，或向 Hermes 发送具体研究指令 | 原文、媒体切换、资料记录服务当前内容；不恢复旧阶段表单与重复保存／审批按钮 |
| 使用指南：学会第一项实际操作 | 一个真实研究表达；同一场景的产品操作演示；进入桌面；按任务查找的短说明 | “进入研究桌面” → `/dashboard`，在桌面开始自己的研究 | “阅读这项研究”进入演示所用的公开版本；指南中的切换只浏览示范，不启动科研任务 |
| 个人页：完善自己的学术资料 | 账号身份；实际支持的研究档案字段；身份关联；更新反馈 | “保存资料”对应当前表单修改 | 身份关联、放弃更改和设置入口就近放置；`/me` 是私人资料管理，不能冒称已实现公开作品集 |
| 设置：调整偏好和账户 | 语言／阅读／动效偏好；账号工具；退出登录 | 控件按现有即时或表单行为生效，不虚构统一“保存设置”按钮 | 个人资料与返回桌面为次入口；API、审核、期刊管理按已有角色在账户工具内定位 |

### 设计方法与工具选用

使用项目实际交付树的 `frontend-design`，而非根目录导航树中的旧清单；既有 Apple Design 与 Emil Design Engineering 继续承担即时反馈、阅读节奏和动效。新增 [product-story-design](../../.agents/skills/product-story-design/SKILL.md) 串联研究者任务、页面职能、真实作品证明与构图，复用本设计，不另建定位问卷或第二份产品文档。

[Impeccable](https://github.com/pbakaus/impeccable) 的表面模式、独立视觉批评与字级/空间方法用于细化；[Marketing Skills](https://github.com/coreyhaines31/marketingskills) 的 product-marketing / copywriting 用于具体收益及下一行动。它们的固定访谈、英语转化模板和无来源营销数字不作为科研产品要求。源码判断、技术检查和真实视觉验收分开。

[Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)补充“从产品内容建立构图、实施前对照简报、表达集中在有效焦点”的方法；[Anthropic design-critique](https://github.com/anthropics/knowledge-work-plugins/tree/main/design/skills/design-critique)用于有界评审首印象、可用性、阅读层级、一致性及可访问性。评审明确输入是实际网页、Figma、截图或源码描述；源码不能证明首屏视觉、实际对比度或交互质量。指南比稿围绕真实材料与成果的关系，而非通过更换整块底色、增加阴影或重复图文判断质感。配置来源、试用、反馈及后续执行只见 CURRENT。

候选筛选须看实际内容与适用性。Taste 的 redesign 参考建议编造姓名／公司、改变数字及随机日期来制造真实感，因此不采用。Figma 可提供设计变量、组件与实现关联，见[官方 MCP 文档](https://developers.figma.com/docs/figma-mcp-server/)；Figma、MagicPath 的连接和试验结果只记 CURRENT，连接前不宣称具有效果。

### 指南两种构图供比较

[可交互比较稿](../proposals/2026-10-01-research-interface-review.html)采用同一真实公开研究 OSR-2026-000022/v/4、原科学图与原 Hermes 形象。顶部比较工具属于审阅界面，不是产品；不调用模型、上传材料或改动生产数据。公开科学内容来源、图注与版本保持，不虚构账户归属、演化时间线、模型答案或成功任务。

**A：论文与 Hermes 邀请（用户选定方向，仍须打磨）。** 首屏邀请细化为“带上你的论文，把研究讲清楚。”导语为“和 Hermes 从原文出发，梳理核心思路与图文表达，在自己的研究空间里继续完善。”进入研究桌面、Hermes 与第一步提示构成邀请；真实研究标题、完整科学图与阅读入口构成研究示例。中文展示标题用现有 Noto Serif SC，控件与元数据保留 UI sans。科学图采用编辑式 figure，图注沿用该公开资产的 reader 标题／叙述；保留完整图与科学贡献，手机根据内容关系重排。邀请先承接带着论文来的用户，示例说明他们可继续完成的研究表达；两组的具体构图见下方候选比较。

用户后续反馈是“大体合理，但整体太平、缺少视觉主次与质感”。第一轮细化用深墨首屏承托浅色邀请与白色科研纸面；这是用户再次否定审美的历史候选，不能称其已验收。它保留真实题目、贡献、完整原图和科学图注，中文使用现有 Noto 400、图注14px；这些内容与可读性要求继续适用。

A 的后续比较围绕同一论文与 Hermes 邀请：一版先邀请再展开完整研究跨页，另一版将邀请与研究并排。跨页方案把人物与第一步操作放在邀请区域，让真实科研图、贡献和阅读入口形成独立阅读组；手机按标题、邀请与形象、操作、研究内容重排，内容决定高度。研究公开标识、版本和原科学图注保持；阅读场景改用研究问题摘录，不再重复科研图，材料场景使用一般资料提示，不将公开例子冒充个人上传。动效解释选中、按压和展开；原生页面候选与 Figma 概念稿的观察结果分别记录在 CURRENT。

同一产品的其他表面按用途细化：探索页是图文研究目录，图片与贡献并置，无图内容使用整行；样式只在 `data-explore-index` 内生效，Landing 原有模块保留。研究桌面以当前研究的白色主纸面、较大的真实题目和继续入口建立焦点，Hermes 及资料工具位于较轻的次级区域。以上是候选设计决定，实际画面、连接状态、验证证据与用户认可仍只记唯一交付树 CURRENT。

**B：研究作品作为封面。** “好研究，值得被读懂。”同一科学图占据封面侧，短导语与研究桌面入口在另一侧，次操作阅读该项研究。手机先呈现导语与操作，再完整图。它更便于先认识成果，但对已经要上传材料的人弱化了第一项操作。

两版共享按任务选择的三个场景：从论文开始、读懂研究、继续完善；每次只有一项示范与短说明，无强制顺序。其下保留三个就近可展开的问题：无论文如何开始、如何修改已有研究、哪里找原文。桌面比较稿包含已有研究、首次进入、加载和失败状态，创建只在桌面；研究工作与公开阅读沿标题／贡献→完整媒体→六项正文→资料展开连续呈现。公开内容只用作构图材料，真实接入仍须保留完整任务、账户和权限。

### 质感与动效如何服务内容

- Landing 现有光学艺术保留，研究与期刊用真实科学图、编辑标题和精确图注产生变化；工作空间以内容层级、边缘与表面光感区分正文、任务和助手。不是所有区域都包成相同圆角卡片，也不靠空白填充画面。
- 复用现有字体与冷白／墨色／青绿 token；阅读文字 16–18px 起稿，图可以宽于正文，操作文字不小于 14px。首页展示字级与工作标题分开，不把品牌尺度带进日常工作区。
- 指南切换场景时只替换示范画面及就近说明，约 180–240ms 小幅移动／交叠，表现任务改变；不要自动播放抢走阅读。研究图切换保持内容区域和题目稳定，表现同项研究的不同解释视角。
- 按钮即时按压约 100ms，展开和选中反馈约 120–180ms；状态变化发生在相应操作附近，避免整页闪烁。已认可光学动效继续独立运行，不把科学图变形来模拟不存在的科学演化。
- 装饰运动在阅读正文时退场，减少动态效果关闭非必要过渡；手机简化构图但保留真实入口。真实内容与可操作状态下才能评价美感，不能靠截图中的假任务成功。

### 下一轮设计与实现的检查方式

逐页核对“用户此刻目的—此区让他理解什么—下一步去哪”，在已选 A 的方向继续细化，Landing 不改，连同公开阅读与桌面放在一条旅程里看。让第一次进入的研究者看实际首屏，判断能否说出产品给自己的价值、找到阅读入口；再给“我有论文，想开始整理”的任务，观察能否从指南进入桌面并找到创建。观察清晰度、兴趣、阅读舒适与动作反馈；不以测试数量代替这些产品判断。

新账号 [研究讨论](https://chatgpt.com/c/6abdd57e-654c-83e8-aa2f-d019cb399cbf)已完成三轮，最新四张浏览器图的视觉评议已核实采纳：首项上传提示、贡献先于科学图、减轻灰框、合并重复邀请及阅读入口、桌面共用工作面。实际研究资料、答复、素材出处和原生截图在任务树 ignored `tmp/ui-narrative-20261001/`。比较稿是本地设计产物；技术交互检查不能代表用户已认可设计，也不能当作应用已发布。公司 Word 的线上结论在实际发布观察后更新。

原生接入沿用现有公开索引与科学文本组件，图片完整显示；示范加载失败的重试只读取公开内容。公开页的账户工具放在顶栏 utilities，避免被横向导航裁切；手机只收起姓名文字，账户头像、完整无障碍名称与所有菜单仍可用。公开阅读只显示本版已有的媒体，单一图或视频使用完整阅读宽度；资料、来源、媒体资格与后台科学流程保留。

### 成熟网页的逐页设计范围

用户对浅色跨页候选的最新评价是“好多了，但仍需打磨”，并再次要求全部产品页面继续优化。覆盖依据是现有生产路由和它们复用的壳／正文／资料／期刊组件，不以内部 `_visual` 页面代替产品页面。保留 Landing 主视觉、正文与光学体验；这次补接用户明确要求的共享 Hermes 陪伴。

本轮补读 [Linear 项目界面与属性侧栏](https://linear.app/docs/projects)、[Notion 侧栏和私人空间](https://www.notion.com/help/navigate-with-the-sidebar)、[Elicit 研究步骤与来源对照](https://elicit.com/blog/systematic-review/)。采用的具体方法是：操作与属性分层、全站／当前研究／账户导航分工、正文与来源按需对照。以上来自官方说明；不能将这些资料或源码检查称作实际 OpenScience 的视觉观察。

| 生产页面组 | 本轮细化的共同表面 | 仍需实际观察的内容 |
|---|---|---|
| `/research/[publicId]` 与固定版本 | 题目与贡献开篇、完整核心媒体、连续正文、来源折叠与打印 | 真实论文、长题目、公式、图注和手机阅读 |
| `/research-objects/new` | 资料投放、目标输入与开始动作，格式说明就近展开 | 上传、登录返回、处理中与失败保留材料 |
| 研究的 overview/edit/presentation | 研究题目、正文纸面、编辑与媒体、Hermes 入口 | 真实任务、草稿保存和媒体同步 |
| 研究的 files/hermes/versions/publish/collab/sandbox | 共享研究壳、当前研究导航、内容与次级工具分层 | 角色、实际状态、恢复和合法写入反馈 |
| journals 目录／公开期刊／加入与申请 | 学科／题目／摘要、搜索与阅读入口、申请表 | 真实数据、空状态、分页和长字段 |
| 期刊 manage 及文章／来源／processing／services，admin 与 curator | 局部导航、工作列表、表单、状态与操作 | 真实角色及当前来源／文章处理状态 |
| login/register/me/settings/developers/trash/collections | 身份邀请、账户分组、API 文档、列表与恢复入口 | 登录回跳、实际额度、删除恢复与公开集合 |
| guide/explore/dashboard 与共享导航 | 延续已改构图和入口职责，统一控件与全局陪伴 | 内容层次、实际字体、键盘和窄屏点击 |

Hermes 复用既有 Wanko Live2D、动作目录和全局舞台，成为可点击、触摸、拖动和收拢的陪伴入口。过去指南／桌面的邀请用了直接 PNG，而浮动舞台路由只覆盖部分研究区；本轮补齐其范围。10-01 用户的真实登录截图纠正了“单 canvas 就等于单角色”的判断：登录／注册欢迎区、指南开篇与示范、对话标题和概览按钮不再放独立静态角色，删图后相应收回占位，整个页面仅有一个浮动 Hermes。私人工作优先采用当前真实任务与对话上下文，公开／账户页提供陪伴和进入研究桌面的动作；不为表现可爱伪造模型回答、任务成功或私人研究。网页隐藏时暂停渲染，减少动态效果和加载／恢复仅在同一角色实例内静态回退。位置须避开正文、主要按钮、菜单和移动安全区，互动菜单不遮断阅读；实际 WebGL 启动、拖动和点击仍须真实浏览器确认。

以下是实际接入的要求，不是比较稿已实现整站的声明。用原组件和已有能力完成，不为清单增设功能、任务库或门禁。

| 表面 | 视觉与区域 | 交互与状态 |
|---|---|---|
| Landing | 已认可主视觉、正文和光学动效保留 | 最新允许统一导航；其他共享样式改动须隔离 |
| 指南 | 清楚导语、真实科研画面、Hermes、任务示范，层级与留白代替文字堆积 | 标签键盘切换、短过渡、FAQ展开、直达桌面、浏览器返回 |
| 桌面 | 研究题目与此刻动作优先，助手与创建有轻重；实际任务与研究列表保持 | 首次进入、加载、失败重试、搜索无结果；同源历史收拢，不隐藏并发任务 |
| 创建 | 材料入口、论文／想法切换与开始动作连贯，表单标签清楚 | 文件限制就近说明，上传／提交状态与防重复，失败保留材料，返回桌面、登录回跳 |
| 工作区 | 贡献、完整图文、正文共网格；Hermes常驻，原文／记录按需打开 | 编辑、保存与失败反馈就近，既有确认与恢复保留；不得伪造模型运行 |
| 公开阅读 | 学术编辑排版、舒适行长、真实作者／版本；科学图不裁标注 | 多图／视频仅在存在时出现，资料可展开，公式渲染、深链接与返回保持 |
| 探索 | 实际题目、贡献和媒体为视觉主体，搜索／筛选退为工具 | 无结果与加载失败可恢复，排序如实命名，精确公开版本与搜索状态保持 |
| 期刊目录／主页 | 真实期刊身份、范围与文章表达，读者入口优先 | 目录／文章空态，阅读与编辑权限分层；不得捏造封面、热度或精选 |
| 个人／设置／账户工具 | 表单与分组清楚，普通设置不使用广告尺度标题 | 字段校验／保存反馈／放弃更改；语言与偏好沿原行为，受限工具按角色 |
| 登录／注册与恢复页 | 延续同一字体／控件／留白，身份表单有明确上下文 | 保留密码管理器、粘贴与验证流程；错误就近，returnTo与返回原任务正确 |

共通细节：冷白／墨色／青绿与原有英文字体、中英混排；正文16–18px，操作控件按14px及以上起稿，44px触控目标、清楚焦点、跳到正文；图像占位预留比例，重媒体按需加载；按钮即时反馈，场景切换约190ms，正文无装饰运动，减少动态效果关闭过渡。手机保留主要能力、自然换行和可达入口；长题目、无图、无结果、加载、失败、角色受限与真实内容都纳入对应最小检查。深色模式沿当前项目范围另行判断，不据此虚构新增偏好。

> 以下为 2026-09-05 以来的历史批准范围；本轮叙事与审美纠偏优先按上方 10-01 节。
> 本文记录批准范围与推荐交互；用户已认可科学插图样张方向，视频样片与产品接入仍需实际验收。
> 需求基线：`docs/OpenScience_Kimi_Development_Spec.md`。

## 2026-09-11 已确认的交互收敛

以下为用户经 grill-me 确认的目标交互，优先于下文较早的逐步页面/逐次建议确认描述；不代表当前生产已全部实现。真实进度见 CURRENT handoff。

- 每篇 RO 默认是可阅读、可直接修改的研究成稿，精华与已有图片占主区；Hermes 在侧边协助并可收起，共享同一内容、任务和媒体状态。附件、证据、历史、详细制作指令按需展开。
- 公开页以标题、署名与来源、一句话核心贡献、核心媒体进入阅读。有视频时与核心示意图一起直接展示，各有短说明。六字段组织为凝练连贯正文，重要科学限制直接呈现；不把公开页做成编辑表单或字段卡片墙。
- 尽可能减少操作：上传后自动解析、凝练并填入可改草稿。第一个主要确认节点为用户查看内容并选择图片、视频或两者后“开始制作”；后续规划、详细指令整理、生成和回传由 Hermes 自动连续处理，不逐字段/提示词反复确认。
- 第二个主要确认节点为用户查看同版正文与媒体、选定本次公开内容后“公开发布”。中间普通草稿修改自动保存、可撤销；用户主动通过 Hermes 的普通修改直接回显，不要求每次再弹确认。涉及科学不确定性时集中给出具体问题。
- 自动推进不覆盖原件、已公开版本或他人未合并修改，不改变权限边界；原文引用不得被润色。用户选择制作/发布覆盖明确范围，不能据此自动重复扣费重做或扩大公开范围。
- 发布失败的恢复：沿用发布本身的主张结构校验，在审核期间给出问题，避免先冻结再阻断。尚未公开的审核中/已批准版本可由原权限用户通过Hermes“继续编辑”撤回审核，旧审核失效并审计，正文、来源和媒体保留；存在Publication或公开版本标识时禁止退回。已公开内容仍通过新版本修订。
- 布局先用同一真实论文的可点击线框讨论，保持一套已选结构；具体视觉、空间分配与窄屏排列在样稿中收敛，不继续叠加零散页面补丁。
- 用户看过线框后确认布局与信息密度更舒适（2026-09-11），保留主体布局。下一步重做视觉、控件及自然过渡；Hermes 必须显示既有形象，以对话式输入承接指令并判断处置路径，用户不需要先选择底层工具。任务与内容在同一工作台回显；此处是目标能力，独立交互稿中的预设动作不能冒充真实模型路由。
- 用户进一步批准高保真稿风格并要求正式落实（2026-09-11）：采用冷白底、墨色正文和青绿色操作色；工作台/公开页六栏目需要突出，以20px半粗标题、简洁标记、细分隔线和留白建立层级，正文保持18px/31px凝练连贯阅读。Hermes展示完整透明形象、固定对话输入；细节指令默认折叠。无须重新确认已批准的布局、风格和两个主要确认节点。

## 1. Product objective

优先完成可使用、可展示的完整网站。工作区、Hermes、RO 编辑、预览发布与讨论共享研究上下文，让用户知道自己在哪里、正在处理什么、下一步做什么。每项能力先交付完整功能和可理解的界面，再迭代生成质量；不得以空按钮、模拟成功或断开的页面代替完成。

用户确认的完整旅程：导入论文 → Hermes 整理研究对象 → 查看并确认建议 → 生成核心图解 → 用文字或语音要求修改 → 预览差异并应用 → 生成讲解视频 → 预览发布 → 围绕具体结论和证据讨论 → 修订下一版本。

图片和视频主要根据论文生成。音频用于 Hermes 与用户交互，不以音频版论文为首要交付。首期不处理用户上传音视频的转录、理解或证据提取。

### 1.1 Scientific explanation acceptance (2026-09-05)

用户明确纠正：RO 已承担论文凝练，衍生图必须用场景、结构、传播/作用过程和局部放大解释研究做什么、怎么做、为什么有效；文字主张卡片不能作为科学插图完成。用户认可 D2NN 科普生图的视觉方向，仍需纠正探测面与干涉细节，认可方向不等于免除科学检查。

解析器先保留章节、图表/图注与位置；语义切分后 BGE 负责向量检索，语言/视觉模型负责理解与综合。原始图表和代码引用进入有来源的 Evidence，不能把切块保存或模型生成的说明称为独立证明。生成资产与原文、RO 版本和相关结论关联，修改后重新检查。

用户已同意先做同一论文的真实科普视频演示，再固化进产品。首选少量高质量插图配合本地动画/字幕/剪辑；需要时才调用 MiniMax。既有推荐仓库均为候选，按解释效果、准确性、编辑能力、许可、成本和维护负担选择，不为采用某个仓库而增加依赖。

本次演示采用已有 Playwright/Chromium 与 FFmpeg；先验证 30–45 秒成片、中文可读性与探测区域表达。已有图片复用时本次新增图片/视频 API 调用可为零，但不宣称历史图片免费或服务器运行无成本。演示脚本不接受任意用户 HTML，不作为生产模型调用路径。

## 2. Capability reuse

| Existing owner | Product use |
|---|---|
| Dashboard、ContinueResearch、ImportStage、ResearchList | 从开始研究到继续上次任务的统一入口 |
| HermesAssistantDrawer、workspace.guide、literature-intent | 当前研究目标、任务状态、文献获取与下一步操作 |
| IngestionTask、AgentTask、隔离 parser、SourceMap | 导入进度、解析结果、失败恢复和原文定位 |
| packages/search、BGE-M3、Semantic Scholar、ScanSci | 需要时检索研究材料、补充来源与获取全文 |
| Claim/Evidence API、SDF、现有 diff/审批/版本 | 建议预览、人工确认、持久保存与公开版本 |
| presentation/chart-generator、interactive-html | 图解与可交互展示的现有生成和存储路径 |
| AI Gateway、science-worker | 按需模型生成与受控计算；不重新搭建队列或沙箱 |

只读导航不能冒充已实现任意自然语言编辑。新增编辑意图必须实际连接 proposal、审批和持久化；权限、版本冲突、任务恢复沿用原有机制。模型输出不能直接覆盖已确认内容。

## 3. Unified interaction

工作区以当前研究与待处理事项为主；空态明确显示“导入论文”与“创建研究”。RO 内保留稳定的研究标题、阶段、保存状态、返回工作区入口和当前主要动作。材料、编辑、预览、发布仍可使用现有路由，不要求通过大规模路由重写实现统一。

Hermes 接收当前 Workspace、RO、版本及显式选中对象。跨路由继续同一研究任务；切换 RO 时不沿用另一 RO 的目标。用户从结果进入证据或编辑后，能够返回原任务。恢复优先使用已有服务器 task/session 标识，不另造浏览器里的研究事实副本。

文字修改先支持明确、有范围的操作：改写选定说明、调整核心图解、组织展示顺序。确认前显示修改对象与差异；应用后 RO 可见并能刷新复验。版本冲突要求重新预览，重复提交复用原任务。引用原文不得被润色替换。

生成图片或视频时先提供简短内容规划、目标与预计成本；任务进行中显示可恢复的真实状态，完成后进入同一 RO 展示区。失败保留原稿与重试入口，缺少模型配置时诚实显示不可用。生成展示必须与原始 Evidence 区分。

语音采用用户主动开始/停止的交互，先显示可校正的识别文本，再进入同一文字意图和修改预览路径。麦克风拒绝、识别失败、播放失败时可继续文字操作；不持续后台录音。语音确认不能绕过既有高影响发布确认。

公开 RO 先展示核心贡献与图解，再展开证据、方法和限制。讨论围绕当前 Claim、Evidence 或版本，优先复用现有协作系统；若现有数据不足以表示讨论锚点，再单独设计最小扩展。

## 4. Reuse-first research decisions

每部分实现前比较现有实现与成熟方案；记录可复用内容、许可、运行资源、数据流和舍弃理由。GitHub 热度不能替代适用性判断，安装第三方能力仍须在明确授权范围内。

| Area | Candidate/reference | Initial decision |
|---|---|---|
| 页面与导航 | 现有 Next.js、Radix、Research Folio、frontend/nanqing | 优先复用；先验证完整旅程，不新建 UI 框架 |
| 图解 | cathrynlavery/diagram-design | 已查官方仓库，HTML/SVG 与现有路径匹配；先参考布局和图形语法，尚未安装或选择具体模板 |
| 视频 | gnipbao/story-to-handdrawn-video | 参考分镜、插图与转场流程；其无声画面定位不等于完整科研视频产品 |
| 视频渲染 | Remotion | 官方文档已初查；仅候选，需核实商业许可、CPU 渲染成本和部署边界再决定 |
| 语音输入 | MediaRecorder + 待选 ASR 服务 | 浏览器录音接口不是语音识别器；需比较中文科研术语、延迟与价格 |
| 语音输出与生成媒体 | MiniMax 与适用替代 provider | 经现有 AI Gateway；当前受阻能力不得标记可用或绕过管理员限定 |
| 配色 | Huemint、Happy Hues、Realtime Colors 等参考 | 辅助比较实际页面，保留既有品牌；不把换色当作流程修复 |

参考资料：

- [Diagram Design](https://github.com/cathrynlavery/diagram-design)
- [Story to handdrawn video](https://github.com/gnipbao/story-to-handdrawn-video)
- [Remotion documentation](https://www.remotion.dev/docs/)
- [MediaRecorder documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [用户配色参考](https://mp.weixin.qq.com/s/JvO0PVLCXiZKE3TijZH21Q)

## 5. Delivery slices and user acceptance

1. **工作区—Hermes—RO 连贯流程**：真实导入、查看任务、进入对应 RO、确认建议、保存、返回继续研究与预览发布；每页主动作和失败恢复清楚。先交付此段操作效果。
2. **Hermes 文字修改与论文图解**：选定内容 → 提出修改 → 差异预览 → 应用 → 刷新保留；图解来自当前论文/版本，能继续修改。交付真实生成示例供用户验收。
3. **论文视频**：基于同一 RO 的分镜、图片与字幕生成视频，可预览和修改分镜；保留来源和版本关联。使用真实成片验收。
4. **Hermes 语音交互**：录音、识别校正、同一编辑流程、可选语音回复；用真实语音修改 RO 验收。
5. **阅读—讨论—修订回路**：从展示内容回到证据与讨论，再进入修订；验证作者和读者两条路径。

每段交付包括：可操作入口、示例任务、实际结果、桌面/移动交互证据、已知限制和用户效果反馈。现有功能测试、权限/数据安全验证和服务器验收继续执行；不新增无明确失效场景的 hash、baseline 或 gate。用户未验收不得标记视觉或产品效果已接受。

## 6. Collaboration and constraints

用户确认同事分支为 `frontend/nanqing`，授权定期评估并选择性合并优质成果到 main、部署。每日 10:00 巡检已创建；无变化安静。比较实际文件与已移植 patch，不只看 commit 是否在 main；不得覆盖同事未完成工作。

优先采用本机已有独立 worktree，从最新 origin/main 开始，根目录旧 main 与未提交文件保持原样。Landing 与 Wanko 造型保持现状；可优化工作流布局与交互，不顺带重做角色。生产 CPU 条件、权限、审批、来源追踪和受控资源边界继续有效。

以上为最初设计阶段约束，实际交付状态以CURRENT handoff为准。Research Intelligence旧Task1–12保持完成；当前是新的产品交付主题。

## 7. Reviewed-media integration slice

First integrate already reviewed PNG/MP4 into existing PresentationAsset records through an administrator maintenance CLI, never a fake generation task. The actor must also have write membership in the active workspace and the exact version must be draft. Source Claims must belong to that version; import creates draft assets with truthful admin_reviewed_import provenance and audit, explicit approval remains separate. Existing Claim edits/deletes invalidate imported assets. No arbitrary user media upload or automatic paper generation is claimed.

Private/public safe-video reads support one HTTP byte range after existing authorization and full-object checksum validation. The existing16MiB buffer limit stays; first samples are below4MiB. List metadata adds canTransition, computed from draft/writer/admin restrictions; frontend media controls fail closed if absent. Private workbench has inline native video, clear creator text and linked Claims. No schema migration or new provider.

The old ordinary-user personal acceptance workspace cannot invite an admin; do not change roles or bypass scope. Use the already-existing administrator E2E account and a new private same-paper acceptance RO, with human-authored summaries/Claims and source URL. This validates the product capability without claiming the original RO has been modified.

## 8. Media-first RO layout (approved continuation)

The reader should encounter the reviewed explanation before the source editing form. Retain the existing warm paper/ink/vermilion workspace aesthetic and Tailwind tokens. Use full-width content, responsive two-column media tiles on desktop and one column on phones; scientifically important imagery uses contain, never cropping. Each tile exposes type, status, playback/full-size access and existing permitted approval actions. Source Claims and truthful production metadata use native disclosure; a short presentation-not-evidence distinction remains visible. No autoplay or new dependencies.

Move source creation/selection and deterministic concept-map generation below the gallery in a clearly named disclosure. Empty workspaces and active/error/recovery tasks must expose an obvious next action; disclosure must not hide failures, lose typed input or change authorization. Page/navigation terminology covers image/video while generation text specifically describes the existing concept map. Native controls follow WAI disclosure keyboard conventions and Carbon's grouped content-tile approach. Automatic media generation and Hermes editing remain separate later slices.

References: https://carbondesignsystem.com/components/tile/usage/ and https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/ . Browser acceptance covers media-before-editor geometry, intact illustration, mobile overflow, keyboard disclosures, visible review actions, source editing and active/error recovery. Production uses the existing canonical release process.

## 9. Sourced storyboard and Hermes revision (approved continuation)

Deliver a complete plan-generation/revision/approval slice before rendering: select current RO Claims, choose watercolor/technical/ink and language, explicitly submit one AI-credit task, inspect 3–6 scenes with title, narration, visualAction, durationSeconds and sourceClaimIds, then submit feedback against an existing non-rejected storyboard to create a separate draft. Existing approved/old drafts remain unchanged; approval adopts a draft through current transition controls. Scene-by-scene previous/current comparison supports review. A storyboard is a plan, not generated imagery or video. No automatic full-paper understanding claim: this slice reads selected RO Claims and their conditions/limitations only; raw Evidence/SourceMap retrieval is deferred.

Use existing presentation.generate task, Gateway structured text, PresentationAsset interactive_html and source Claim links. Optional storyboard request {locale:zh|en,style:watercolor|technical|ink,instruction:nonempty trimmed string<=1000,baseAssetId?:uuid} is valid only for interactive_html; legacy strict payload remains compatible. Output StoryboardDocument {schemaVersion:1,title,scenes:[{title,narration,visualAction,durationSeconds,sourceClaimIds}]} uses bounded text, 3–6 scenes, 4–20 seconds each, total24–90 seconds, only requested Claim IDs. Metadata view exposes only validated storyboard document plus server locale/style/baseAssetId, never arbitrary provenance. Render escaped script-free downloadable HTML, not model-authored executable HTML. No schema migration/new queue/model install/provider bypass.

Base draft or approved storyboard must belong to the exact RO/version and retain the same Claim set; the server captures base immutable content/provenance/Claim identity before generation and rechecks it plus non-rejected status inside the existing version-fenced Serializable write. All input Claims are revalidated immediately before persistence; changed/revoked/published sources block completion. Each revision is an independent immutable draft with parent ID; no overwrite and no automatic supersession. Existing Claim invalidation rejects plans. Input instructions and Claim text are untrusted model data; generated scientific content still requires human review. The existing one-credit charged-on-submit policy and bounded Gateway retries apply; show charge before each new task, including revisions; bounded Gateway retries and exact idempotent replay stay within the original credit.

UI: a clearly labelled Hermes storyboard section alongside the existing source selection; 3 style choices describe intended artwork direction, not completed image styles. Scene list separates spoken narration from visual action, preserves source links and shows a revision comparison. Error/task recovery remains visible. Bilingual responsive native forms reuse current Folio tokens; no new frontend dependency. Reference: gnipbao/story-to-handdrawn-video separates visual planning and rendering and provides style families; use its workflow idea, not install its renderer.

## 10. Reviewed storyboard scene imagery — implementation scope

User authorized continuation on 2026-09-06. First validate the image-producing link before batching images into video. Each task consumes one scene of an approved storyboard in the exact draft RO version, retains all storyboard Claim dependencies, and creates one separate draft image. The user chooses a scene, sees the one-credit charge, then reviews the real returned picture. No automatic approval, overwrite, or claim that an illustration is evidence. Existing media administrator authorization is retained for this first rollout; ordinary writers still create/revise storyboards. Video consumes reviewed imagery in the next slice, reusing CPU Chromium/FFmpeg and the accepted voice runtime.

Reuse presentation.generate and existing storage/approval/Claim invalidation; add optional sceneImage {storyboardAssetId:uuid,sceneIndex:integer0..5} exclusively for kind=image, mutually exclusive with storyboard. Validate approved parent, exact source set and scene bounds before charge/model and within final Serializable persistence. Rejecting the parent invalidates linked draft/approved scene images; generated imagery has a narrow parent/scene DTO and no raw prompt. The task keeps all parent Claims because the visual prompt includes their conditions/limits. Idempotent replay does not add credits or repeat successful work.

AI Gateway owns MiniMax image-01 requests using the configured server credential, one image, 16:9, prompt optimizer off, bounded base64 response and no URL downloads. No automatic paid image retry. No model SDK, CLI or new local model installation. Metadata-only Gateway audit reports unavailable dollar cost as null. Renderer/browser cannot receive provider keys. A bounded text planning call may condense reviewed scene/context into the provider's 1500-character prompt limit without silent truncation; actual calls and provider failure are recorded, not represented as free generation. UI remains media-first and uses the existing task recovery/epoch logic.

Reference inspected 2026-09-06: MiniMax official Token Plan/CLI documentation and MiniMax-AI/cli image SDK use /v1/image_generation; base64 image_base64 response avoids fetching untrusted returned URLs. Subscription quota support does not prove a particular key currently has quota; real controlled acceptance must verify it. Critical failure cases are scientific drawing errors, source/permission changes during paid generation and provider success before persistence failure; reuse existing fences and human review rather than adding a new general gate framework.

Acceptance 2026-09-06: scene generation is deployed615ca2d for administrator trials. Explicit CN image region matches the existing credential; first global attempt failed, CN retry succeeded. The actual1280×720 image is decodable but too abstract to explain the mechanism clearly, so remains draft. Next prioritize concrete subjects, spatial relationships and causal visual progression; technical success does not authorize scientific approval.

## 11. Concrete scene composition

User approved improving the image design before further video work. Replace freeform prompt condensation with one structured visual brief: teaching point, concrete subjects, spatial arrangement, visible causal mechanism and fidelity constraints. Compile those fields deterministically into the existing1500-character image request; retain the approved scene and all Claim context, explicit uncertainty and illustration status. No new provider call, dependency, schema, or source-access permission. This slice does not add PDF/BGE retrieval; source images remain future scoped evidence support. Compare the same controlled diffraction/interference scene; a visible phase sheet, propagation and receiving screen with bright/dark distribution should be intelligible, without claiming measured output or wavelength splitting. Preserve the old draft and require visual review.

Concrete-composition candidate (basef7a80ea, production615ca2d/rollbackd6507ea unchanged): five-field brief with explicit string schema, subject placement and causal screen output. Worker529 tests, focused44, workspacebuild/typecheck/lint and independent review passed. Real planning initially failed schema (3 text calls); one additional text-only diagnostic found subjects array/overlength, prompting a schema example and concise budgets. Final candidate used2 text calls (one structured retry) and1 image-01 call; image is still scientifically insufficient (screen lost, floating patches), so no deploy or approval. Same1351-character prompt in one built-in imagegen call better retained plates, wavefronts and receiving screen; this single sample is a comparison, not a provider benchmark or a production integration. Existing Worker OPENAI_API_KEY/GEMINI_API_KEY readiness booleans were false; no secrets printed. No models or runtimes installed.

## 12. Bounded CPU image feasibility experiment

Evaluate official stable-diffusion.cpp with FLUX.2-klein4B Q4, Qwen3-4B Q4 and the official small decoder before adding a provider. Public upstream weight metadata totals5,240,163,463bytes including the33MB runtime archive; Apache2 weight licenses and MIT runtime. Reuse the existing Python CPU base by exact image ID (glibc2.41) to run the official Linux binary; no PyTorch/CMake install, no new production service. Start512×288/4steps/6CPU/12GiB/10min with no network or secrets, read-only models and separate output. Stop on resource/health regression; quality and latency decide whether to proceed. This is an isolated experiment, not an API-backed product feature.

2026-09-06 user steering: PAUSE local model preparation; retest MiniMax before any further installation. Exact download container stopped; about1.1GB archive/partial remains under /opt/openscience-evals/local-image, no weights complete and no inference/runtime install executed. Do not resume automatically. Production615ca2d/rollbackd6507ea unchanged.

Revised access finding: Codex supports ChatGPT sign-in and headless device authentication. Local CLI0.153.0 exposes image_generation stabletrue; official matching source additionally gates imagegen on plan/provider/model/auth. Thus a server Codex worker experiment is technically plausible, not verified. This is distinct from a supported public image API; ChatGPT and API billing are separate. No server Codex install, login or auth transfer performed.

## Global Hermes presentation actions — approved workflow continuation

Extend the existing global composer with explicit storyboard creation/revision and scene-image intents. Intent detection only prepares a review card; it never writes or guesses a scene target. The card loads the exact RO/version/Claims/assets through existing APIs, shows scope, original retained behavior and1Credit, and lets the user select the parent/scene or Claims. Dashboard users explicitly select a research object; an explicit unavailable/published version does not silently fall back to another draft. Switching RO/version discards the old preparation.

Confirming creates a real existing presentation.generate task, then opens the existing presentation page with exact version/task parameters for progress, recovery, preview and diff/approval. This reuses the shipped task owner instead of duplicating a second polling/approval subsystem inside the drawer. Uncertain submission retains the same idempotency key/request and requires an explicit retry; no automatic paid retry. Image generation still requires server-reported approved-parent capability. Normal research guidance and literature acquisition continue through their existing paths.

No new model/provider, endpoint, schema, storage or dependency. The bounded natural-language shortcuts are complemented by an explicit presentation-action entry; unsupported free-form edits stay guidance. Primary files: HermesAssistantDrawer, HermesWorkspaceStage, new HermesPresentationAction and presentation-intent helper, zh/en messages and tests. Risks: stale context, accidental image spending, duplicate submit, version fallback, and mobile drawer nesting; verify them with targeted browser tests and actual server workflow.

## 2026-09-06 confirmed journey and selective integration

用户确认首轮主线为论文导入→Hermes凝练/修改RO→可视化→审核发布→读者理解与讨论；要求整体调整页面布局、UI、配色与艺术表现。页面职责和整站设计继续grill-me逐项讨论，不把主线确认当作完整页面设计已批准。

选择性吸收同事30fabce与b0741eb的登录恢复/密码显隐、资料dirty/save/discard。登录保留真实错误语义与returnTo；资料写入沿用现有API/profileVersion。保存冲突按原已保存值识别本地改动，保留服务器独立字段变更；冲突后须用户选择保留本地修改或撤销，才可再保存。原注册完成页、ORCID/机构步骤等候选留待整体页面职责决定，不夹带部署脚本或旧交接文档。

## 2026-09-06 page decisions and visual-reference reassessment

### Confirmed page responsibilities

用户连续确认：同一RO使用连续研究工作区，公开阅读页独立；RO默认研究概览，再深入证据/编辑/媒体；Hermes以关联当前内容的助手侧栏为主要入口，复杂任务保留详情页；研究桌面围绕继续研究、开始研究、处理待办。用户已选择A配色，并同意先制作三态高保真交互样稿；整站实施待样稿验收。

### Reference evidence and applicability

已重新阅读用户两篇文章，并浏览/截图官方参考页；证据在Git忽略的 `apps/web/test/visual/out/science-video/design-reference-{linear,distill,elicit,happy-hues}.png` 和 `design-reference-evidence.json`。Linear为官方文档中的产品截图；Elicit为公开官网演示，均非登录后完整产品试用。

| Reference | Verified useful pattern | OpenScience application | Boundary |
|---|---|---|---|
| [Emil design engineering](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md) | 动效先判断频率/目的，精确指定属性，强调响应和中断 | Hermes展开、修改预览、生成完成后的定位与反馈 | 是设计判断规则，不是完整模板；高频操作少动效，不能把苹果感理解成全站玻璃层 |
| [Linear Projects](https://linear.app/docs/projects) | 项目总览、稳定导航、状态/资源组织、按需详情侧栏 | 研究桌面及RO操作壳层 | 借鉴信息组织；不照搬深色、密集英文小字或软件项目术语 |
| [Elicit](https://elicit.com/) | 科研语境、清楚的主操作、正文与工具控件区分 | 导入/任务引导、科研字体与控件组合参考 | 本轮只看公开展示；官网大Hero/粒子背景不适合日常工作区 |
| [Distill Feature Visualization](https://distill.pub/2017/feature-visualization/) | 图像直接解释概念，宽图与正文/旁注形成节奏 | RO首屏图解、方法展开、原始证据关联 | 历史文章是视觉参考，不引入旧框架；每篇复杂交互不是首轮必须功能 |
| [Happy Hues](https://www.happyhues.co/) / [Realtime Colors](https://www.realtimecolors.com/) | 将颜色分别应用到背景、文字、按钮、插画，看整页效果 | 同一真实RO上的配色比较 | 不照搬其卡通粗描边、粉紫色或营销排版 |
| [用户配色文章](https://mp.weixin.qq.com/s/JvO0PVLCXiZKE3TijZH21Q) | Huemint选候选、Happy Hues看应用、Realtime Colors看页面、CSS Gradient辅助渐变 | 配色验证方法 | 不是代码仓库或完整设计系统；全站不需要为渐变增加实现负担 |

本地ui-ux-pro-max两次查询分别偏向海报/奢华排版与玻璃营销Hero，和科研操作场景不符，未采纳其自动推荐。以下为结合现有产品与参考的人工作用判断，不是来源原样方案。

### Approved prototype direction — production redesign pending

统一导航、控件、字体角色、间距及状态色；随任务切换信息密度。工作区操作壳采用低彩度浅色表面，阅读内容以图解和正文构图体现辨识度。避免把工作区、阅读页分别实现成互不相关的主题。

- 研究桌面：紧凑续接列表 + 明确开始入口 + 少量待办；不使用大宣传标题和重复嵌套卡片。
- RO概览：标题/一两句贡献与机制图并列或上下组合，图解比元数据更突出；再展开方法、结果、局限，证据可就近查看。不要把媒体排在版本hash和整段SDF之后。
- Hermes：侧栏和正文同一视觉规则，气泡/工具提示/预览/确认有不同角色；默认不遮挡正在阅读和操作的区域。
- 证据与编辑：中性表面、清晰选中和来源定位；代码与diff可以使用局部深色，避免整页突然换肤。
- Explore：有图解缩略图、核心结论、主题和作者的研究条目；精选可使用更有节奏的图文编排，普通列表保持可扫描性。
- 登录/资料/设置：明确输入框与标签、短步骤/分组、稳定保存反馈；不承担品牌海报功能，不堆大标题和长篇能力说明。
- 艺术图解：同一论文内统一对象形状、配色和视觉语法；淡彩/手绘可作为资产风格，而页面控件维持一致。原始图表与生成解释始终可区分。

已选A（用于样稿，未决定替换现有品牌）：工作区底#F7F8FA、内容#FFFFFF、正文#20252B、次级正文#626C76、主操作深青#125D66，朱红#BA442F用于少量品牌点缀。候选B保留朱红为主操作色、采用更浅的近白暖底；以同一内容/同一布局对比后决定。深色全站和高饱和渐变不推荐作为首轮方向。

计算的静态文字对比度：正文/工作区底14.52，次级正文/白底5.35，白字/深青7.54，白字/朱红5.31；这些只证明四个色对，不代表整页无障碍验收通过。

样稿参数建议而非冻结规范：工具正文14–16px，中文阅读17–18px、行高1.65–1.8；长段阅读约32–40汉字/行，媒体允许宽于正文；主要控件统一温和圆角与清晰焦点，悬浮层少量阴影。正文主要使用清晰的中文无衬线，衬线限于少量标题或阅读强调，先复用已有字体再判断是否需要新增。

已获授权以同一D2NN论文展示研究桌面、RO概览、Hermes展开三个连续状态，采用A配色。首要验收是能看懂、知道下一步、阅读与操作舒适，其后再评估插图和动效的吸引力。本轮制作隔离本地样稿，不替换生产页面、安装依赖或部署。

### Hermes identity retained — user acceptance correction

本段为早期样稿的历史要求；其中保留展开侧栏与段落静态头像的安排已被 2026-10-01 用户截图纠正取代，当前执行全页单一浮动角色及同实例回退。

用户基本认可A样稿，并明确阿拉丁神狗不可丢失：Hermes须持续作为产品记忆与陪伴助手。复用现有Wanko/神灯模型和静态回退；桌面侧边陪伴入口、展开侧栏中的原角色静态头像、段落入口小头像保持一致，不再以H字母替代。模型固定挂载于陪伴区，展开助手不重建；安静/系统减少动效/待确认时显示原静态图并通过既有可见性检测暂停隐藏模型，不遮挡正文或伪造AI任务状态。下一实施段以真实研究桌面承接此视觉与身份，再推进RO/助手页面；逐段验证现有权限、任务与真实上下文。

## 2026-09-06 production screenshot correction — immediate delivery

用户否定上一轮整体视觉成效并要求快速服务器交付、减少重复测试。直接落实已确认A，而非再做样稿：统一 WorkspaceShell 与 presentation 的浅灰白/深青/无衬线控件；RO常用导航为概览、编辑、可视化、原始文件，其余保留在More菜单。概览移除固定左侧SDF目录与重复状态链接，空内容强调添加论文/调用Hermes、整理内容与制作图解的顺序；编辑改为明确当前字段、宽松书写区与简洁建议卡，去掉永久pending占位；无版本媒体页提供三步准备说明。保持真实版本/权限/生成边界，不自动写入或消费额度。

Hermes继续原Wanko与神灯。真实Chromium复现旧实例销毁共享Pixi纹理导致下一实例黑色几何块；修正texture ownership，保留固定atlas缓存，正常释放每实例GL资源。加载失败显示原静态角色。缩小验收为相关runtime回归、Web构建、页面截图/关键入口和现有服务器发布脚本，不重复全站浏览器矩阵。

## 2026-09-11 用户纠偏：操作汇入Hermes对话

本节覆盖早期多阶段制作表单方案。保持已批准正文成果主屏+Hermes侧栏与冷白/青绿视觉，六栏目标题突出。主区提供直接编辑与真实媒体，附件、证据、历史按需展开；不得重新加入保存、提交、正文继续、选主张、选风格和制作/发布的重复按钮。

Hermes是操作入口：普通指令由模型理解，直接修改与对话修改共用草稿；保存与创建所需版本由内部回调完成。制作前清楚说明当前目标与费用，可回复“确认制作”；公开前说明具体版本、许可与已审媒体，可回复“确认公开发布”。待确认范围变化时原安排失效。素材审核在对话内显示真实对象/方案与编号并调用现有审批接口，不把生成成功当科学通过。失败原因与续办、任务回执和公开入口必须回到同一工作台，不能让用户返回旧表单补操作。
## 2026-09-11 — 成果优先的展示顺序（最新用户确认）

标题与一句话贡献之后，先展示总结性核心概念图及视频，再展示精炼六项正文；附件、证据、解析记录、版本历史合并为文末折叠资料，不能先于媒体。各区使用同一左边界与内容网格。空媒体需要稳定比例、简洁说明的占位；现有真实结果回传后原位替换。默认一张核心图，多图用HTML幻灯片按叙事顺序串联，首张保持核心图，不自动播放；公开只使用该发布版本允许的资产。

Hermes完整形象与固定对话输入保持，普通选择/制作/审核/发布经对话，不回退为步骤表单。详细生成指令只对AI充分展开，给用户的回复与六项正文保持凝练。设计实施读取项目安装的apple-design、emil-design-eng、design-artifact、html-prototype，并以frontend-design入口约束应用范围；第三方示例不覆盖用户已确认方向。

本轮用户明确授权服务器实际完成带图流程并由Codex代为科学审核、正确后发布；不是重新开放全仓测试/CI。视频生成和批量冷启动仍暂缓。

## 2026-09-11 — 桌面、阅读与资料入口的产品职责

用户再次授权调整旧规划和代码，界面必须能说明具体目的；Hermes能力扩展在本轮体验交付之后。以下覆盖前面仍描述多面板并置的历史设计。

| 表面 | 用户此刻的目的 | 主要展示 | 次级内容 |
|---|---|---|---|
| 研究桌面 | 继续研究、处理真正需要我的事项 | 最近研究的具体下一步，Hermes对话，待处理/后台进行两组 | 资料检索、同资料较早任务记录、研究库 |
| 成稿编辑 | 看懂并修改当前研究 | 贡献、真实图/视频、六项精炼正文；未确认提取结果占正文位置 | 一个“资料与修改记录”入口下查看PDF、论文分析、实际待处理建议和版本 |
| 公开RO | 一眼理解贡献，再判断适用范围 | 标题/作者/公开版与日期、概念图、可选视频、六项要点 | 来源、证据、许可、引用与历史；不显示内部认证枚举 |
| 探索与首页 | 找到值得继续阅读的研究 | 精确公开版本的标题/洞见/已批准缩略图；新公开RO优先 | 搜索高级筛选；旧验收样本按已识别范围可恢复归档 |

“最新公开”和“精选”含义不同。最新列表按公开标识倒序，展示每个RO最新公开版本；缩略图只来自同一公开版本的approved image/chart，使用原公开下载端点，完整contain图面。精选继续使用既有EditorialCollection，不以点击量、任意首图或自动最新排序冒称人工精选；当前旧Ultrafast Science品牌集合不能擅自背书新研究。

视觉应用项目已安装Apple Design的目的/层级/即时反馈，Emil的短、可中断过渡：冷白/墨色/青绿；发现最大1120px、24px网格，阅读主体840px、核心图可至1000px；UI约120–180ms，reduced-motion关闭装饰过渡。普通导航不整页淡出，数据刷新不清空已显示内容；无第二套UI框架。

登录采用既有安全会话，明确区分请求失败与认证失败；共享前端会话减少跨页闪现“登录”，续期必须经服务器验证，不把缓存身份当权限依据。研究桌面不等待非关键文献检索请求再展示主内容。

本轮只进行部署必要构建/启动和已授权服务器真实浏览，不建立新测试门禁。剩余Hermes理解/科学自审能力单列后续，不能因UI精简放行已知科学错误。

Chat 6 Pro 本轮实际回复已取回（OpenScience落地方案，6aa3a4a4）：确认三种页面职责、单一资料入口、完整科学缩略图、无视频短行与无合格样本不凑精选；不需重复访谈。采纳这些建议。当前索引保持稳定publicId倒序，标签明确为“新公开研究优先”，不是“最近更新版本优先”；按最新公开版本时间的稳定分页涉及数据查询调整，未据此宣称已实现。首页原调试面板若仍出现须定位真实渲染条件后移除，不能仅根据可读抓取推断每个用户都看见。

## 2026-09-12 — 从创建开始的 Hermes 协作与媒体表达方案

状态：用户已认可一站式AI助手方案，统一创建/持续对话尚未实施；文档公式与第2项逐观察阅读已部署f2889c86、rollback7c6b7975。真实26页/32公式及67条观察已取得，但4条坏式和内部科学措辞仍需定向处理，不能称所有内容正确。科学写作、精美输出和媒体风格依次后续接入；具体状态见 `docs/runbooks/hermes-capability-registry.md` 和 `server-capabilities.md`，不将本项部署视为整套方案完成。本轮无媒体生成或测试。以下目标覆盖旧创建页强制“先建立结构”的设计，不改变已认可的成稿阅读顺序。

### 一个研究入口、一段持续对话

- “从空白开始”和“从附件分析”进入同一界面，仅初始材料不同。首次打开不立即产生空 RO；第一次发送研究目标或提交附件时建立私有工作草稿。默认当前工作空间，首次无选择时采用个人空间；位置以次级信息可修改。
- 主屏是 Hermes 形象、简短邀请“告诉我你想研究什么，或添加论文和资料”、固定对话输入与附件入口。移除研究身份/证据来源步骤、必填标题、哈希/存储说明和“先建立结构”大段文案。材料可直接拖入，选好后提交即开始整理，无需再点“AI提取”。
- 标题由材料或首条目标拟定，可随时修改；完全没有材料时，Hermes通过最少必要追问帮助梳理想法，不补造结果。形成内容后在同一工作台逐步展示贡献、媒体与正文。
- 对话与当前工作空间、RO、材料、草稿及任务关联。创建前对话在建立RO后连续保留；刷新、换页、返回研究都恢复原上下文。附件可预览、追加，在空白与导入路径中功能一致。
- 用户说“加入这份补充材料”“重新理解方法”“按新附件更新结果”即可调用对应已有工具。补充附件先自动解析并报告影响，不默认重写已成稿全文；再按指令范围合并。默认复用未变化的解析和向量；只有新文件、解析错误或用户明确要求时重做相关解析。任务在服务器持续，页面原位更新进度，不闪屏或强制停留；不同研究可并行，具体服务保留实际资源/供应商并发限制。
- 移除 Hermes 左上角形象大小/模式切换控件，形象按视口自适应；保留对话收起与恢复能力，不混淆两种操作。保持原有冷白、墨色、青绿和内容网格，依据已安装 frontend-design、apple-design、emil-design-eng 实施。

### 草稿自动完成，必要决定留给用户

- 用户提交资料或提出修改要求即授权该范围的可撤销草稿整理；结果直接显示在对应正文位置，Hermes只简短说明改了什么，提供撤销。首次整理以整篇预览为单位，不要求六字段逐项打勾。用户手动编辑同一份工作草稿。
- 复用现有草稿版本与差异处理：后台结果只能自动应用到未被用户修改的范围；冲突保留双方内容并在对话简要提示，迟到结果不得覆盖新材料、新指令或手动修订，撤销也不能抹掉后来的编辑。公开版本保持不变，后续修改只进入工作草稿；受影响主张/媒体定向重核，不反复要求确认全部历史来源。
- 明确的“生成一张图”直接启动既有制作流程，Hermes自动组织详细指令，不再回问同一动作。只有目标存在会改变结果的实质歧义、必须补充的科学信息、授权范围外动作或明确公开发布时询问；不能因局部解析错误要求用户重填全文。
- “保存草稿”“生成媒体”“公开发布”含义清楚分开；普通制作请求不隐含公开授权。公开前按现有权限与已知科学问题处理，不以减少按钮代替真实性。

### 理解、凝练与创作是相连但不同的能力

2026-09-12第2项已实现：分段阅读按每条观察保存原始来源、限定来源、算例及reported/synthesis/uncertain身份，由程序分配观察编号。全文整合只引用已存在观察，程序回填支持与限定原段，同时保留未被候选选中的假设、定义、限制和不确定材料；不通过静默删ID掩盖错引。科学自省只按理论/实验/仿真实际适用项工作，不再每阶段重复注入整份流程指令；沿用已有独立网页复核与发布权限，不新增整篇人工公式审批要求。真实5段map复用后reduce返回，仍是待科学复核的内部结果；本次保存/复用由执行者辅助，不冒称生产自动断点缓存。

第3项接入方案（2026-09-12写作与独立笔记界面已实现，部署状态见CURRENT handoff；下述为接入前判断）：现有workspace-guide只支持短回复、六字段改写、媒体和导航；summary最多1200字符，不能把长篇稿件塞入该字段。写作任务须返回独立私有、可修改、关联当前研究的文档，保留原有精炼SDF和发布快照。用户在同一Hermes对话提出笔记/综述/论文初稿，按文体加载scientific-writing与citation-management适配；复用原始来源、观察及限定，不能将内部候选直接升级为事实。原文引文与本次对原文的定位分别记录，不虚构DOI/页号或把现成论文写成用户原创结果；识别故障单独报告，不混入论文的科学限制。接通内容、保存/继续编辑与来源后再扩展精美排版和导出，最后回到已经明确的图片/视频风格与叙事。

第3项源码接入定位：沿用workspace.guide/AgentTask持久化，独立writingDraft与baseDraftTaskId串联私有稿；源码入口为domain的workspace-guide-contract.ts、Worker workspace-guide.ts/index.ts与Web HermesAssistantDrawer.tsx/lib/api.ts。当前研究的来源任务自动定位并验证同用户/同RO/同工作区，不增加用户手填ID或常规选择。引用通过已保存sourceMapRef和真实P段由程序生成quote/SourceLocator；阅读候选、科学修订与未解项分开保存，不把原reported观察升级为已核事实。用户可编辑自己草稿，客户端正文只是用户内容，不当成已验证来源。初步保存在按用户隔离的AgentTask，支持同一对话编辑/预览/Markdown导出；现有Artifact是工作区成员可见，不能默认为个人私密存储。该接入设计已经实现，独立Sol High静态复核后的具体发布及实际使用状态见CURRENT handoff；不据方案本身宣称真实写作质量已通过。

| 能力 | Hermes负责 | 用户主要看到 |
|---|---|---|
| 研究理解 | 综合全文、图注、公式、附录和补充材料；区分已报告、推导概括、尚不确定，检查来源与内部矛盾 | 六项凝练精华和真正影响理解的疑问 |
| 视觉策划 | 依据研究机制、目标读者和用途制定构图、视觉隐喻、配色、标签、几何/量纲/因果约束 | 一句制作说明与实际图片 |
| 多风格图片 | 默认一张总结性核心图；按“更像学术封面”“水墨但保持清晰”等自然语言修订；必要时复用参考图保持一致 | 核心图，多图在同区按叙事翻页 |
| 视频导演 | 决定解释顺序、分镜、运动、节奏、旁白、字幕与声音；区分解释性动画和科研模拟，不能只把静图平移放大当作优质视频 | 可播放成片与简短说明 |
| 科学与视听复核 | 对照原文核对方向/量纲/数值/因果和概念边界；分别检查可读性、构图、跨镜头一致性、字幕/音画 | 可靠成果；只提示需要人判断的问题 |

AI内部详细制作材料与用户正文分别保存：视觉brief保留来源、对象关系、构图层次、风格意图、必要标注、避免误导之处；视频增加分镜、时间和声音。不得将精炼六字段当作唯一生成依据，也不把内部提示词常驻展示；需要时可展开自定义。艺术表达可变，科学含义不随风格改变；概念图不能伪装实验图或模拟结果。

### 当前缺口与实施顺序

接入前静态事实（2026-09-12单一对话/附件入口已部署，以下不再代表当前创建页）：`new/page.tsx` 当时按 blank/import 分流、强制标题、只在 import 显示附件面板，Drawer传空研究/任务上下文；现有对话结果只接受 technical/ink/watercolor 风格；视频分镜受当前对象/动作渲染范围约束。已有解析、BGE、Gateway、持久任务、网页生图和媒体回填应复用，技能文件本身不等于运行能力。

1. 先交付统一创建入口、移除大小切换、持续对话和追加/再次分析，接通真实服务器工具；先让用户少填写、能持续推进。
2. 接着补全文综合、来源关联、冲突合并和科学自审，消除首篇样例仍依赖人工整理的环节；保持已公开正确成果。
3. 在同一链路完善视觉策划及多风格图片，仍使用现有服务器 Chat 网页生图，不改变为新供应商或GPU栈；效果来自策划/生成/复核协同，不是仅扩充枚举。
4. 最后增强视频叙事、镜头与声音。复用已有视频/TTS资源，按真实制作需求补渲染缺口；不承诺现有资源已支持任意生成式镜头，也不把本轮方案当作启动昂贵视频制作的授权。

本轮普通 Chat 的 OpenScience落地方案 会话 `6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581` 已返回完整方案，回复 `a9aa220b-e2f9-4b7b-b7c1-b9e00681468b`；沿用原6 Pro设置，未另派重复规划代理。采纳统一入口、真实RO/任务绑定、追加材料先报告影响、保护手改与后续编辑、科学关系和艺术自由分开、真实产物复核及交付顺序。其“制作前再确认”仅在授权范围不清或超出已告知成本/范围时适用：用户明确制作指令且范围费用已知时直接执行，不恢复重复确认。标题自动拟定与详细指令自动生成不意味着任意科学内容可自动放行。本轮仅文字讨论与静态源码判断，无新截图评审或服务器运行。
