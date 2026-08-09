# OpenScience Optical Editorial Rebaseline — 产品网页设计 Spec

> 日期：2026-08-10  · 状态：用户设计门禁已确认，待书面审阅
> 上游：`docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`（视觉真源）、`docs/user_ideas/8.10/OpenScience_Design_Masterplan_v2.md`（产品结构与交互）、`docs/OpenScience_Kimi_Development_Spec.md`（需求基线）

## 1. 目标与问题诊断

本次工作不是继续微调旧页面，而是重构前端视觉语法。现有页面的问题不在单个颜色、圆角或动效参数，而在于：研究对象被拆成卡片、Landing/Dashboard/Workspace/Public RO 复用了同一种暗色模板、Hermes 没有成为任务上下文的一部分、静态 Figma 被误当成实时媒介，以及演示数据与真实 provenance 没有绑定。

新版的北极星是：**OpenScience 是一台会影响文字、证据与版本的光学研究仪器。**

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

56px 极简导航；巨型中英混排；真实 Create/Explore CTA；真实 RO metadata legend；Canvas/WebGL 只负责局部光学媒介。移动端上下交错排版，触摸拖拽替代 hover。

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
- 指针作用半径 160–200px，字符位移 8–14px，停止后 400–600ms 恢复。
- 点击/按住短暂显现 SDF 证据层；不旋转全页、不使用星空或视频替代交互。

### 5.2 Hermes / Live2D

Live2D 是功能驱动的研究伙伴，不是装饰。Landing 不抢主视觉；登录后在 Dashboard/Workspace 以可收起 rail、点阵轮廓或静态立绘出现。陪伴、研究、审批三模式绑定同一账户、Workspace、RO、任务和版本；审批时静止并显示影响范围。点击 Live2D 与点击 Hermes 任务入口进入同一上下文。

### 5.3 Evidence Intake

支持 PDF、Word、TeX/ZIP、Markdown、图片、数据和代码的组合导入，可标记主文稿。真实状态顺序为：安全扫描 → 转换/OCR → 内容解析 → SDF 映射 → Hermes Before/After 审查 → 用户确认。失败必须给出重试、保存草稿、诊断 ID 和 `needs_review` 路径。

## 6. 数据与媒体基线

启动语料采用 6 个完整 Demonstration RO + 12–18 个轻量公开索引条目。完整样本覆盖超快科学/光学、计算材料、含图片 OCR 的生物成像、环境数据、方法学复现和含视频结果的研究对象；至少一个进入 Ultrafast Science 演示 Collection。所有数据必须真实来源、许可清楚、标明演示用途并保留 provenance；不把效果图伪坐标、伪论文或伪科学数据投入生产。

## 7. Figma 与代码职责

Figma 管理 tokens、字体、栅格、组件、响应式结构、状态矩阵和动效注释；浏览器实现真实字体渲染、Optical Field、Canvas/WebGL、Live2D 和性能降级。验收以服务器真实页面、1440×900/1920×1080/390×844 截图与实际操作为准，而不是 Figma 静态图层相似度。

## 8. 分期与服务器交付

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
- 三视口截图和服务器实际操作由用户审美验收后，才进入下一片。
