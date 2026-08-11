# OpenScience Optical Editorial Rebaseline — 产品网页设计 Spec

> 日期：2026-08-10  · 状态：用户设计门禁已确认，待书面审阅
> 上游：`docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`（视觉真源）、`docs/user_ideas/8.10/OpenScience_Design_Masterplan_v2.md`（产品结构与交互）、`docs/OpenScience_Kimi_Development_Spec.md`（需求基线）

## 1. 目标与问题诊断

本次工作是在已经部署并可访问的页面和业务流程上做视觉、布局与引导优化，不重写产品前端或后端能力。线上已有 Landing、登录、Explore、Dashboard、创建、编辑器、公开 RO、版本与协作流程；本 spec 只定义这些现有能力的呈现层改进，禁止以视觉优化为名替换既有 API、数据模型或用户路径。

现有问题集中在首屏构图、公开入口层级、信息密度、Hermes 唤起方式和页面之间的视觉连续性：中央光学场需要与标题建立真实关系，CTA 需要清楚区分探索/创建/登录，工作区和公开 RO 需要共享同一套状态语言，但不应被改造成另一套产品。

本轮的北极星是：**OpenScience 是一台会影响文字、证据与版本的光学研究仪器。** 保留现有风格、素材和功能，以最小结构变化获得更清晰的任务路径。

## 2. 视觉宪法

### 2.1 三种表面

1. **品牌表面：Typography is the medium**
   - 黑白巨型混排；`Science evolves.` / `科学，持续演化。` 是主视觉本身。
   - 局部折射、半色调和扫描纹理只作用于文字/证据关系。
   - 一个朱红焦点表示当前、变化或待确认。

2. **个人工作表面：Evidence is the interface**
   - 深黑、宽阔负空间和规则线构成抽象深空间仪器感。
   - 左侧结构、中央工作面、右侧证据/Hermes 三平面稳定存在。
   - 写作可进入纸面；扫描、Diff、审批进入仪器暗面。

3. **公开阅读表面：Reading is the proof**
   - 暖纸色、Serif 正文、学术 caption 和可打印布局。
   - 标题、作者、RO ID、版本、许可、引用和 Insight 优先。
   - provenance 可探索但不干扰长时间阅读。

### 2.2 共同语法与禁用项

- Wordmark 冻结为 `OpenScience.`，结尾朱红点；favicon 暂用设计完整的 `O.`，后续可独立替换而不改变布局。
- 字体角色：Display Grotesk、Editorial Serif、Noto Serif SC、UI Sans、IBM Plex Mono。
- 核心色：黑、纸白、朱红；确认后的新增可使用低饱和绿色。删除蓝紫渐变、星空/黑洞/星球、对称六节点环、玻璃卡片墙、大面积圆角、无意义 HUD 与通用 SaaS Hero。
- 纹理低强度、分表面使用：Landing 半色调/胶片颗粒、Workspace 状态扫描、Public RO 细纸纹理；表单和正文不叠脏纹理。
- 动效必须表达对焦、扫描、显影、版本替换、证据连接或导航层级；无法说明语义的动画删除。

## 3. 用户、入口与信息架构

首要用户是正在形成研究成果的作者/研究者；公开读者和 Reviewer 次之；Ultrafast Science 编辑/策展第三。作者使用平台抢占先发，所有版本、Artifact、Review 和策展记录绑定长期 RO unique ID。

```text
Landing
├─ Explore
├─ Create a Research Object
├─ Sign in
└─ Ultrafast Science
```

两条身份路径必须独立：

```text
Create RO → Evidence Intake → 未登录时验证 → 返回 Intake → 上传/解析/确认 → Workspace
Sign in   → 身份页 → Dashboard → 继续已有 RO/处理任务
```

登录后应返回原始 `returnTo` 上下文；已登录用户创建 RO 时跳过验证。

一级页面：`/`、`/explore`、`/dashboard`、`/ro/:id/workspace/*`、`/ro/:publicId`、`/collections/ultrafast-science/*`、`/admin/editorial`。Workspace 模式为 Overview、Write & SDF、Data & Code、Versions、Collaboration、Publish；切换模式不丢失 RO、版本或 Hermes 上下文。

## 4. 三联屏首批交付

### 4.1 Landing

56px 极简导航；巨型中英混排；真实 Create/Explore CTA；不展示虚构的 RO metadata legend；Canvas/WebGL 只负责局部光学媒介。桌面端恢复 `Science → optical field → evolves.` 单一水平轴；移动端采用受控两行排版，触摸点击替代持续 hover。

首屏入口优先级固定为：`Explore public research`（主）→ `Create a Research Object`（次）→ 顶部 `Sign in`（独立入口）。Explore 直接进入现有 `/explore`，Create 按登录状态进入现有创建流程，不新增意图问卷或中间首页。

### 4.2 RO Workspace

```text
Global Nav 56px · Object Header 64px · Mode Tabs 44px
Outline 19% | Editor 56% | Evidence/Hermes 25%
Task/Save Status 32px
```

Object Header 使用单行规则线，不拆三张统计卡。左栏展示章节、SDF N1–N6、Artifacts、Versions；中央展示正文、公式、媒体、表格和 Diff；右栏展示 Evidence、Hermes、Review。AI 建议采用 Before/After、来源、影响范围和审批动作。

