# OpenScience 前端视觉系统设计 Spec（v2 定稿）

> 日期：2026-08-06 · 状态：**已定稿（用户 × GPT × Kimi 三方）**
> 上游：`docs/proposals/2026-08-06-frontend-design-direction-v1.md` 文末「v2 终稿决策层」（D1–D9，含讨论纪要）；GPT 交接 `docs/user_ideas/handoff-v2-extract/OpenScience-Kimi-Handoff-v2/HANDOFF.md`；art-direction 参考 `docs/user_ideas/主页原型图.png`（**禁止直接作上线资产**）。
> 本文是定稿后的正式设计 spec，实施计划见 `docs/plans/2026-08-06-frontend-p0-p1-plan.md`。

## 1. 定位

**Monumental Scholarly Intelligence（纪念碑感学术智能）**：Moonshot 式的克制、尺度与单一强符号，叠加开放科学的结构化、可验证、可演化。首页"震撼、简约、AI 原生"；进入产品后回归高效率与长时间阅读舒适。品牌气质：精密、冷静、可信，辅以少量人文温度。

## 2. 核心符号：Evolving Research Object

- 六面组成一个统一对象，中心开放（Open/可扩展/外部贡献）；细薄历史轮廓表 provenance；一条 Hermes 蓝色轨迹穿过对象、产生一次分支后 merge；唯一暖橙节点表 diff。
- **六面语义 = 真实 SDF 六节点类型**：`problem / insight / method / results / limitations / reproducibility`（`infra/schema.prisma` `SdfNodeType`）。不得为画面改数据模型。
- 禁止读作"六张悬浮卡片/文档堆/PDF 书架/Dashboard 卡片墙"。

### 2.1 资产路线

- 纯 SVG 手工构建 + 分层辉光：同色路径 3–4 层（锐核 + 内辉 + 外 bloom，feGaussianBlur/feMerge 或叠加 drop-shadow）；`mix-blend-mode: screen` 叠光；feTurbulence 细噪点。
- 氛围层允许 copy-in 1–2 个现成组件（Magic UI / Aceternity Spotlight 量级，与 shadcn 同 copy-in 模式）；核心符号不依赖组件库。
- 动效性能纪律：滤镜静态、动画只调 `opacity/transform`；filter 区域 `x/y/width/height` 扩至 ±35% 防边缘裁切；装饰层 `aria-hidden` + `pointer-events: none`。
- 首版两版变体（更雕塑化 / 更界面化，其余变量一致），Playwright 三尺寸截图由用户拍板后冻结 token。

### 2.2 动效参数

- 呼吸/结构张力：8–12s 一次极轻变化；轨迹扫描：4–6s 一次，停留后留低亮；diff 橙点：短暂增强一次不闪烁；历史轮廓视差 ≤4px；hover/focus ≤200ms。
- `prefers-reduced-motion` 下全部退化为静态；动效加载失败时文案与 CTA 完整可用（静态 poster 兜底）。

## 3. 视觉 Token

方向值，**冻结前必须过 WCAG AA 对比度验证**：

```css
--hero-bg: #03060B;        --hero-surface: #08101C;
--hero-text: #F4F7FB;      --hero-muted: #99A5B5;
--accent-primary: #4C8DFF; --accent-primary-strong: #2A6DFF; /* 由 #256BFF 微调：/hero-bg 对比度 4.47 → 4.57，过 AA 4.5（2026-08-06 验证） */
--accent-diff: #FFB454;    /* 仅表新增/变化/合并点，不作普通按钮色 */
--canvas-bg: #F6F7F9;      --paper-bg: #FCFBF7;
--ink: #18202B;            --border-subtle: rgba(148,163,184,0.18);
```

禁大面积紫色渐变。双主题首版仅 token 结构预留，不实装切换。

### 3.1 结构 token 与双表面机制（Task 8 落稿）

