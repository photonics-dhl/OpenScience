# Researcher Ingestion Product Slice Design

**状态：** 用户已确认主流程与 Dashboard 优先级，待 spec 审阅

## Goal

把 OpenScience 的第一条产品级前端闭环做成可真实使用的研究入口：

`邮箱验证码注册 → 登录 → Dashboard → 新建 RO → 上传科研资料 → Hermes 解析 → 证据确认 → SDF/RO Workspace`

Dashboard 对回访用户优先展示“继续最近研究”；对新用户展示“导入第一份资料”。“上传资料 / 创建 RO”始终是同等重要的主操作。

## Visual thesis

**Evidence-led scholarly cockpit**：深色工作台像一间安静的研究控制室，纸白内容层保留学术出版的阅读感；唯一强视觉锚点是 Research Object 六节点结构和 Hermes 的证据轨迹，而不是泛化渐变、卡片墙或装饰粒子。

**Content plan**：先定位研究上下文与最近工作 → 选择导入方式 → 展示上传与解析状态 → 逐项核对证据 → 进入可持续演化的 RO Workspace。

**Interaction thesis**：上传后使用可恢复的任务轨道；Hermes 解析结果以证据片段和状态标签逐项显现；确认字段时只对对应节点做短促 morph/highlight，避免整页跳动；`prefers-reduced-motion` 下全部回退为静态状态变化。

## 1. Route and surface model

| Route | Surface | Primary job |
|---|---|---|
| `/auth/register` | 暗色 onboarding | 请求验证码、完成注册、建立 Personal Workspace |
| `/auth/login` | 暗色 onboarding | 登录并恢复最近 RO/任务 |
| `/dashboard` | 深色工作台 | 继续研究、创建 RO、查看 Hermes 任务和可行动通知 |
| `/research-objects/new` | 深色工作台 | 选择空白创建或资料导入，显示数据处理同意摘要 |
| `/research-objects/:id/ingest` | 深色工作台 | 多文件上传、队列、解析进度、失败重试 |
| `/research-objects/:id/hermes` | 深色工作台 | 证据、置信度、缺失字段、逐项确认 |
| `/research-objects/:id/edit` | 深色工作台 | SDF 编辑、版本、Artifact、协作与发布 |

Hermes 与 Live2D 共享账户、Workspace、RO unique ID、task ID、version ID；Live2D 只是 `/dashboard`、`/ingest`、`/hermes` 的可收起入口，不复制业务状态。

## 2. Dashboard information architecture

1. **Context rail**：Workspace 切换、当前用户、语言、帮助/快捷键。
2. **Continue strip**：最近访问的 RO，显示 unique ID、当前版本、状态、未处理任务。
3. **Import stage**：拖拽区 + “选择文件” + “从空白开始”；首次用户为引导态，回访用户为紧凑操作条。
4. **Hermes task rail**：进行中、需要确认、失败待重试；只显示可行动任务。
5. **Research list**：按状态分组的 RO 列表，支持搜索和过滤，不使用三张相同卡片模板。

Dashboard 不使用营销 Hero，不使用无信息渐变背景；布局以稳定的工作区层级和明确的下一步为核心。

## 3. Ingestion model

### Supported formats

| Format | First-pass behavior | Evidence anchor |
|---|---|---|
| PDF | 文本/页码抽取，保留页图预览；表格/公式标记为待复核 | page + text span |
| DOCX | 标题、段落、表格、内嵌图片抽取 | paragraph/table index |
| TeX | section、equation、citation、figure 引用解析；宏展开失败显式提示 | source file + line range |
| Markdown | heading、paragraph、code、table、image link 解析 | line range |
| PNG/JPEG/WebP/SVG | 元数据、缩略图、可选 OCR/图注任务 | artifact id + region |

上传阶段只负责持久化 Artifact 和任务元数据；解析阶段由 Hermes/worker 生成建议；写入 SDF 必须经过统一确认。

### Task states

`queued → uploading → stored → parsing → needs_review → confirmed → written`

失败状态为 `failed_retryable` 或 `failed_blocked`。每个状态占用固定布局，不通过改变高度制造跳动。

### Consent summary

提交给 Hermes 前必须显示：本次处理文件、用途、可见范围、保存 Workspace、处理提供商、保留期限、删除方式和“不用于公共模型训练”的默认说明。用户可展开详情，但主流程只需一次明确确认。

## 4. Evidence review interaction

Hermes 结果按 SDF 六节点组织：Problem、Insight、Method、Results、Limitations、Reproducibility。

每个字段显示：

- 状态：已确认 / 待确认 / 缺失 / 推断
- 置信度：高 / 中 / 低
- 来源：文件名、页码/行号/段落或图片区域
- Hermes 解释：为什么提出该值
- 操作：确认、编辑、拒绝、跳过

右侧 Hermes rail 始终显示当前批次进度和待处理数量；点击证据时正文预览同步定位，不打开无上下文的独立聊天页。

## 5. Asset and library policy

- 图标优先使用已有 Lucide/Tabler/Phosphor 中许可证清晰的单色 SVG，并自托管到构建产物。
- 交互原语优先复用 Radix/shadcn 现有代码，不引入视觉不一致的整套模板。
- 动效优先使用 CSS/IntersectionObserver；只有跨状态编排确实需要时才引入 Motion，且必须遵守 reduced-motion。
- 科学视觉（RO 节点、证据轨迹、版本差异）由项目内 SVG/CSS/Canvas 生成，并登记 prompt、模型、时间、输入和输出哈希。
- 外部图库只用于真实研究内容或编辑策展，不作为工作台装饰；任何下载资产必须记录来源、许可证、原始链接和变更日期。

## 6. Accessibility and responsive behavior

- WCAG 2.2 AA 对比度目标；所有任务状态有文本，不依赖颜色或动效。
- 上传支持键盘、拖拽和文件选择器；队列可通过屏幕阅读器播报状态变化。
- 桌面为导航 rail + 工作区 + Hermes rail；移动端转换为顶部 RO 状态、分步内容和 Hermes bottom sheet。
- 375px 宽度下仍能完成注册、上传、确认；不通过隐藏功能实现“响应式”。

## 7. Acceptance gates

1. Playwright 能在干净浏览器完成注册/登录/新建 RO/上传测试文件/查看任务/确认字段。
2. 真实 API 返回值驱动 UI，禁止用静态 mock 伪装成功流程。
3. 每个路由具备空、加载、错误、成功、权限不足和任务失败状态。
4. 桌面 1440×900、平板 768×1024、移动 375×812 截图通过人工审美检查。
5. 键盘导航、焦点、对比度、reduced-motion 和上传恢复行为通过自动化检查。
6. 设计源、代码组件、截图证据、progress、handoff 和 project_index 同步后，才允许部署生产。

## Non-goals for this slice

- 不在本轮完成期刊策展后台的全部编辑能力。
- 不在本轮实现所有高级 AI 模型或视频生成能力。
- 不以增加装饰性粒子、渐变或第三方模板数量作为“美感完成”的替代指标。
