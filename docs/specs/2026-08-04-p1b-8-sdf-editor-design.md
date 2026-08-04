# P1B-8 三栏 SDF 编辑器桌面端 Design

> Phase 1B SDF 与版本 — P1B-8  
> Design Gate 日期：2026-08-04  
> 对应 Spec: §5.4、§2.5.2、§2.5.5、§18.3  
> 对应 task-master: 3.8（三栏 SDF 编辑器桌面端）

---

## 1. 目标与范围

### 1.1 目标
实现左大纲/中编辑/右 SDF-AI 面板的三栏编辑器，支持 Markdown 正文、附件上传、版本导航、AI 建议确认机制、草稿自动保存。

### 1.2 范围

**In Scope（P1B-8）**：
- web 基础设施：Next.js API client（对接现有 /auth、/research-objects、/sdf、/artifacts、/commits、/versions API）、i18n（中英，首版）、三栏布局
- 左栏：章节大纲（SDF 六字段）+ 版本导航（消费 P1B-4/5 版本与 diff 数据）
- 中栏：Markdown 正文编辑（六字段编辑区）+ 附件上传（P1B-3 管线）
- 右栏：六字段提取结果、AI 建议（建议/差异确认 UI，§5.4 MUST）、引用、审核入口
- AI 建议确认机制：建议以 diff 形式展示，用户确认才写入 SDF（§5.4 MUST，真实 AI Phase 1D SDF Extractor）
- 草稿自动保存（localStorage）+ 错误提示（§18.3：重试/保存草稿/问题定位）
- 测试：单测（状态与草稿恢复）+ 合同测试（编辑器与 /sdf API Schema）+ build

**Out of Scope（Phase 1D+）**：
- 真实 AI 提取（SDF Extractor，Phase 1D 联调）
- 富文本（WYSIWYG）——P1B-8 用 Markdown（§5.4 Markdown/富文本二选一，Markdown 先行）
- 移动端适配（响应式骨架，完整抽屉 Phase 1D）
- 审核/关系图实际功能（右栏入口占位）

---

## 2. 需求对齐

| Spec | 需求 | 本任务落实 |
|---|---|---|
| §5.4 | 左：章节大纲/实验/图表/数据/代码/版本导航 | 左栏大纲树 + 版本列表 |
| §5.4 | 中：Markdown/富文本正文与附件编辑 | Markdown 六字段编辑 + 附件上传 |
| §5.4 | 右：六字段提取/AI 建议/引用/审核/关系图 | 右栏面板 |
| §5.4 MUST | AI 提取以建议/差异展示，确认后才写入 SDF | 建议 diff 卡片 + 确认按钮 |
| §2.5.5 | 中文优先，中英 i18n 首版 | next-intl 资源文件 |
| §18.3 | 错误提示含重试/保存草稿/问题定位 | 错误面板 |
| §2.5.2 | 三栏移动端改抽屉（不删功能） | 响应式骨架预留 |

---

## 3. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| Markdown | `react-markdown` + `remark-gfm` | 轻量，§5.4 Markdown 先行 |
| i18n | `next-intl` | Next.js 官方支持，中英资源文件 |
| 状态 | React Context + useReducer（编辑器草稿状态） | 无重型状态库，草稿单一职责 |
| API client | fetch 封装 + 现有 API | 无额外依赖 |
| 样式 | CSS Modules | Next.js 内置，无 Tailwind 依赖 |

**依赖**：react-markdown、remark-gfm、next-intl

---

## 4. 页面结构

```text
/research-objects/[id]/edit     → 三栏编辑器
├── 左栏（240px）：大纲树（六字段锚点）+ 版本导航（commit/version 列表）
├── 中栏：Markdown 编辑器（六字段 textarea + 预览切换）+ 附件上传区
└── 右栏（300px）：AI 建议列表（diff 卡片）+ 引用 + 审核入口 + 关系图入口
```

### 4.1 编辑器状态