颜色之外的共享结构 token（spec §4：三套视觉共享 spacing/radius/状态/交互，不共享背景与密度），单一事实源 `apps/web/app/tokens.css`：

```css
--state-danger: #B91C1C;   /* 危险操作色；accent-diff 仅表 diff，禁止作 destructive 用 */
--motion-fast: 200ms;      /* hover/focus 过渡上限（§2.2） */
--motion-breathe: 12s;     /* 呼吸/结构张力 8–12s */
--motion-scan: 6s;         /* 轨迹扫描 4–6s */
--radius-card: 0.75rem;    --shadow-card / --shadow-overlay;   /* 卡片近无阴影、浮层一道 */
--ease-standard: cubic-bezier(0.2,0,0,1);  --ease-entrance: cubic-bezier(0.16,1,0.3,1);  /* framer-motion 同值镜像 */
--z-header: 40; --z-overlay: 50; --z-modal: 60;
```

- **双表面机制**：原语默认纸白表面（公开 RO）；任一祖先挂 `.surface-dark` 类即整体切换深色表面（landing/工作台），组件内用 `[.surface-dark_&]:` 任意变体覆盖，server-safe、无 JS 开关。Dialog 因 Portal 脱离祖先链，用 `surface="dark"` prop 显式指定。
- shadcn/ui 原语（`components/ui/`）：button / card / badge / skeleton / input / dialog，全部双表面化；WCAG 门禁新增 hero-text/state-danger 配对。

## 4. 三套页面视觉系统

| 场景 | 视觉策略 | 目的 |
|---|---|---|
| 落地页 Hero | 近黑暗场、纪念碑尺度、极简内容 | 品牌冲击与概念解释 |
| Dashboard/编辑器 | 深色导航外壳 + 浅色内容画布 | 长时工作舒适、AI 状态清晰 |
| 公开 RO | 纸白、学术出版排版、近零动效 | 阅读、引用、可信度 |
| 协作区 | 跟随外壳、高密度表格/列表 | PR/Diff/Review 效率 |

三者共享 spacing/radius/状态色/交互逻辑，不共享背景与密度。

## 5. 字体

- 首屏主标题：思源宋体（Noto Serif SC）子集化自托管 woff2，`font-display: swap`。
- UI/正文：系统字体栈（PingFang SC / Microsoft YaHei / Noto Sans SC 回退链）。
- Fraunces 与思源黑体自托管暂缓；不为字体方案破坏中英一致性。

## 6. 信息架构与路由

- `/` = 公开落地页。Header：左 wordmark；右 `探索 / 创建 / 关于 / 登录`；首屏透明、滚动后模糊深栏；无 SaaS 多级导航。
- Hero 文案：主标题「让研究，持续演化。」；说明「将论文、数据、代码与讨论，组织为开放、可验证、可演化的研究对象。」；CTA `探索研究` → `#latest` 锚点；`创建研究对象` → 登录/邀请说明（邀请制不显示虚假可用）。
- 区块顺序（仅三个）：①最新研究（真实 feed，首屏底部只露标题与卡片上沿）→ ②研究如何演化（四阶段面板）→ ③Hermes 与你共同研究 + 开放但可信（上下文理解/证据检查/审批 + 身份/版本/许可/评审/provenance）。不做 Bento 功能大全。
- 四阶段演化面板：同一 RO 贯穿 创建 → Hermes 解析 → 协作 Diff → 合并发布；桌面可点击 stepper + layout morph；空闲自动低速推进一次后停止；移动端滑动卡片；**禁止 scroll-jacking**。
- RO Card 字段（首页/Dashboard/搜索复用）：标题、作者与认证状态、当前版本、更新时间、演化/讨论计数、许可。视觉低调，内容本身成为界面。

## 7. API 契约新增（走 api-contract 流程）

`GET /explore`：公开 RO feed，无需鉴权，限流保护。Query：`limit`（默认 12，上限 50）、`cursor`（可选分页）。响应：`{ items: RoCard[], nextCursor: string | null }`，`RoCard` 字段同 §6。仅返回 `visibility=public` 且已发布版本的 RO。独立列表页与搜索后置（P2+）。

