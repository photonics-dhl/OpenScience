# P1B-8 三栏 SDF 编辑器桌面端 Plan

> Phase 1B SDF 与版本 — P1B-8  
> Plan 日期：2026-08-04  
> 对应 Design: [2026-08-04-p1b-8-sdf-editor-design.md](../specs/2026-08-04-p1b-8-sdf-editor-design.md)  
> 对应 task-master: 3.8

---

## 0. Design Gate 确认决策

| 决策 | 方案 |
|---|---|
| Markdown | react-markdown + remark-gfm |
| i18n | next-intl（中英资源） |
| 状态 | React Context + useReducer |
| 草稿 | localStorage |
| AI 建议 | 右栏预置演示（Phase 1D extractor 接同通路） |

---

## 1. 任务拆解（TDD）

### Task 1：web 基础设施
- 依赖：react-markdown、remark-gfm、next-intl
- `apps/web/messages/zh.json` + `en.json`（i18n 资源，中文优先 §2.5.5）
- `apps/web/lib/api.ts`：fetch 封装（auth cookie + JSON + 错误映射）
- `apps/web/lib/i18n.ts`：next-intl 配置
- `apps/web/app/layout.tsx`：next-intl provider + 全局样式
- 门禁：next build 通过

### Task 2：编辑器状态（reducer + 草稿）
- `apps/web/lib/editor-state.ts`：EditorState + reducer（编辑/撤销/恢复）
- `apps/web/lib/editor-draft.ts`：localStorage 草稿读/写/恢复（§18.3）
- 单测：`apps/web/test/editor-state.test.ts`（reducer 转换/草稿持久化）
- 门禁：单测 6+ 全绿

### Task 3：三栏布局
- `apps/web/app/research-objects/[id]/edit/page.tsx`：三栏布局（左 240px + 中 + 右 300px）
- `apps/web/components/editor/OutlinePanel.tsx`：左栏大纲（六字段锚点）+ 版本导航列表
- `apps/web/components/editor/CoreEditor.tsx`：中栏 Markdown 六字段编辑（textarea + react-markdown 预览切换）
- `apps/web/components/editor/SuggestionsPanel.tsx`：右栏建议列表
- 门禁：build 通过

### Task 4：AI 建议确认机制（§5.4 MUST）
- `apps/web/lib/suggestions.ts`：AiSuggestion 类型 + 状态机（pending/applied/dismissed）
- SuggestionsPanel：diff 卡片（before→after）+ 应用按钮
- **应用 → 写编辑器草稿（不直接写 SDF）** + 保存按钮 → PATCH /sdf（乐观锁 version）
- 单测：suggestions 流程（pending→applied 不落库）
- 门禁：单测 4+ 全绿

### Task 5：附件上传 + 版本导航
- `apps/web/components/editor/ArtifactUploader.tsx`：POST /artifacts/upload（multipart）+ 附件列表
- `apps/web/components/editor/VersionNavigator.tsx`：GET /versions 列表 + comparison diff 展示（P1B-4/5 消费）
- 门禁：build 通过

### Task 6：草稿自动保存 + 错误提示（§18.3）
- debounce 1s 自动保存到 localStorage
- 进编辑器读草稿 → 恢复提示（恢复/放弃）
- 错误面板：重试/另存草稿/问题定位
- 单测：draft 恢复 + error panel
- 门禁：单测 3+ 全绿

### Task 7：合同测试 + 门禁
- 合同测试：编辑器 core 结构 vs SDF_CORE_FIELDS（六字段）；commit payload vs /sdf API
- next build + typecheck + lint + 全仓 test
- 门禁：全绿

### Task 8：文档同步 + task-master done
- progress.md / project_index.md / handoff
- task-master 3.8 done + details

---

## 2. 验收清单

- [ ] web build（next build）通过
- [ ] 三栏布局 + Markdown 编辑 + 附件上传
- [ ] AI 建议确认（确认才写 SDF，§5.4 MUST）
- [ ] 版本导航（P1B-4/5 diff 消费）
- [ ] 草稿自动保存 + 错误提示（§18.3）
- [ ] i18n 中英资源
- [ ] 单测 + 合同测试
- [ ] 本地门禁全绿
- [ ] task-master 3.8 done
- [ ] 文档同步

---

## 3. 风险与依赖

### 3.1 风险
- **next-intl 配置**：App Router 集成需 middleware/provider 配置（验证）
- **react-markdown 客户端组件**：'use client' 边界
- **API 无 CORS**：web 与 api 不同源（dev：web 3000，api 3001）——需 dev proxy 或同源
- **附件 multipart**：浏览器 FormData 上传

### 3.2 依赖
- P1B-2：/research-objects + /sdf API
- P1B-3：/artifacts upload
- P1B-4/5：/versions + comparison
- P1B-6：/research 公开 URL（只读）

---

## 4. 预计工作量

| 任务 | 预计 |
|---|---|
| Task 1（基础设施） | 1.5h |
| Task 2（状态 + 草稿） | 1h |
| Task 3（三栏布局） | 2h |
| Task 4（建议确认） | 1.5h |
| Task 5（附件 + 版本导航） | 1.5h |
| Task 6（草稿 + 错误） | 1h |
| Task 7-8（合同 + 文档） | 1.5h |
| **总计** | **10h** |
