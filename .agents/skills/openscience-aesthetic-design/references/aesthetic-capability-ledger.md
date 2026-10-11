# OpenScience 网页设计与实现能力台账

本表记录能力入口及证据，不维护第二份任务状态。执行状态与用户逐页决定见 [CURRENT](../../../../docs/handoff/2026-09-10-hermes-web-image-handoff.md)；产品事实及图文稿见[已有产品设计](../../../../docs/specs/2026-09-05-integrated-research-product-design.md#2026-10-11-完整协作设计与逐页示意图)。2026-10-11核对；安装、可调用、实际使用、用户认可分别判断。

## 审稿期与恢复实施

- 用户审核时只整理现有能力、Skill指导和必要的只读联通证据；不改产品页面、文案、交互、Figma稿、已提交效果图或部署。已交付PDF/HTML/ZIP继续作为同一审阅对象。
- 页面选定后，按P编号、选定图/原Figma节点、职责、入口、真实内容及反馈开始实施。不重复定位访谈，不要求未选页面全部通过才推进已授权页面；也不把Guide方向认可扩展为全站认可。
- 局部优化保持选定构图与产品故事；若需改动页面职责、入口或主要构图，先呈现具体差异供判断。细节实现、响应式与状态补齐按既有授权完成。
- 本轮整理不安装、升级、移除工具，不改生产或用户数据。Skill是按任务读取的指导，不是自动执行的后台进程。

## 任务 → 能力 → 真实证据

| 任务 | 首选能力与入口 | 已核证据 | 使用范围与缺口 |
|---|---|---|---|
| 产品叙事、入口与页面职责 | 项目 `product-story-design`、`frontend-design`、本审美Skill | 已有44路由清点、逐页故事/操作/转场及完整图文稿 | 优先读对应P页与最新反馈；不重新造一份产品定位文档 |
| 视觉构图与艺术方向 | 已有 `design`、`impeccable`、`ui-ux-pro-max`；项目 Apple Design | 本机Skill文件存在；前轮已研究学术编辑方向、真实作品和层级 | 根据具体薄弱点选一项主指导；不把多个风格模板叠加 |
| 文案与说明 | 已有 `copywriting`、`product-marketing`；产品叙事Skill | 本机文件存在，项目已有定位资料 | 优先对象明确、动作明确的文案；审稿期不改文案，落地时不把运营解释塞进导语 |
| 成熟产品研究 | 官方网页与真实浏览器观察；Apple HIG、Linear、GitHub、Notion、CapWords | 10-08 Linear/Apple与助手布局研究；10-11 CapWords实看，截图留原tmp证据 | 学构图、阅读节奏、入口取舍；不用参考产品品牌/虚构统计装饰本产品。已有有效证据不重复采集 |
| 图像方案与图稿迭代 | Product Design `index/ideate/audit` + 内置 `image_gen` | 42张页面初稿、16张修订，实际附Guide与Hermes图片；保留首页和Guide共44图 | 仅Guide v2方向获认可；静态图不证明交互/科学正确。工具未开放底层型号选择，不标称已指定image-2.5 |
| Figma身份与团队 | `figma_whoami`，现有Figma插件 | 本轮只读成功；1851678225's team为Full席位；另一团队为View | 不再沿用10-08认证失败判断；身份可用不证明任意文件写权或已完成设计 |
| Figma设计资产与组件 | 原文件 `gjhowMG7cG4clKwvhvF08E`；插件 `figma-use/generate-design/generate-library` | 前轮实际读取七个顶层页、Product Craft、Guide节点2138:2；已有基础/组件/页面与64px头像 | 审稿期不写。选页后在原文件细化布局、状态、组件与tokens；不另建重复文件。每次写用对应Skill前置说明 |
| Figma到代码 | 插件 `figma-design-to-code`、`get_design_context`、`get_screenshot`；选中位图用Product Design `image-to-code` | 工具在当前目录可发现；本轮无设计写入、无转代码 | 调用设计上下文前先读该Skill；只取选定节点，资源缺失如实记录；画布/图片不同步时先确定选中版本 |
| 精细UI整理 | `baseline-ui`、`design-critique`、`impeccable` | 已安装；前轮独立构图审查与实际截图迭代有记录 | 用于层级、字号、留白、对比与交互反馈；检查通过不等于用户审美认可 |
| 前端开发 | `apps/web/package.json`、现有React/Next/TypeScript/CSS体系；项目 `frontend-design` | manifest为Next14.2.35、React18.3.1；已有Radix、Lucide、next-intl、KaTeX | 这是仓库声明版本，不是最新版本推荐；复用既有组件和双语资源，不加第二套UI框架 |
| 设计规范与资产 | `design-system/openscience/MASTER.md`、页面覆盖、现有字体/光学艺术/科学媒体 | MASTER顶部已明确通用生成配色不覆盖认可的冷白/墨色/青绿 | 效果图中的文字、科研图、身份与统计为示意；实现用实际数据和原资产，不把生成图当事实源 |
| 状态与组件复用 | HermesAssistantDrawer/WorkspaceStage；现有媒体、正文、表单、权限与恢复组件 | 仓库路径存在；既有流程与媒体边界已写入图文稿12/13章 | 默认头像点击展开（当前64px），包含研究桌面；不恢复360/120旧默认、不冒充作者、不常驻空侧栏。Landing不加角色 |
| 交互动效 | 项目 `emil-design-eng`；GSAP、`@gsap/react` | manifest声明GSAP3.15.0/@gsap/react2.1.2；GuideOpticalMargin实际导入并调用useGSAP/matchMedia/revert | CSS处理简单反馈；GSAP处理编排/连续性。实际复杂动效及取消/切页/减少动态需在选定页验收，不因已安装就全站加动效 |
| Canvas与光学效果 | `apps/web/components/art/CanvasRipple.tsx`、GuideOpticalMargin、现有OGL | 已有Canvas UI Ripple源码与调用；源码附MIT + Commons Clause及本地许可文件 | 不是完整特效市场已全部接入；按局部叙事需要复用。移动/不支持环境保持可读可点，保留许可，不作为科学图像替代 |
| 可选视觉资源 | Paper Shaders、21st.dev、Refero、The Index、Brand Archive、Taste Lab等用户参考 | 作为来源清单保留；未核本项目安装、账号和真实调用 | 有具体缺口才查官方资料、许可、兼容性；不把列入清单写成“已具备全部能力” |
| Skill/插件发现 | 本机 `find-skills`、skill-installer、plugin-management工具 | find-skills文件存在；插件搜索工具可发现 | 先查现有能力。仅针对明确缺口检索，核来源/许可/实际样例与适用授权；热度不作审美证据，不为整理批量安装 |
| 技术文档查证 | Context7 `resolve_library_id/query_docs`、官方文档与源码 | 当前工具可发现，未为此次台账发起库查询 | 实现遇到具体API/版本问题再查；不根据本机依赖声明推断最新API |
| 真实浏览器观察 | Codex CUA内置浏览器；现有Playwright/Vitest脚本 | 本轮官网首页/Guide及HTML检索P03得到1/44有实际观察；44图目视、47页PDF排版已查看 | 当前认证会话不预设有效。旧策略/预览问题保留历史，不冒称当前故障；静态图不证明64px Live2D真实运行 |
| 功能、性能、无障碍 | Web已有typecheck/build、定向Vitest/Playwright；原visual-release规范 | manifest与既有脚本可定位；本轮未跑产品构建或整站验收 | 只跑改动相关路径及规定检查；从真实导航走到目标，覆盖键盘、焦点、长中文、错误/空态、reduced-motion及窄屏 |
| 图文交付与审阅 | 原图文稿生产者、PDF工具、HTML离线包 | 84页PDF、44唯一图页、46本地图片/ZIP齐；原receipt保留 | 用户逐页审阅中；页面认可、实现观察、部署与科学质量分别记录 |

## 敲定页面后的最短实施链

1. **领取选定页**：P编号、选中图/Figma节点、职责、入口与下一步、真实素材、已给反馈。主稿是已有图文手册，不新增审批表。
2. **细化所缺内容**：在原Figma补需要的响应式布局、组件和关键状态；明确哪些共用、哪些仅本页。已有完整设计不重复出图。
3. **映射到现有实现**：先看该路由、父级shell、tokens、正文/媒体/Hermes组件及数据消费者。跨模块或API变化才加载architecture-guard/api-contract，不把视觉任务扩成后端重构。
4. **实现视觉与交互**：落实选定比例、字体、间距和素材；补hover/focus/active/loading/error/empty/disabled等适用状态；普通反馈用CSS，需要编排再用GSAP，Canvas只用于获选视觉。保持双语、真实权限和已存输入。
5. **同场景对照**：在真实内容、桌面与窄屏下对照选定图；检查视觉锚点、阅读顺序、对齐、留白、文字断行、媒体完整性和Hermes归属。截图好看与实际操作顺畅都要成立。
6. **验收与交付**：沿可见入口实际点击，完成相关定向检查。记录已实现/已观察/未确认差额；按原协调流程集成发布。范围内细节自主完善，主要叙事/布局变化交用户判断。

## 已纠正的能力记录与待补差额

- Figma 10-08 `UNAUTHORIZED` 是历史；10-11身份读取与原文件读取已有新证据。本轮未写Figma，不能称44张位图已变成Figma组件。
- 台账、审美Skill、UI craft protocol和frontend-design的360/120px旧表述已统一为后续64px头像决定。尺寸与展开形态最终依所选页和实际容器验证。
- 10-08本地预览启动拒绝、CSRF错误、早前浏览器故障保留在原证据；不能用其断言今天不可用，也不能靠更换通道绕过新出现的权限限制。
- 已生成页面图仍有需要在人审后细化的控件/文案及科学示例差异；图库齐全不等于全部方案通过。窄屏全套视觉、动效状态、正式组件映射与真实路径验证留到选定页面实施。
- 用户空间测试记录尚需核对真实归属；重复标题/PDF不是删除依据。本轮不整理业务数据或隐藏实际任务来冒充自动化完成。
- 不新增能力平台、重复Style文档、固定工具数量或额外模型步骤。新证据回填本表；执行进度与阻塞仍只归CURRENT。