## 8. Hermes 契约

- 形象：Scholar's Tea wanko（同一 AI 宇宙，有意为之），保留模型出处。
- **三模式**：陪伴（首页/Dashboard/空状态/引导；可活泼、随机小动作；首屏前 1.5s 无大动作）/ 研究（编辑/分析/评审；区分事实、来源、推断与建议；明示不确定性；不伪造文献与执行状态；高影响修改给可预览 diff；学术内容不轻佻）/ 审批（发布/删除/合并/高风险操作；停止玩笑；展示对象、范围、影响、可恢复性；R0–R4 决定介入强度）。
- **Live2D 一步到位 + 风险缓释**：①root layout 常驻单 iframe 实例，复用 Scholar's Tea iframe + 离线 pixi6 架构与 postMessage mood 协议；②懒加载——hero 关键路径零 pixi，load 后 +1.5s 出现，LCP 前后实测对比，超预算则 feature-flag 降级；③首曝场景 = Dashboard/登录后页面，首页 hero 曝光排在性能验证后；④`prefers-reduced-motion` 与加载失败统一回退静态立绘 SVG；⑤全站单 PIXI 实例。

## 9. 响应式

- ≥1440px：左右布局，核心对象可越出右侧视口；1024–1439px：对象缩小后移；768–1023px：上下错叠，文案不压对象关键轮廓；<768px：标题/对象/CTA 纵向，对象用简化静态版（保留六面与开放缺口）。
- 移动端功能与桌面一致；编辑器改分步/抽屉，不强行压缩三栏。

## 10. Ultrafast Science 元素

符号通用 + 内容层露出：主视觉不绑光学意象；期刊露出走 footer/about/专刊 collection 页；允许一处克制彩蛋（脉冲波形加载动画）。

## 11. 分期

- **P0 地基收尾**：Tailwind v4 + shadcn/ui 底座、token 层、字体。（i18n provider、messages 迁移、public 资产已完成。）
- **P1 首页视觉原型**：Header + Hero + #latest 衔接；真实 DOM + SVG 符号两版变体；1440×900 / 1920×1080 / 390×844 截图；用户确认后冻结 token。
- **P2 首页全内容**：`GET /explore` + 真实 feed、四阶段演化面板、Hermes 与信任区块。
- **P3 产品壳与核心页面**：Dashboard/登录注册、编辑器/协作区/公开 RO 三套视觉重构、Hermes 全局状态机 + R0–R4 + Live2D 集成（首曝 Dashboard）。
- **P4 增强**：Evolution Tree morph、首页 hero Live2D 曝光（性能验证后）、完整双主题、更高级 Hero 动效（如需 Three.js 先出包体/内存/LCP 数据与决策记录）。

## 12. 验收标准

- 视觉：3 秒内读出"一个持续演化的研究对象"；320px 宽仍认出开放结构与蓝/橙分支合并；首屏单一主焦点；不出现月球/星空/发光大脑/文档堆/紫色渐变模板元素。
- 内容：CTA 全部有真实去向；feed 用真实数据或明确 skeleton；文案全部走 i18n；RO Card 跨页复用。
- 工程：WCAG AA；键盘可达、焦点可见；`prefers-reduced-motion` 完整支持；Hero 动效失败页面仍完整可用；LCP ≤ 2.5s（真实网络验证）；全站单 PIXI 实例。

## 13. 禁止误读

- "参考 Moonshot" = 克制、尺度、单一强符号、内容节奏；非复制月球/宇宙背景。
- "AI 科技感" = Hermes 对知识结构的解析、diff、重组；非机器人/脑图标。
- "Hermes 活泼" ≠ 学术回答轻佻；"暗色震撼主页" ≠ 编辑器与公开正文全暗。
- 效果图是方向参考，不是最终 UI 资产或像素级 spec。