### 4.3 Public RO

纸面导航；760px 主阅读列 + 280px metadata rail；首屏先证明标题、作者、RO ID、版本、许可、引用和 Insight；六节点作为目录/证据索引；版本、Hash、Review、Artifact 采用学术 caption；支持打印和 PDF。

## 5. 核心交互与运行时

### 5.1 Optical Field

- 主标题是真实 DOM 文本，可选择、可访问、可索引。
- Canvas/WebGL 生成半色调、局部 displacement、折射和证据粒子。
- 中央保持低速、稳定的固定狭缝与竖向粒子幕；空间拓扑永久绑定标题交界，指针不得移动光轴、遮罩或粒子场中心。
- 桌面指针只调制狭缝附近的能量、相位和不超过 18px 的纵向偏折，停止后约 650ms 恢复；移动端不持续追踪手指，点击触发一次短暂脉冲。
- 不显示巨大的圆形鼠标环、圆形空洞或跟随鼠标的粒子球；字形粒子必须从实际标题 glyph alpha 采样，呈现 `Science` 字形逐渐粒子化、向狭缝压缩并在右侧以波前/局部字形折射展开的连续关系。
- SVG turbulence 不得承担主字形形变；主形变必须是方向明确的 glyph-to-particle 映射。`evolves` 只允许狭缝附近的前部字母出现局部折射/轻微色散，其余字母保持清晰。
- 点击/按住短暂显现 SDF 证据层；不旋转全页、不使用星空或视频替代交互。

### 5.2 Hermes / Live2D

Live2D 是功能驱动的研究伙伴，不是装饰。Landing 不抢主视觉；登录后在 Dashboard、创建页、Workspace 和公开 RO 页提供统一 Hermes 唤起入口，角色只在 Hermes 面板中出现。公开页默认只读，工作区可提出建议但写入仍需确认。面板首次打开显示当前上下文任务卡，而不是空白聊天框；点击 Live2D 与点击 Hermes 任务入口进入同一上下文。

### 5.3 Evidence Intake

支持 PDF、Word、TeX/ZIP、Markdown、图片、数据和代码的组合导入，可标记主文稿。真实状态顺序为：安全扫描 → 转换/OCR → 内容解析 → SDF 映射 → Hermes Before/After 审查 → 用户确认。失败必须给出重试、保存草稿、诊断 ID 和 `needs_review` 路径。

## 6. 数据与媒体基线

测试和视觉验收可使用带有明确“测试数据”标记的 fixture，但首页和公开索引不展示虚构统计、版本号或附件数。生产页面只展示 API 返回的真实 Research Object、版本、Artifact 和 provenance；没有数据时显示诚实空状态。管理员精选对象如果启用，必须通过现有公开 RO 数据绑定，不新增静态样例层。

## 7. Figma 与代码职责

Figma 管理 tokens、字体、栅格、组件、响应式结构、状态矩阵和动效注释；浏览器实现真实字体渲染、Optical Field、Canvas/WebGL、Live2D 和性能降级。验收以服务器真实页面、1440×900/1920×1080/390×844 截图与实际操作为准，而不是 Figma 静态图层相似度。

## 8. 分期与服务器交付

### 8.0 本轮增量优化边界（2026-08-11）

1. 先优化线上 Landing，再将同一视觉语法延伸到已有 Explore、Dashboard、创建页和公开 RO。
2. 保留现有路由、API、数据模型、上传/解析/编辑/发布流程；不做功能重构。
3. 每个页面改动必须通过真实服务器路由、真实状态和三视口截图验证；失败状态必须保留重试与恢复入口。
4. 视觉验收以线上实际操作为准，先完成 Landing 用户确认，再逐页传播。

1. **Phase 0：视觉地基** — v3 tokens、字体、规则线、基础组件、WCAG/i18n/reduced-motion。
2. **Phase 1：三联屏** — Landing、Workspace、Public RO，接真实 API 和启动 RO；直接部署服务器，保留上一镜像回滚。
3. **Phase 2：核心产品流** — Auth、验证码注册、Evidence Intake、Dashboard、Hermes 任务闭环。
4. **Phase 3：浏览与策展** — Explore、Public 深层内容、Ultrafast Science Collection、Editorial Curator。
5. **Phase 4：质量收口** — 视觉回归、无障碍、性能、媒体降级、真实数据与生产验收。

社区依赖只在确有收益时引入，必须记录来源、许可证、包体/运行时影响、服务器安装方式和降级方案；不把第三方设计平台 runtime 作为生产视觉核心。

## 9. 验收门

- 去掉动效后纯排版仍成立；
- 首屏 3 秒内读出“持续演化的 Research Object”；
- 只有一个朱红视觉焦点；
- Workspace 主要依靠规则线、排版、密度和对齐，不依靠卡片；
- Public RO 可长时间阅读、打印和引用；
- 真实 API、空/加载/错误/成功/权限/任务失败状态均可操作；
- WCAG AA、键盘焦点、`prefers-reduced-motion` 和 LCP ≤ 2.5s 通过；
- 指针位于标题左侧、狭缝与右侧的 60/150/300ms 动态帧均不得出现圆形粒子边界，且固定光轴不得随鼠标横移；
- 三视口截图和服务器实际操作由用户审美验收后，才进入下一片。
