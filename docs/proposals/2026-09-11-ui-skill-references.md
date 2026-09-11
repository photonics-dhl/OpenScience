# 工作台信息展示与设计 Skill 参考

状态：设计参考目录。2026-09-11 已完成核心需求访谈，用户批准高保真稿风格并要求突出六个研究栏目；正式实现已随17ebc7f7部署。产品需求以需求基线、用户最新确认及 integrated-research-product-design 为准，参考仓库不等于全部安装。

## 当前事实
- 应用 release 329ad2e821f3aac1c7345a792b190f1f8e97619e，rollback 25917596e640cdda5451a4b15a00c7245a832566；服务器 .release-id 已读回。
- 当前论文 v6 已有六字段凝练、104 条已显式确认的 Evidence；此前 58 条由 Chat 审阅后执行 46 确认、8 修正、4 无效页脚删除，另修正 2 条旧证据。原 PDF 保留。
- 服务器网页生图曾成功回传，但旧 v3 图的 FWHM 方向错误不可公开；当前 v6 无合格图片，尚未公开。不能称全流程已通过。
- 最新 8fcbe321 方案仍在 draft：光与电子均沿 z 却称正交，且再次断言非零电场面积。结构成功不等于物理正确，不能据此直接生图。
- 当前公开页 OSR-2026-000020/v/2 为旧 E2E 内容，不是当前论文；缺失占位文案仍出现在主要阅读区。
- 当前服务器截图已存 /opt/openscience-chatgpt-browser/jobs/layout-discussion-{media,publish,public}-20260911.png 并实际提交既有 Chat 会话 6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581。页面状态读回为 /jobs/layout-discussion-live-state-20260911.json，不含凭据。
- 没有运行测试、预检、CI 或重新解析论文；本阶段未部署新 UI，ready-card 工作暂停以等待需求讨论。

## 为什么仍然混乱：当前观察与判断
1. 全局导航、研究标题、保存操作、版本状态、阶段导航和 Hermes 多层堆叠，压缩内容空间。
2. 草稿 revision 7 与 Version 6 同屏；Save to SDF、Create commit、原始 UUID 暴露实现概念，用户很难判断保存与发布的关系。
3. 制作页已有方案却显示 No visuals yet / Ask Hermes to create，下一步不准确；折叠所有内容后留下空白，未建立成果与任务状态层级。
4. 目前视口右侧工具与 Hermes 区域被截断，说明实际空间分配仍不合适。
5. 公开页虽然已有排版修订，但旧数据占位内容、缺少核心图、摘要与结构字段的重复，仍损害阅读体验。
6. 任务状态、制作参数、科研内容与公开读者需要的内容，必须分别定义默认展示和展开方式；仅缩字体、加折叠不足以解决。

