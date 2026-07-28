---
name: frontend-design
description: "Use when building or modifying any UI page, component, or layout — especially workbench, public RO pages, or collaboration areas. Do NOT use for backend-only logic with no UI surface."
---

# Frontend Design — 前端视觉与交互规范

三套视觉系统 + 响应式 + 可访问性 + i18n，逐条可核对。

## 何时使用 / 何时不使用

- **使用**：新建或修改页面、组件、布局、样式 token；做移动端适配；处理表单、diff、review 等协作交互。
- **不使用**：纯后端 API、脚本、与 UI 无关的工具代码。

## 检查清单

### 三套视觉系统（Spec §18.2、§2.5-6）

1. **工作台**：现代产品式 UI——现代、克制、信息密度适中。
2. **公开 RO 页面**：严肃学术出版风格排版。
3. **协作区域**（Issue/PR/Review/diff）：GitHub 式交互与状态呈现。
4. **中英混排**：中文与英文内容混排良好；颜色 token 从首版预留（深色模式可后续）。

### 响应式（Spec §2.5-5、§18.2）

5. **桌面移动功能一致**：所有主要流程在移动端可完成；不得"移动端隐藏功能"。
6. **三栏改分步/抽屉**：复杂三栏界面（如 SDF 编辑器：左大纲、中编辑、右 SDF/AI 面板，§2.5-2）在移动端改为分步/抽屉，而非删除功能。

### 可访问性与性能（Spec §18.3）

7. **WCAG AA**：对比度达 AA 级目标；键盘导航可用；焦点状态明确。
8. **语义化 HTML**：语义化标签；图片必须有 alt。
9. **性能**：公开页面优先 SSR/缓存；大文件列表虚拟化；AI/上传任务显示可恢复进度。
10. **错误提示**：包含重试、保存草稿和问题定位入口。

### 国际化（Spec §2.5-5）

11. **i18n 从首版**：中文优先，但首日起采用中英文国际化架构；界面文案不得硬编码在组件里，必须走 i18n 资源。

### Hermes 审批交互（Spec §2.5-7、§9.4）

12. **审批不打断**：写入/删除/Merge/发布/权限变更需审批，但必须支持批量预览、作用域授权和撤销；UI 组件按 R0–R4 分级呈现确认强度（§9.4）。
