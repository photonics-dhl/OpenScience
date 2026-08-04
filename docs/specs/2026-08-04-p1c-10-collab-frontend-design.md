# P1C-10 GitHub 式协作区域前端交互 — Design Gate

- 日期：2026-08-04
- 任务：task-master 4.10（Issue/PR/Review/Merge/Fork 前端基础交互）
- 依据：Spec §2.5 决策 5/6、§18.2 协作区域 GitHub 式、§18.3 WCAG AA
- 现状：apps/web 已有三栏编辑器（P1B-8/9）+ lib/api + next-intl + 移动端 Drawer

---

## 需求基线

1. 工作台内实现 Issue 列表/详情、PR 列表/详情（声明表单 + diff + Review 界面）、Merge 高风险确认对话框、Fork 入口 + 来源展示、作者/CRediT 编辑（仅作者组）
2. 响应式（移动端功能不裁剪，§2.5 决策 5）
3. WCAG AA（§18.3）
4. 文案 i18n 中英，中文优先（§2.5 决策 5）
5. 公开 RO 页 Issues/PR 标签属 P1D 公开页，本期仅登录态协作区域

## 现状约束

- lib/api.ts：现有 getResearchObject/updateSdf/listVersions/createCommit/getVersionDiff——需扩展协作 API client
- 三栏 EditorLayout + Drawer + MobileTabs：可复用移动端模式
- messages/zh.json + en.json：i18n
- 无协作页面路由

## 架构决策（拟）

### 路由（Q1）

- `/research-objects/[id]/collab`：协作区域单页（GitHub 式 tab）
  - Tab：Issues / Pull Requests / Branches / Fork / Authors / Notifications
  - 每 tab 内列表 + 详情抽屉（复用 Drawer 移动端模式）
- 桌面：三栏（列表 / 详情 / 操作面板）；移动端：单栏 + Drawer

### 页面结构（Q2）

单页 + tab 切换（client component）：
- `app/research-objects/[id]/collab/page.tsx`：入口，加载 RO + 挂 tab
- `components/collab/CollabTabs.tsx`：tab 导航（Issues/PR/Branches/Fork/Authors/Notifications）
- `components/collab/IssueList.tsx` + `IssueDetail.tsx`：列表/详情 + 评论 + 状态流转
- `components/collab/PrList.tsx` + `PrDetail.tsx`：声明表单 + diff 展示 + Review 界面 + Merge 高风险对话框
- `components/collab/ForkPanel.tsx`：Fork 入口 + 来源展示
- `components/collab/AuthorsPanel.tsx`：作者/CRediT 编辑（作者组才显示编辑按钮）
- `components/collab/NotificationsPanel.tsx`：通知中心 + 已读
- `components/collab/HighRiskDialog.tsx`：Merge 高风险确认（明示触发风险项）

### API client 扩展（Q3）

`lib/api.ts` 加：listIssues/createIssue/updateIssueStatus/createComment、listPrs/createPr/getPr/mergePr、listBranches/createBranch、forkRo/getForkSource、getAuthors/setAuthors/addContribution、listNotifications/markRead

### 权限显示（Q4）

- 作者/CRediT 编辑按钮：仅当当前用户是作者组成员（前端调 getAuthorChangeInfo 或 authors 列表判断）
- Merge 按钮：仅 owner/maintainer（前端不知角色——后端 403；前端显示错误即可，或 workspace 成员 API 给角色——**用既有 /workspaces 成员接口？** 简化：Merge 按钮常显，403 时提示）

### 移动端 + 可访问性（Q5）

- 复用 Drawer/MobileTabs 模式；移动端 tab 变下拉/横向滚动
- WCAG AA：aria-label、role=dialog、焦点管理（HighRiskDialog）
- 中文优先 i18n

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 路由形态？ | 单页 `/research-objects/[id]/collab` + tab（GitHub 式，含 Notifications） | 多路由（/issues /prs /authors——页面多，协作紧密需并排） |
| Q2 | 组件粒度？ | 每协作域一组件对（List/Detail），共享 Drawer | 巨型单组件（难维护） |
| Q3 | API client 扩展？ | `lib/api.ts` 加全部协作端点（复用 ``request<T>``） | 单独 collab-api.ts（分割） |
| Q4 | 权限显示？ | 作者编辑按钮按作者组判断；Merge 按钮常显后端 403 提示 | 前端拉 workspace 角色（额外 API） |
| Q5 | Merge 高风险对话框？ | 后端 409 返回 highRisk reasons → 前端 HighRiskDialog 明示 → confirmHighRisk 重试 | 前端预判风险（重复后端逻辑，风险漂移） |

---

## 测试策略

- **前端测试**（apps/web/test/）：
  - CollabTabs 渲染各 tab
  - HighRiskDialog：显示 reasons + confirm 回调（WCAG role=dialog + aria）
  - IssueList/PrList 渲染 + 空态
  - i18n 文案存在性（zh/en 键对齐）
- **next build** 通过（本地门禁）
- 云上：无新后端集成（API 已测），跑既有 84/84 确认不回退

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. 前端代码 + 测试
4. 本地门禁（next build + lint + 前端测试）
5. task-master 4.10 done + 文档同步
