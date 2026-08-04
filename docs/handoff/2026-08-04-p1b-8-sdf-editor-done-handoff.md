# Handoff — 2026-08-04 P1B-8 三栏 SDF 编辑器桌面端完成

- Current goal: Phase 1B SDF 与版本。P1B-8 已闭环（apps/web 三栏编辑器 + 建议确认 + 版本导航，next build 通过），下一任务 P1B-9（task-master 3.9，需读清单）。
- Done:
  - 五决策（design gate）：Markdown（react-markdown + remark-gfm）、next-intl（中英）、React useReducer、localStorage 草稿、预置 AI 建议
  - apps/web lib：api.ts（fetch 封装对接现有 API）/ editor-state.ts（reducer + 草稿持久化）/ suggestions.ts（建议状态机 + diff 应用）
  - components/editor/：EditorLayout（三栏 240+300px）/ OutlinePanel（六字段大纲 + 版本导航）/ CoreEditor（Markdown 六字段 + 预览切换）/ SuggestionsPanel（建议 diff 卡片）/ ArtifactUploader（P1B-3 管线）
  - app/research-objects/[id]/edit/page.tsx：草稿恢复横幅 + 错误面板 + 保存（PATCH /sdf 乐观锁）+ 提交（commit）+ 版本 diff 导航
  - i18n：messages/zh.json + en.json（§2.5.5 中文优先，文案全走 useTranslations）
  - 测试：web 13（reducer 4 + 草稿 4 + 建议 4 + 合同 1）；next build 通过；本地门禁全绿
  - task-master 3.8 done + details
- Constraints: 同前。新增：web knip project 含 components/lib；web 组件相对路径 4 层；前端无云上集成（build + 单测验收）。
- Open risks / parked: 真实 AI 提取（Phase 1D SDF Extractor，接建议同通路）；移动端抽屉（Phase 1D）；富文本（Phase 1D 按需）；审核/关系图入口占位（Phase 1D）；病毒扫描（P1B-后续）；Version 发布状态机（P1B-后续）；P1A-3 终审项、P1A-5 deferred ①、/admin TOTP、SDF Schema 债务（0.2.0）。
- Next action: P1B-9（task-master 3.9）——用 `mcp__task-master-ai__get_task id=3.9` 读清单。
- Read first: `AGENTS.md` → 主 spec → `docs/progress.md` 置顶条目（P1B-8）→ `project_index.md` → task-master 任务 3.9 → `docs/specs|plans/2026-08-04-p1b-8-*`
