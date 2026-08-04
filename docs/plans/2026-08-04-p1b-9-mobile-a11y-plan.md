# P1B-9 移动端分步/抽屉编辑器与可访问性 Plan

> Phase 1B SDF 与版本 — P1B-9  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-9-mobile-a11y-design.md](../specs/2026-08-04-p1b-9-mobile-a11y-design.md)  
> 对应 task-master: 3.9

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| 抽屉 | 自写 Drawer 组件 |
| 移动端切换 | 顶栏 tab + 抽屉 |
| 上传进度 | XHR onprogress |
| 虚拟化 | 简单窗口 + 滚动加载 |
| 焦点 | 自写 focus trap |

---

## 1. 任务拆解（TDD）

### Task 1：响应式布局
- `components/editor/EditorLayout.tsx`：改响应式（桌面 grid 三栏 / 移动单栏）
- `components/editor/Drawer.tsx`：自写抽屉（CSS transition + aria-modal + focus trap + Esc）
- `components/editor/MobileTabs.tsx`：顶栏 tab（大纲/编辑/面板）
- 单测：Drawer open/close/Esc + focus 还原
- 门禁：单测 4+ 全绿 + build

### Task 2：WCAG AA
- `app/globals.css`：`:focus-visible` 焦点环（2px accent）+ aria 支持
- 组件语义化：header/nav/main/aside + aria-label + role="alert" + img alt
- EditorLayout/OutlinePanel/CoreEditor/SuggestionsPanel 补语义化
- 门禁：build 通过

### Task 3：性能（§18.3）
- `components/editor/VersionList.tsx`：虚拟化（前 20 + 滚动加载）
- `components/editor/ArtifactUploader.tsx`：XHR 进度条 + 失败重试
- 单测：VersionList 窗口逻辑 + Upload 进度状态机
- 门禁：单测 3+ 全绿 + build

### Task 4：主页面接入
- `app/research-objects/[id]/edit/page.tsx`：接入 Drawer + MobileTabs + VersionList + Uploader
- 单测：响应式状态（tab 切换/抽屉联动）
- 门禁：单测 3+ 全绿 + build

### Task 5：本地门禁收口
- build/typecheck/lint/audit/docs 全绿
- 全仓 test 无回归

### Task 6：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.9 done + details

---

## 2. 验收清单

- [ ] 移动端抽屉/分步（不删功能）
- [ ] 键盘导航 + 焦点状态 + focus trap
- [ ] 语义化 HTML + alt + aria
- [ ] WCAG AA 对比度（:focus-visible 环）
- [ ] 版本列表虚拟化 + 上传进度
- [ ] 单测 + build
- [ ] 本地门禁全绿
- [ ] task-master 3.9 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **自写 Drawer focus trap**：焦点还原/陷阱正确性（单测覆盖）
- **XHR 上传**：替代 fetch，接口变化（FormData 同 fetch）
- **响应式 CSS**：桌面不回归（P1B-8 三栏保持）

### 3.2 依赖
- P1B-8：三栏编辑器（改造基础）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1（响应式 + Drawer） | 2h |
| Task 2（WCAG AA） | 1.5h |
| Task 3（虚拟化 + 上传进度） | 1.5h |
| Task 4（主页面接入） | 1h |
| Task 5-6（门禁 + 文档） | 1.5h |
| **总计** | **7.5h** |
