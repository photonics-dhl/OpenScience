# P1C-10 GitHub 式协作区域前端交互 — 实施计划

- 日期：2026-08-04
- 任务：task-master 4.10
- 依据：`docs/specs/2026-08-04-p1c-10-collab-frontend-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 单页 `/research-objects/[id]/collab` + tab |
| Q2 | 每协作域一对组件（List/Detail）共享 Drawer |
| Q3 | lib/api.ts 加全部协作端点 |
| Q4 | 作者编辑按作者组；Merge 按钮后端 403 提示 |
| Q5 | HighRiskDialog：后端 409 reasons → confirm 重试 |

## TDD 步骤

1. **lib/api.ts 扩展**：协作类型 + 端点（issues/prs/branches/fork/authors/notifications/reviews/merge）
2. **组件**（components/collab/）：
   - CollabTabs.tsx（tab 导航，GitHub 式）
   - IssueList.tsx + IssueDetail.tsx（列表/详情 + 评论 + 状态流转）
   - PrList.tsx + PrDetail.tsx（声明表单 + diff + Review + Merge）
   - ForkPanel.tsx（Fork 入口 + 来源）
   - AuthorsPanel.tsx（作者/CRediT，作者组编辑）
   - NotificationsPanel.tsx（通知 + 已读）
   - HighRiskDialog.tsx（role=dialog + reasons + confirm）
3. **页面**：app/research-objects/[id]/collab/page.tsx（client，tab 切换，移动端 Drawer）
4. **i18n**：messages/zh.json + en.json 加 collab 命名空间
5. **前端测试**（apps/web/test/collab.test.tsx）：CollabTabs/HighRiskDialog/IssueList 渲染 + i18n 键
6. **本地门禁**：next build + lint + 前端测试
7. **云上验证**：既有 84/84 不回退
8. **文档同步** + task-master 4.10 done

## 验收对照

- §2.5 决策 6：GitHub 式协作交互 ✅
- §2.5 决策 5：桌面/移动端功能一致 ✅
- §18.3：WCAG AA（dialog/aria/focus）✅
- §2.5 决策 5：i18n 中英 ✅
- §21.2 步骤 11/12：Fork→Branch→PR + Review→Merge 全流程 UI ✅

## 风险

- next build 需 client 组件无 SSR 冲突（'use client'）
- Drawer 复用需检查 props 兼容
- 前端测试用 vitest + @testing-library（查既有 test 依赖）