## 仓库筛选（仅阅读，未新增安装）
| 来源 | 相关能力 | 本项目用途与边界 |
|---|---|---|
| [plannotator/effective-html](https://github.com/plannotator/effective-html) | html-wireframe、html-prototype、design-artifact；另有 html/html-plan/html-diagram | 最优先补充讨论手段。先用真实内容比较层级和流程，再做可操作原型。参考即可，无须安装整包。 |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | apple-design、emil-design-eng、prototype | 推荐 Apple 参考主源：及时反馈、空间连续性、克制、排版与可中断交互。不能替代信息架构，不默认增加动效。 |
| [ChloeVPin/apple-design-skill](https://github.com/ChloeVPin/apple-design-skill) | HIG、布局、颜色、无障碍，保留上游运动章节 | Apple 补充索引，和原版重叠较多，按需参考。非 Apple 官方 Skill。 |
| [bowen31337/apple-design](https://github.com/bowen31337/apple-design) | Liquid Glass、token、CSS/SVG、Motion/GSAP 组件 | 适合少量浮层细节，不适合将科研阅读区全部玻璃化。非 Apple 官方 Skill。 |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | shape、critique、distill、clarify、normalize 等 | 可补信息删减、主次层级、状态和文案；本阶段仅参考设计指导，不安装检测 CLI 或增加测试门禁。 |
| [ibelick/ui-skills](https://github.com/ibelick/ui-skills) | baseline-ui 及设计工程技能目录 | 适合已有布局的间距、控件、焦点、动效细节；本机已有 baseline-ui，无须重复安装。 |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 多平台 UI/UX、排版、配色、布局参考 | 本机已有 ui-ux-pro-max；在内容结构确定后选用，不将样式数量当作质量。 |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | minimalist-ui、redesign-existing-projects、design-taste-frontend 等 | 克制和既有产品重整值得参考；部分默认偏营销页、较强动效，不能整套套用工作台。v2 README 标注 experimental。 |
| [SudewaJay/apple-design-skill](https://github.com/SudewaJay/apple-design-skill)、[heyman333/atelier-ui](https://github.com/heyman333/atelier-ui) | Apple/HIG 风格与移动原生 UI | 次级备选；前者与前述重叠，后者 mobile/iOS 定位较强，不作为当前 Web 工作台总规范。 |

没有声称穷尽所有 GitHub 仓库。筛选覆盖本任务的结构、原型、视觉、交互、可访问性和既有系统一致性，避免重复 fork 混成多套总规范。

## 待 grill-me 逐项确定
- Chat6Pro 已完整回复并保存服务器 /jobs/layout-discussion-chat-reply-20260911.txt：明确否定先前仅保留三步/画廊的删控件方案，建议成果为主屏、Hermes为主要操作入口、公开为独立动作。制作进度与科学确认分列；指令可折叠，重大科学问题不能隐藏。
- 第一问已确认（用户回复“同意”）：每篇 RO 默认展示可阅读、可直接修改的研究成稿，研究精华与已有图片居中，Hermes 在侧边协助；附件、证据、历史和详细指令按需展开，后台进度和待确认事项集中提示。
- 第二问已确认：公开 RO 先展示标题/署名与来源、一句话贡献、核心示意图及短图注；有视频时与核心示意图一起直接展示，不藏为次级入口。向下展示凝练后的连贯研究正文，六字段保留，重要限制可见；证据/附件/技术细节按需展开。具体响应式排列尚未确定。
- 第三问已确认：尽可能减少操作，只保留两个主要确认节点。上传后自动解析、凝练并填入可改草稿；用户查看内容并选择图片/视频/两者开始制作，Hermes 自动整理指令并生成；最后查看同版正文和媒体、选择公开范围后确认发布。中间不逐字段/提示词重复确认，普通修改自动保存可撤销；影响结果的科学疑问集中说明。
- 第四问用户已确认布局“舒服多了”；保留正文/侧栏比例和内容层级。新增明确要求：展示 Hermes 形象，只以对话式发送指令，由 Hermes 判断处置；重新设计美观、控件与自然过渡。已有布局的视觉交互稿已呈现，不重新泛泛访谈布局。
- 内容、图片/视频、附件、来源和历史的分区与默认展示范围。
- Hermes 占据的默认空间、可收起方式，以及对话修改的即时回显和撤销。
- 必要确认边界已明确；通过线框呈现两个节点与连续后台处理，无需再泛泛询问是否减少操作。
- 公开页首屏、凝练字段、核心图及科学限制的阅读顺序；来源/引用/许可等仍保留可达入口。
- 统一字号、字体、颜色、间距和窄屏布局，再确定少量有实际用途的过渡。

当前推进：核心决定、布局及高保真风格均已确认；正式工作台/公开阅读/Hermes对话已部署。原样稿保留作视觉参考，不作生产能力证据；正确科学图与发布闭环仍未完成。

## 可点击线框已呈现
- 文件：[2026-09-11-ro-workbench-wireframe.html](2026-09-11-ro-workbench-wireframe.html)，单文件无依赖灰度线框。
- 已传至服务器 /opt/openscience-chatgpt-browser/jobs/ro-workbench-wireframe-20260911.html 并在既有Chrome打开 file:///jobs/ro-workbench-wireframe-20260911.html；用户可通过原noVNC入口查看。
- 工作台/公开预览切换、正文编辑、Hermes预设凝练与撤销、侧栏收起、制作类型和场景选择均为样稿内交互。正文与公开预览共享内容；图和视频直接呈现占位位置，不伪造媒体或AI调用。
- 已观察服务器桌面工作台与公开预览截图；未运行测试/预检、未验证手机或生产全流程。用户已认可空间与结构，正式视觉另见下方高保真稿。
- 实际路由：Terra medium负责单文件样稿，主代理静态修正并传服务器呈现；复用前轮Chat6Pro信息架构建议，没有重复整轮分析或新增高档审查。

## 样稿阶段的视觉与对话记录（历史；正式实现见CURRENT）
- 用户已认可线框空间与布局；当前保留它作为结构参考，另做高保真交互稿。参考 Apple Design 的反馈/连续性、Impeccable 的精简/一致性和已安装 UI UX Pro Max 的可读性、触控、状态指导；不安装新依赖，不堆叠多套动效库。
- 既有 Hermes 透明形象 apps/web/public/hermes/wanko-static-transparent.png 已实际查看并传服务器用于样稿；不改绘，不放大遮挡研究内容。
- 现有生产实现定向静态发现：HermesAssistantDrawer.tsx 的 submit 中仍以发布关键词跳页，制作意图转 presentationIntent；workspace-guide.ts 仅能输出受限导航、draftChanges 和 storyboard.create 建议。完整对话式自主处置仍有正式接入缺口，不能把样稿预设意图匹配称为已经解决。
- Chat6Pro已基于两张线框截图、透明形象与新要求完整回复，服务器原文 /jobs/ro-product-visual-guidance-20260911.txt：冷白/墨色/青绿、18/31正文、36/44标题、8px控件/12px面板、侧栏轻影、96px完整形象、用户浅青/Hermes无框对话、短过渡、降低运动、保留阅读位置；公开正文760px、媒体可拓1040px。
- Sol medium负责独立视觉交互稿，根负责定向静态修正、真实边界及服务器呈现；生产Hermes路由缺口仍单列，不用预设交互当模型能力，不新增生产代码或部署。
- 新稿 [2026-09-11-ro-product-preview.html](2026-09-11-ro-product-preview.html) 已呈现于服务器 /opt/openscience-chatgpt-browser/jobs/ro-product-preview-20260911.html；浏览器 file:///jobs/ro-product-preview-20260911.html，复用原noVNC。仅复用既有形象，无新依赖。
- 实际查看后修正：侧栏高度为首屏保留输入/发送位置；收起按钮不换行；制作卡默认只呈现已推断范围/风格和一个主按钮，详细选择折叠；保留阅读滚动位置并支持降低运动。
- 预设演示短句包括“把洞见简短一点”“给这篇研究做一张图”“制作讲解视频”“准备发布”；正文/公开预览共享内存状态，撤销避免覆盖用户后续修改。未知命令明确说明尚未接入，不伪造模型回答。
- 最新服务器截图 /jobs/ro-product-preview-chat-20260911.png 与 /jobs/ro-product-preview-public-20260911.png 已观察；早期 desktop 截图是输入高度修正前，不作最新版。未观察手机、未验证动效时序，未运行测试/预检或部署生产UI。
