# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-26 22:26 +08。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## 2026-08-26 — Research Intelligence Task 2 已部署

- Taskmaster CURRENT tag `hermes-research-intelligence`：Task 1–2 已完成，Task 3 `DocumentSourceMap Contract and Parser Interfaces` 已进入 `in-progress`；实施入口为 `docs/plans/2026-08-26-hermes-document-source-map-contract-plan.md`。
- 核心领域合同已实现：ResearchIdentity/Profile、Claim、Evidence、PresentationAsset、严格 locator 与 ExtractionResult；Claim graph 要求每个公开 Version 有 3–7 个核心 Claim、同 RO/version、无环，发布校验与状态切换位于同一 Serializable 事务。
- 核心迁移 28 新增 `ResearchIdentityProfile`、`ClaimNode`、`EvidenceRecord`、`PresentationAsset` 与关联表；只保存元数据、哈希、locator 与对象键，不保存 PDF/图片/视频字节。
- `packages/search`、`infra/search/schema.prisma`、独立迁移账本和 `SEARCH_DATABASE_URL` 已建立；core/search URL 物理隔离门禁和迁移链已接入部署，API/domain 不直接依赖搜索 client。
- ECS disposable PostgreSQL 已完成 core/search migrate → rollback → reapply：core `28`、5 张新表、9 个 scoped constraints；search `1`，临时数据库随后清理。没有使用本机 Docker。
- 生产已创建独立 `openscience_search` 数据库并以不输出值的方式写入 Secret 配置；`.env.prod` 权限保持 `600`，回退副本为 `.env.prod.pre-search-e0828a6`。
- 生产 exact release `e0828a6118c92c87b7869493413441bba0e76a95` 已部署，rollback `29344767b350e0a44ef74c04b9b5a55b342ef011`。服务器全量 workspace/19-page build、core current `28/28`、search `1/1`、目标容器、Parser 隔离、loopback/public 与 release markers 全绿。
- core 生产 ledger 有 29 条 active 记录，其中 28 条与当前仓库一致，额外一条是保留的历史 `20260809010000_ro_create_idempotency`；没有 failed migration，不删除或伪造该历史记录。
- 部署前备份 `436K files=7/7`。canonical deploy 仅运行既有幂等 quota seed `8/8`，没有 research-data seed 或真实研究数据写入。
- PR #4 exact SHA `e0828a6` 的 CI run `32977425693` 全绿：build、typecheck、lint、unit、product visual 与 Hermes release gate。该 SHA 还修复 WebGL context-loss 时恢复按钮被反馈态 CSS 隐藏的无障碍回归；未改变 Landing/Hermes 构图。

## 2026-08-26 — Research Intelligence Task 1 Foundation

- 21 行能力主表、11 行候选评测矩阵和 `audit:hermes-capabilities` 已落库；Docling、LiteParse、GROBID、PaddleOCR、BGE-M3 保持 `APPROVED_PILOT`，MiniMax OCR 保持 `BLOCKED`。
- 13 项自著权 deterministic corpus 覆盖 native/scanned/dual-column PDF、table、formula、references、DOCX、TeX、Markdown、CSV/XLSX、notebook 与 code，不使用用户文件。
- current-parser 基线为 7 项 `ready`、6 项 expected-text matched、6 项显式复核；image-only PDF 的 false-ready 已记录为 Task 3 候选必须消除的缺陷。
- 尚未安装或部署 OCR、BGE-M3、ScanSci、Tavily、Semantic Scholar 或新模型能力；Task 2 只建立数据合同与独立存储边界。

## Current version tuple

- Branch / planning base HEAD: `codex/hermes-wanko-live2d` / `6120c3cc1db1ff364879d36adfb68e4045ca4189`。
- Deployed application / immutable release / rollback: `e0828a6118c92c87b7869493413441bba0e76a95` / `e0828a6118c92c87b7869493413441bba0e76a95` / `29344767b350e0a44ef74c04b9b5a55b342ef011`。
- Local main / origin main: `b9616cb92dc83437b1b2094291ff43e2a4c34337` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`；二者均不能代替 CURRENT handoff 判断现状。
- 后续 docs-only commit 不改变已部署 application/release 身份。

## Constraints and open risk

- 所有 Docker、数据库迁移、镜像构建和生产验收只在 ECS 执行；Windows 远程操作必须由 PowerShell 显式调用 Git for Windows Bash，再走 canonical scripts。
- Landing/Hermes 视觉冻结；Task 2 只含一次 context-loss 恢复控件可访问性修复。
- 每日 `backup.sh --db` 目前只覆盖 core 数据库；search baseline 当前无派生业务数据，但在 Task 6 写入搜索数据或接受真实流量前，必须补齐独立 search backup + restore 演练。
- 不读取、打印或提交 `.env` 值；不安装 GPU 栈；不把生成内容冒充 Evidence。

## Next action

1. 按 CURRENT Task 3 plan 实施严格 DocumentSourceMap、parser interface、locator round-trip 与 image-only PDF false-ready 门禁；CPU parser cascade 仍属于 Task 4。
2. 所有容器/解析 runtime 与最终验收只在 ECS。
3. 在搜索库开始承载可重建之外的数据前，补独立 search backup/restore gate。
