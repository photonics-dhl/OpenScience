# P1D-9 公开 RO 页面与必显信息 — Design Gate

- 日期：2026-08-04
- 任务：task-master 5.9（公开页 + §4.3 必显 + SSR + 可见性控制）
- 依据：Spec §2.5-5、§4.2、§4.3、§6.1、§6.2、§18.2/§18.3
- 现状：P1B-6 /research 公开 URL 骨架（publicId + 版本）；P1C 协作数据（Issues/PRs/Reviews/Authors）；P1D-5/6 AI 审核（hardBlocks/warnings）；P1D-8 发布（Publication/Identifier/parentVersion）

---

## 需求基线

1. 公众可访问公开 RO 页面，严肃学术排版（§18.2）
2. 必显：标题、作者与身份状态、机构声明、摘要、许可、unique ID、版本 ID、发布时间、版本哈希、引用格式、AI 审核摘要、平台法律免责声明（§4.3）
3. 十标签：Overview/Manuscript/Methods & Experiments/Data & Code/Figures & Visualization/Versions & Diff/Issues/Pull Requests/Reviews & Discussions/Citations & Related Work（§4.3）
4. 页面含 §6.2 固定声明文案
5. public 公众可访问可索引；private/invite_only 拒绝未授权（§4.2）
6. SSR/缓存 + WCAG AA + 移动端一致（§18.3/§2.5-5）
7. URL /research/OSR-YYYY-NNNNNN/v/N（§6.1）

## 架构决策（拟）

### 公开页数据 API（Q1，扩展 P1B-6 /research）

- `GET /research/:publicId`：RO 概览（标题/unique ID/最新版本号/可见性）
- `GET /research/:publicId/v/:versionNo`：**完整公开页数据**：
  - 必显：title/publicId/publicVersionId/publishedAt/contentSha256/legalDisclaimer
  - core（§5.1 六字段，Abstract=problem 摘要）
  - licenses（§6.3 三类）
  - authors（§3.4 名单 + 通讯 + 身份状态）+ contributions（CRediT）
  - aiReview（P1D-5/6 hardBlocks/warnings —— 审核摘要）
  - citation（引用格式：作者+标题+OSR ID+年份）
- 可见性：仅 public 返回；private/invite_only → 404（§4.2 + §17 不泄露）
- 数据来自 DB 聚合（RO + Version + Manifest + Publication + LicenseAssignment + Author + Contribution + AiReview）

### 公开页路由（Q2，apps/web）

- `/research/[publicId]`：RO 概览（最新版本）
- `/research/[publicId]/v/[versionNo]`：版本详情（十标签）
- **SSR**（server component，不 'use client'）——直接 fetch /api 或 DB？——**fetch /research API**（同源反代，复用 lib/api）
- 十标签：tabs 展示（Overview 默认，其余数据就绪的渲染，未就绪占位）

### 标签数据（Q3）

| 标签 | 数据源 | 本期 |
|---|---|---|
| Overview | title/authors/abstract/licenses/citation | ✅ |
| Manuscript | core 全文（§5.1） | ✅ |
| Methods & Experiments | core.method | ✅ |
| Data & Code | manifest entries（artifact 逻辑路径） | ✅ |
| Figures & Visualization | manifest entries（图片类）+ 占位 | ✅ |
| Versions & Diff | 版本列表 + diff（P1B-5） | ✅ |
| Issues | P1C-3 公开读（public 可读） | ✅ |
| Pull Requests | P1C-6 公开读 | ✅ |
| Reviews & Discussions | P1C-8 reviews 公开读 + comments | ✅ |
| Citations & Related Work | 引用格式 + 占位 | ⚠️ 占位 |

### 可见性 + 安全（Q4）

- 后端 /research 已校验 visibility=public（P1B-6）
- 前端 SSR fetch 后端；private → 404 → 前端 notFound
- 搜索引擎可索引：SSR HTML 含 meta + 必显内容（非 client 渲染）

### 免责声明（Q5）

- §6.2 固定文案：页面页脚 + publication.legalDisclaimer 展示
- §24 服务条款/隐私政策待确认 → 占位链接

---

## 5 Open Questions

| # | 问题 | 我的推荐 | 备选 |
|---|------|---------|------|
| Q1 | 公开页数据 API？ | 扩展 /research/:publicId/v/:versionNo 返回完整必显数据（DB 聚合） | 独立 /public 端点（多一跳） |
| Q2 | 渲染方式？ | SSR server component（fetch /research，public 可索引） | client 渲染（SEO 差，§4.3 索引违） |
| Q3 | 标签数据完整度？ | 已就绪标签渲染真实数据；Citations/Figures 占位（登记） | 全部占位（验收必显缺失） |
| Q4 | 越权控制？ | 后端 visibility=public 校验（404 不泄露）+ 前端 notFound | 前端判断（后端可绕过） |
| Q5 | 免责声明？ | §6.2 固定文案页面页脚 + publication.legalDisclaimer；§24 占位 | 无（§4.3 必显缺失） |

---

## 测试策略

- **合同测试**（前端）：公开页数据 Schema（必显字段齐全）
- **集成测试**（云上）：发布 public RO → 未登录 GET /research/:publicId/v/N 返回全部必显信息；private RO → 404
- **前端**：next build + SSR 渲染测试（组件纯逻辑）
- 既有 99/99 不回退

---

## 涉及模块

- `apps/api/src/routes/research.ts`：扩展版本详情（必显数据聚合）
- `apps/web/app/research/[publicId]/page.tsx` + `/v/[versionNo]/page.tsx`（SSR）+ 组件
- `apps/web/lib/api.ts`：getPublicResearchVersion
- 无迁移

## 交付物

1. 本 design gate 确认（5 决策）
2. plan 文档
3. API 扩展 + 前端 SSR 页 + 测试
4. 本地门禁（next build）
5. 云上集成测试全绿
6. task-master 5.9 done + 文档同步