```ts
interface EditorState {
  core: { schemaVersion: string; problem: string; insight: string; method: string; results: string; limitations: string; reproducibility: string };
  artifacts: ArtifactReference[];
  version: number; // 乐观锁（§16）
  dirty: boolean;
  lastSaved: Date | null;
}
```

### 4.2 AI 建议机制（§5.4 MUST）

```ts
interface AiSuggestion {
  id: string;
  field: keyof CoreFields; // 建议修改哪个字段
  suggestion: string; // 建议值
  diffPreview: { before: string; after: string }; // 差异展示
  source: 'extractor' | 'manual'; // Phase 1D 真实 extractor
  status: 'pending' | 'applied' | 'dismissed';
}
```

**流程**：
1. 建议进入右栏，diff 卡片展示 before→after
2. 用户「应用」→ 写入编辑器草稿（**不直接写 SDF**）
3. 用户点「保存」→ PATCH /sdf（乐观锁 version）→ 落库
4. Phase 1D：SDF Extractor 产建议 → 同一通路

### 4.3 版本导航（消费 P1B-4/5）

- GET /versions 列表（P1B-4）→ 左栏版本树
- GET /versions/:from/comparison?to=:to（P1B-5）→ diff 展示（点击版本切换看差异）

### 4.4 附件上传（P1B-3 管线）

- POST /artifacts/upload（multipart）→ artifactId
- 附到编辑器 → commit 时随 artifacts 传

---

## 5. i18n（首版中文优先）

```text
apps/web/messages/
  ├── zh.json   # 中文（默认）
  └── en.json   # 英文
```

组件文案全部走 `useTranslations`，禁硬编码。

---

## 6. 草稿自动保存（§18.3）

- 编辑 debounce 1s → localStorage key `editor:draft:<roId>`
- 恢复：进编辑器读 localStorage → 提示「恢复草稿」/「放弃」
- 错误处理：保存失败 → 错误面板（重试/另存草稿/问题定位）

---

## 7. 测试策略

### 7.1 单元测试（vitest）
- 草稿状态 reducer（编辑/撤销/恢复）
- 草稿持久化（localStorage 读/写）
- 建议确认流程（pending→applied 不直接写 SDF）

### 7.2 合同测试
- 编辑器 core 结构与 /sdf API schema 一致（SDF_CORE_FIELDS 六字段）
- commit payload 结构（version + sdfCore + artifacts）

### 7.3 build
- next build 通过（SSR/客户端组件正确）

---

## 8. Open Questions（Design Gate 确认）

### 8.1 Markdown vs 富文本
- **决策（2026-08-04）**：方案 A — Markdown（react-markdown + remark-gfm），§5.4 Markdown 先行。

### 8.2 i18n 库
- **决策（2026-08-04）**：方案 A — next-intl（中英资源文件）。

### 8.3 状态管理
- **决策（2026-08-04）**：方案 A — React Context + useReducer（草稿单一职责）。

### 8.4 草稿存储
- **决策（2026-08-04）**：方案 A — localStorage（客户端离线可用）。

### 8.5 AI 建议来源
- **决策（2026-08-04）**：方案 A — 右栏预置建议演示（Phase 1D extractor 接同一通路）。

---

## 9. 债务登记

- **富文本**（Phase 1D 按需）
- **移动端抽屉**（Phase 1D）
- **真实 AI 提取**（Phase 1D SDF Extractor）
- **审核/关系图实际功能**（Phase 1D）
- **SSR 优化**（P1B-8 客户端为主）

---

## 10. 验收条件

- [ ] web build 通过（next build）
- [ ] 三栏布局 + Markdown 编辑 + 附件上传
- [ ] AI 建议确认机制（确认才写 SDF，§5.4 MUST）
- [ ] 版本导航（P1B-4/5 diff 消费）
- [ ] 草稿自动保存 + 错误提示（§18.3）
- [ ] i18n 中英资源
- [ ] 单测 + 合同测试
- [ ] 本地门禁全绿
- [ ] task-master 3.8 done
- [ ] 文档同步
