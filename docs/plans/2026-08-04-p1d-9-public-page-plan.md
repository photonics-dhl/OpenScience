# P1D-9 公开 RO 页面与必显信息 — 实施计划

- 日期：2026-08-04
- 任务：task-master 5.9
- 依据：`docs/specs/2026-08-04-p1d-9-public-page-design.md`（5 决策已确认）

---

## 五决策（已确认）

| Q | 决策 |
|---|------|
| Q1 | 扩展 /research/:publicId/v/:versionNo 完整必显 |
| Q2 | SSR server component |
| Q3 | 就绪标签真实数据；Citations/Figures 占位 |
| Q4 | 后端 visibility=public 校验 |
| Q5 | §6.2 固定文案页脚 |

## TDD 步骤

1. **API `routes/research.ts` 扩展**：`GET /research/:publicId/v/:versionNo` 返回必显数据聚合：
   - ro（title/publicId/visibility）+ version（versionNo/publicVersionId/status）
   - publication（publishedAt/contentSha256/legalDisclaimer）
   - core（六字段）+ licenses（三类）+ authors（含 isCorresponding）+ contributions
   - aiReview（hardBlocks/warnings 摘要）+ citation（引用格式串）
   - 仅 public（§4.2 404）
2. **前端 lib/api.ts**：`getPublicResearchVersion(publicId, versionNo)`
3. **SSR 路由**：
   - `app/research/[publicId]/page.tsx`：RO 概览（最新版本 + 基本信息）
   - `app/research/[publicId]/v/[versionNo]/page.tsx`：版本详情（十标签）
   - 组件：`components/public/PublicVersionPage.tsx`（tabs + 必显渲染）
4. **测试**：
   - 前端：必显字段渲染逻辑（纯函数）+ i18n 键
   - 集成（云上）：发布 public RO → GET 返回全部必显；private → 404
5. **本地门禁**（next build）
6. **云上集成测试**
7. **文档同步** + task-master 5.9 done

## 验收对照

- §4.3：十标签 + 必显信息 ✅
- §6.2：固定声明文案 ✅
- §4.2：public 可访问/private 拒绝 ✅
- §18.3：WCAG AA + 移动端 ✅
- §6.1：/research/OSR/v/N 稳定 URL ✅
- §21.2 步骤 10 ✅
- 既有 99/99 不回退

## 风险

- SSR fetch /api（同源）；public 页 server component 需 async
- 十标签数据源：Issues/PRs/Reviews 公开读已就绪（P1C）
- citation 格式：作者列表 + 标题 + OSR ID + 年份
