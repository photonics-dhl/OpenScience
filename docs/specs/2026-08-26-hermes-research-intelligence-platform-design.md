# Hermes Research Intelligence Platform Design

> 状态：**CURRENT / REQUIREMENTS APPROVED / TASKS 1–3、5 DEPLOYED**
> 日期：2026-08-26
> 产品基线：`docs/OpenScience_Kimi_Development_Spec.md`
> 视觉基线：`docs/specs/2026-08-24-research-folio-product-system-design.md` 与 `docs/specs/2026-08-19-hermes-wanko-live2d-design.md`
> 参考原件：`docs/user_ideas/OpenScience_Prior_Art_Comparison_Matrix.xlsx`、`docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`、`docs/user_ideas/ultrafastscience_0125_research_object_demo (1).html`

## 1. Assumptions and fixed decisions

本设计建立在 2026-08-26 `/grill-me` 已逐项确认的约束上：

1. OpenScience 是 Web 平台；首要读者是判断研究能否信任、复用的研究者，同时服务作者与评审/编辑。
2. 注册时允许多选身份并指定主要身份；产品不显示“模式切换”，Hermes 根据身份、页面、当前任务和用户反馈静默路由。
3. 公开 RO 的中心不是文件列表或摘要，而是 3–7 个核心 Claim 及其子 Claim、证据、条件、限制和版本关系。
4. Hermes 可以自动搜索、下载、解析、OCR、比较并写入独立草稿分支；合并、发布、权限变更和删除始终需要批准。
5. LLM OCR 是平台自动处理能力，不逐文档询问。它必须经过 AI Gateway、最小页路由、来源标记与审计。
6. 服务器是纯 CPU，无本地 GPU 预算。不得安装依赖 GPU 的本地生图、生视频或重型推理栈。
7. 本地语义检索先采用 BGE-M3 类多语向量模型的 CPU 方案；词法检索始终保留，模型必须可替换。
8. 核心事务数据库与搜索数据逻辑分离；初期可共用 PostgreSQL 实例，但分别由 `DATABASE_URL` 与 `SEARCH_DATABASE_URL` 管理。
9. ScanSci 学校认证是平台能力。机构 PDF 默认只作临时缓存，TTL 72 小时；有权下载时使用 10 分钟签名链接，否则仅提供来源链接。
10. 富媒体是可版本化的展示草稿，不是证据。确定性 SVG/Mermaid/Plotly/HTML 可普遍使用；MiniMax 图像/视频仅管理员生成代表性成果。

若上述决定改变，必须先修改本文件，再修改实现和 Taskmaster。

## 2. Objective

构建一层可审计的 Research Intelligence：把论文、数据、代码、图表、实验条件与外部文献转化为可定位、可质疑、可复用的 Claim–Evidence 网络；Hermes 根据用户身份与当前目的，准确提取最相关的内容，并以 Research Folio 语言生成高质量公开 RO 阅读体验。

成功不以“生成了多少摘要”衡量，而以以下结果衡量：

- 读者能在 90 秒内理解 3–7 个核心结论、各自证据强度、条件、限制和争议。
- 每条论文文本证据可以回到原文件、页码与矩形区域；无法定位的生成文本不得作为证据。
- 数据、代码、环境、协议、图表和外部数据集都能成为一等 Evidence，而不是附件备注。
- Hermes 的兴趣相关性可由用户纠正，并可解释“为什么推荐给我”。
- PDF/OCR、搜索、向量化和外部 API 任一失败时，RO 仍能以降级结果继续工作，且失败状态可见。
- 新能力在上线、升级和退役时都有版本、授权、成本、资源、评测和回滚记录。

## 3. Core product narrative

OpenScience 的叙事是“从研究文件到可验证研究对象”：

1. **Collect**：接收论文、图表、数据、代码、补充材料与外部来源。
2. **Locate**：保留页面、区域、段落、表格、图、数据列、代码提交和环境的精确来源。
3. **Claim**：提取少量可理解的核心 Claim，并组织子 Claim。
4. **Test**：把支持、冲突、缺失与适用条件同时呈现。
5. **Reuse**：给出复现实验、引用、下载、运行和派生工作所需的材料。
6. **Evolve**：所有 Claim、Evidence 和展示资产均属于明确版本，可比较、质疑和修订。

Hermes 不是聊天挂件，而是贯穿 Collect → Locate → Claim → Test → Reuse 的研究助手。Wanko 视觉继续由现行 Hermes 视觉规范控制，本设计只定义它能做什么、何时出现和如何证明结果。

## 4. Personas and silent routing

### 4.1 Registration profile

注册新增 `ResearchIdentityProfile`：

```ts
export type ResearchIdentity =
  | 'reader'
  | 'author'
  | 'reviewer'
  | 'editor'
  | 'data_steward'
  | 'developer'
  | 'student';

export interface ResearchIdentityProfile {
  identities: ResearchIdentity[];
  primaryIdentity: ResearchIdentity;
  disciplines: string[];
  methods: string[];
  topics: string[];
  languages: string[];
}
```

身份可在 Settings 修改，但产品不提供显式运行模式开关。

### 4.2 Hermes routing context

Hermes 每次任务只使用一个可解释的 `InterestContext`：

```ts
export interface InterestContext {
  profileVersion: number;
  primaryIdentity: ResearchIdentity;
  currentGoal?: string;
  activeResearchObjectId?: string;
  activeClaimId?: string;
  acceptedSignals: string[];
  rejectedSignals: string[];
}
```

优先级为：用户当前明确目标 > 当前页面/Claim > 主要身份 > 持久兴趣 > 可纠正的历史行为。不得从敏感属性或站外跟踪推断兴趣。

## 5. Research Object semantic contract

### 5.1 Claim graph

每个发布版本包含 3–7 个 `core` Claim；一个核心 Claim 可以有 `supporting`、`method`、`boundary` 或 `counter` 子 Claim。禁止通过拆句制造大量同义 Claim。

```ts
export type ClaimKind = 'core' | 'supporting' | 'method' | 'boundary' | 'counter';
export type ClaimAssessment = 'supported' | 'partial' | 'disputed' | 'missing';

export interface ClaimNode {
  id: string;
  researchObjectId: string;
  versionId: string;
  parentClaimId?: string;
  kind: ClaimKind;
  statement: string;
  assessment: ClaimAssessment;
  conditions: string[];
  limitations: string[];
  evidenceIds: string[];
  counterEvidenceIds: string[];
  provenance: ExtractionProvenance;
}
```

`supported` 不是平台质量评分，只表示当前版本中存在可定位的支持材料；`partial`、`disputed`、`missing` 必须保留在公开阅读中。

### 5.2 Evidence and source locator

一等 Evidence 类型包括：

- 论文原文段落、表格、图及图注；
- 原始或处理后数据及具体列/行/变量；
- 代码仓库、commit、文件、行范围与运行输出；
- Notebook、软件与环境清单；
- 实验/分析协议与参数；
- 补充材料；
- 外部论文、数据集与标准。

```ts
export type EvidenceKind =
  | 'passage'
  | 'figure'
  | 'table'
  | 'dataset'
  | 'code'
  | 'notebook'
  | 'environment'
  | 'protocol'
  | 'supplement'
  | 'external_source';

export interface SourceLocator {
  artifactId: string;
  contentHash: string;
  page?: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
  charRange?: { start: number; end: number };
  tableCell?: { sheet?: string; row: number; column: number };
  codeRange?: { commit: string; path: string; startLine: number; endLine: number };
}

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  title: string;
  exactQuote?: string;
  locator: SourceLocator;
  relation: 'supports' | 'contradicts' | 'qualifies' | 'context';
  extractionConfidence?: number;
  verifiedByUserId?: string;
}
```

LLM 生成的释义只能作为说明文字；只有能由确定性 locator 回到原始内容的 `exactQuote` 才能作为引文。

### 5.3 Publish blockers

以下状态硬阻断发布：

- 引文与 locator 对不上；
- 原文件或内容哈希不存在；
- 已知冲突被隐藏；
- 生成图片、生成视频或生成 HTML 被标为 Evidence；
- 机构下载材料的授权状态未知却提供可下载副本；
- 自动提取覆盖了作者已确认内容而未产生可审阅 diff。

证据缺失本身不硬阻断，但必须以 `missing` 公开披露。

## 6. Public RO presentation

### 6.1 Reading order

公开页沿用 760px 阅读列 + 280px 证据 rail，并按以下顺序呈现：

1. 标题、作者、版本、许可、引用；
2. 一句话研究对象定位；
3. 3–7 个核心 Claim 概览；
4. 当前 Claim 的证据、反证、条件和限制；
5. 方法、数据、代码、环境与复用入口；
6. 版本变化、审阅与 provenance；
7. 展示资产。

Evidence 默认展开；用户可将“默认折叠 Evidence”保存为个人阅读偏好。折叠状态不得影响搜索索引、打印、导出和辅助技术可见性。

### 6.2 Evidence interaction

选择证据时应在同一阅读上下文显示原文、页码、区域缩略图和来源；桌面使用 rail，移动端使用底部 sheet。示例 HTML 的 Claim/Evidence/conditions/limitations 层级作为语义参考，不复制其视觉。

### 6.3 Rich media

```ts
export type PresentationAssetKind = 'svg' | 'chart' | 'interactive_html' | 'image' | 'video';

export interface PresentationAsset {
  id: string;
  researchObjectId: string;
  versionId: string;
  kind: PresentationAssetKind;
  sourceClaimIds: string[];
  generator: string;
  generatorVersion: string;
  promptHash?: string;
  status: 'draft' | 'approved' | 'rejected';
  label: 'presentation_not_evidence';
}
```

首批只实现 Claim/Evidence 交互 HTML 与由真实数据生成的图表；MiniMax 图像随后由管理员生成代表性成果；视频最后实施。

## 7. Document intelligence pipeline

### 7.1 Unified source map

所有 parser 必须输出同一个 `DocumentSourceMap`，上游不得依赖 Docling、LiteParse、GROBID 或 OCR 的私有格式：

```ts
export interface DocumentSourceMap {
  artifactId: string;
  contentHash: string;
  parser: { name: string; version: string; modelHash?: string };
  pages: Array<{
    page: number;
    width: number;
    height: number;
    blocks: Array<{
      id: string;
      kind: 'heading' | 'paragraph' | 'figure' | 'table' | 'equation' | 'caption' | 'reference';
      text?: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      confidence?: number;
    }>;
  }>;
}
```

### 7.2 CPU cascade

固定执行顺序：

1. PDF text layer、Markdown、TeX、DOCX 和表格的确定性快速路径；
2. Docling 与 LiteParse 在标准语料评测后只保留一个主 layout parser；
3. GROBID 专门负责文献元数据、章节和参考文献；
4. Tesseract 或 PaddleOCR 负责低置信度扫描页；
5. 仅将仍然低置信度、公式/复杂表格或布局失败的最少页面送入 MiniMax LLM OCR；
6. 合并 source map，保留每个 block 的 parser、版本、置信度与变换历史；
7. 关键 locator 无法复验时进入人工复核。

LLM OCR 输出不能覆盖原 block；它作为候选层与原图坐标一起保存。

#### 7.2.1 Parser acceptance debt closeout

2026-08-29 的 16-case 生产验收后续必须从 `10 succeeded / 6
needs_review` 收口为 `14 succeeded / 2 intentional needs_review / 0 failed /
0 false-ready`。这不是把所有状态机械改成成功，而是按输入语义关闭四个
actionable gap，并永久保留两个 fail-closed 控制：

- `.py` 使用严格 UTF-8、逐行、限长的虚拟页确定性解析；`.ipynb` 只接受
  有界且结构合法的 Notebook JSON，提取 markdown/code/raw cell 的 `source`，
  不执行代码、不加载 output、不调用外部 parser/provider。存在非空 output、
  attachment、未知 cell type、MIME 冲突或任一格式预算超限时不得静默成功。
- CSV/XLSX 只有在受支持结构完整落入 source map 时才能成功。单元格 block
  使用既有 `table` kind；row/column/sheet、virtual bbox 与正式
  `createTableCellSourceLocator` → `resolveSourceLocator` 必须一致。公式、合并
  单元格、错误 cell type、损坏关系、ZIP/XML 扩展风险或解析 warning 进入
  `needs_review`/`blocked`，不能以 cached value 冒充完整 workbook。
- 故意损坏的 PDF 保持 `needs_review: unreadable-or-corrupt-document`；无有意义
  内容的空白 PNG 保持 `needs_review: no-meaningful-content`。二者是正确的产品
  状态，不是待消除的自动成功率缺口。
- Production 与 acceptance 共用一个 extension/MIME 规范化函数；冲突 MIME
  fail closed。不得扩展 `DocumentBlockKind`，Notebook/Python 使用既有
  `paragraph`，结构表格使用既有 `table`，避免无必要改变 Domain、sidecar、
  检索和消费方合同。
- 正式验收报告升级为 schema v3，并绑定 acceptance profile、manifest hash、
  `14` 次 structured fake、每个 intentional review 的稳定安全原因码、全部
  locator 的正式 round-trip 和零 external provider call。旧 v2 报告不能为新
  release 提供部署授权。

上述目标只能表述为“当前 16-case 中六个 actionable acceptance gap 已收口”。
它不声称支持任意现实 Notebook output、Excel 公式/宏/合并单元格；这些超出
明确子集的输入必须可解释地复核，不能静默丢失。

### 7.3 External retrieval and temporary documents

- Semantic Scholar：论文元数据、引用关系与开放获取链接。
- Tavily：通用网页发现和来源补充，不作为学术权威本身。
- ScanSci PDF：在合法来源与学校认证范围内获得全文。
- 下载文件进入受控对象存储缓存，默认 72 小时清理；永久保存内容哈希、来源 URL、rights decision、parser provenance 与已引用 locator。
- 有再分发或用户本人访问权时生成 10 分钟签名下载链接；否则只返回来源链接。

## 8. Semantic retrieval

### 8.1 Architecture

`packages/search` 是业务代码的唯一检索入口；API、Domain 和 Worker 不得直接导入模型 SDK。

检索采用 hybrid pipeline：

1. PostgreSQL FTS/BM25 类词法候选；
2. CPU BGE-M3 类 dense embedding，首期只启用 dense；
3. 512–1024 token 语义 chunk，保留 artifact/page/bbox/claim locator；
4. reciprocal-rank fusion；
5. 可选的 top-N reranker，只在 CPU 基准达标后启用；
6. sparse 与 multi-vector 保留为实验开关，不进入首期发布合同。

### 8.2 Storage separation

- `DATABASE_URL`：用户、Workspace、RO、版本、Claim、Evidence、审批、发布与审计。
- `SEARCH_DATABASE_URL`：chunk、embedding、索引任务、模型版本和检索遥测。
- 二者初期可以指向同一 PostgreSQL 服务器的不同数据库或 schema，但迁移、备份、连接池和健康检查独立。
- PDF、图片、视频、模型权重和导出物不得存入 PostgreSQL。
- 迁移采用 expand–backfill–dual-read/dual-write–cutover–contract；不得让产品发布依赖单次不可逆大迁移。

## 9. Hermes authority and audit

| Action | Default authority | Required evidence |
|---|---|---|
| Search metadata/web | Automatic | provider, query hash, timestamp |
| Download legally accessible source | Automatic | URL, rights decision, TTL |
| Parse/OCR/embed/compare | Automatic | tool/model version, input hash, locator |
| Create Claim/Evidence proposal | Automatic draft branch | before/after diff, provenance |
| Generate deterministic chart/HTML | Automatic draft | source data/claim IDs, generator version |
| MiniMax image/video | Admin only | cost, prompt hash, source claims, approval |
| Merge into author branch | Approval required | diff and approver |
| Publish or change visibility | Approval required | publish preflight and approver |
| Change permission or delete | Approval required | explicit target and audit event |

每个异步步骤必须支持 `queued/running/succeeded/needs_review/blocked/failed/cancelled`，显示真实 provider、阶段和重试状态，不使用伪进度。

## 10. Capability lifecycle and installation boundary

唯一能力台账为 `docs/runbooks/hermes-capability-registry.md`。新增、升级、禁用或退役 Skill、MCP、模型、parser 和外部 provider 时必须同一提交更新台账。

安装边界：

- 项目代码与 lockfile 留在仓库；禁止全局 npm/pip 安装。
- Python 评测使用项目 `.venv`/`uvx`，生产使用固定 digest 的独立容器镜像。
- 模型权重进入版本化只读 Docker volume；不得放入仓库、用户 HOME、`/usr/local` 或应用源码目录。
- 临时 PDF/OCR 页面进入独立有配额 volume/object-storage prefix；不得写入应用容器 rootfs。
- Secret 只通过本地未跟踪 env 或生产 Secret 注入；文档只记录变量名和“已注入/未注入/待轮换”，不记录值。
- 每项能力都必须有 owner、license、版本、CPU/内存、延迟、成本、数据去向、评测结果、kill switch 和 rollback。

保留门禁使用真实双语科研语料，记录 Claim 准确性、证据 locator 命中率、引用/表格/公式质量、兴趣相关性、P50/P95 延迟、CPU 峰值、内存峰值、单任务成本、失败率和安全问题。未优于现有基线或无法回滚的候选不得进入用户流量。

## 11. Commands

设计阶段不得安装或部署。实现阶段使用以下固定命令：

```powershell
npx pnpm@9.15.0 test
npx pnpm@9.15.0 typecheck
npx pnpm@9.15.0 lint
npx pnpm@9.15.0 build
npx pnpm@9.15.0 audit:docs-sync
npx pnpm@9.15.0 docs:lint
git diff --check
```

Windows 服务器只读/部署操作必须显式使用 Git Bash：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh '<read-only command>'
```

任何生产安装或部署仍遵循 `docs/runbooks/deployment.md` 的确认与验收要求。

## 12. Project structure

预期职责边界如下；实施计划可以拆分文件，但不能跨越这些 owner：

| Area | Canonical owner |
|---|---|
| Claim/Evidence/interest domain | `packages/domain/src/` |
| Prisma schema and migrations | `infra/schema.prisma`, `infra/migrations/` |
| Search interface and fusion | `packages/search/src/` |
| Provider/model routing and cost logs | `packages/ai-gateway/src/` |
| Parser/OCR/embedding jobs | `apps/agent-worker/src/` and isolated worker images |
| HTTP contracts | `apps/api/src/routes/` |
| Public RO and Hermes review UI | `apps/web/app/`, `apps/web/components/` |
| CPU services, volumes and health | `infra/compose/` |
| Capability inventory and operations | `docs/runbooks/hermes-capability-registry.md` |

## 13. Code style

跨进程数据使用显式 discriminated union，未知 provider 字段不能穿透 Domain：

```ts
export type ExtractionResult =
  | { status: 'succeeded'; sourceMap: DocumentSourceMap; warnings: string[] }
  | { status: 'needs_review'; sourceMap: DocumentSourceMap; reasons: string[] }
  | { status: 'blocked'; code: 'rights_unknown' | 'malware' | 'limit_exceeded'; message: string }
  | { status: 'failed'; retryable: boolean; provider: string; message: string };
```

不要以 `any`、隐式 JSON blob 或 provider-specific payload 代替领域合同；所有自动建议都通过不可变 proposal/diff 写入。

## 14. Testing strategy

### 14.1 Golden corpus

建立不含隐私和授权争议的双语科研语料：native PDF、扫描 PDF、双栏、表格、公式、参考文献、图片、DOCX、TeX、Markdown、CSV/XLSX、Notebook 和代码仓库。每个 fixture 固定内容哈希与期望 locator。

### 14.2 Test layers

- Domain unit：Claim 图约束、assessment、interest routing、rights decision、TTL。
- Parser contract：各 parser → `DocumentSourceMap`，页码/bbox/quote round-trip。
- Search integration：词法+dense fusion、模型版本隔离、`SEARCH_DATABASE_URL` 故障降级。
- API integration：身份 profile、Claim/Evidence、审批、签名链接与权限矩阵。
- Worker isolation：无不必要网络/Secret、只读、非 root、CPU/内存/PID/volume 限额。
- Web unit/E2E：Claim-first 公开页、Evidence 默认展开与持久折叠、移动 sheet、键盘与 WCAG AA。
- Production acceptance：服务器全量 build、迁移状态、容器/模型 digest、运行依赖、内部/公网健康、代表性真实 RO journey。

### 14.3 Release thresholds

- 引文 locator round-trip：100%。
- 核心 Claim 人工抽检 precision：≥ 0.90；低于阈值只能作为内部草稿。
- 证据关系人工抽检 precision：≥ 0.90。
- Evidence 页面/bbox 命中率：≥ 0.95；无法定位必须 `needs_review`。
- 搜索 P95：CPU 基线语料 ≤ 2.5 秒；峰值内存必须在目标容器限额内。
- 临时文件 TTL 与签名链接过期：100% 自动测试通过。
- 任一 provider 不可用时，词法检索、原文件阅读和手工编辑仍可用。

## 15. Boundaries

### Always do

- 保留原文件哈希、来源、parser/model 版本、locator 与自动修改 diff。
- 展示支持、反驳、限定和缺失，不生成单一不透明“可信分”。
- 自动选择最便宜、最确定、最少数据外发的处理层。
- 使用项目级或容器化安装，记录 capability lifecycle。

### Approval required

- 合并 Hermes 草稿、公开发布、变更可见性/权限、删除数据。
- 管理员调用 MiniMax 生图/生视频并选择代表性公开成果。
- 任何云上安装、Secret 轮换、数据库迁移或部署。

### Never do

- 把 LLM 生成文本、图像、HTML 或视频冒充原始 Evidence。
- 隐藏冲突或伪造/无法定位的引文。
- 绕过付费墙、许可或学校认证范围；把机构文件默认永久保存或公开分发。
- 在纯 CPU 服务器安装本地 GPU 生成栈。
- 读取、打印、提交或在文档中保存 `.env` 值与真实 key。
- 让 `apps/api`、`packages/domain` 或 Web 直接依赖具体向量模型/provider SDK。

## 16. Phased acceptance

1. **Foundation**：能力台账、Claim/Evidence/locator 合同、搜索边界、数据库分离与 golden corpus。
2. **Document intelligence**：CPU parser cascade、LLM OCR fallback、临时 PDF lifecycle 和 source map。
3. **Retrieval and interest**：BGE-M3 dense + lexical fusion、身份 profile、当前目标与可纠正学习。
4. **RO experience**：Claim-first 公开页、默认展开 Evidence、conditions/limitations、版本与复用入口。
5. **Presentation**：确定性图表/HTML；管理员 MiniMax 图像；最后评估视频。
6. **Platform hardening**：真实流量 canary、成本/资源/安全门禁、独立搜索数据库迁移演练、生产验收。

每一阶段都必须能独立回滚，且不能以视觉完成替代证据正确性验收。

### 16.1 Current implementation checkpoint

- Taskmaster `hermes-research-intelligence` 已完成 Task 1–6（6/12）；Task 4 CPU parser cascade 已生产部署，Tasks 7、10 dependency-ready。
- Task 1 已交付能力台账机器门禁、13-case 自著权 corpus 与 current-parser baseline；没有安装新 parser、OCR、模型或 MCP。
- Task 2 已交付 Claim/Evidence/locator 严格合同、发布事务门禁、核心 migration 28、独立 `packages/search`/`infra/search` 与 `SEARCH_DATABASE_URL` 边界，并随 ECS release `e0828a6` 部署。
- Task 3 已在 application/immutable release `ef043ebb8e51332effe75a5639cb207aec7bfc47` 部署：严格 provider-neutral DocumentSourceMap、跨 artifact/hash/versioned map 的 locator 拒绝与 worker 运行时合同；其实现树父提交 `c47b3f182ba857897c3c33ee21c250f6b4db3f3c` 已审阅，`ef043eb` 是同树的空 CI 标记。回滚为 `e0828a6118c92c87b7869493413441bba0e76a95`。
- Task 4 已在 application/immutable release `c5817121bddbd065c5ecb38811da8e707e6e5d17` 部署：V2 隔离 parser、确定性多格式解析、provider-neutral enrichment、本地 Tesseract 选页 OCR、受控 LLM OCR candidate 与真实 `sdf.extract` 级联。ECS 16-case 为 10 succeeded / 6 needs_review / 0 failed / 0 false-ready，P50/P95 `151.9/1255.32 ms`；rollback 为 `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`。
- Task 5 已在 application/immutable release `f9659668b237b70b4c018b866e20498689d327c2` 部署：独立 OCR provider pool、最少页与图片结构/尺寸/字节硬边界、严格 external-processing/kill policies、逐页 fallback、candidate-only provenance 和脱敏 cost/latency audit。Vision 默认 disabled，未做付费调用；rollback 为 `ef043ebb8e51332effe75a5639cb207aec7bfc47`。
- Task 6 已在 application/immutable release `8163f8b4218e529ee4be41bb9fc732ff6497931a` 部署：独立 search migration 2、locator-safe chunks、tenant-safe lexical+dense retrieval、RRF、幂等异步索引、显式 `lexical_only` 降级和 CPU-only BGE-M3。rollback 为 `f9659668b237b70b4c018b866e20498689d327c2`。
- BGE-M3 锁定 revision `5617a9f61b028005a4858fdac845db406aefb181`、model manifest `08cc5a668e899e216e8ce66e7f3a5e144cefd9600a082997483c5dd0c66478e4`、package freeze `dc2bc38e5ddda73889d15265eac0cdfa8eaaebe311bc2e63a9b2e32e19cd0fc3`；16 chunks/24 queries 的 nDCG@10 `0.996655`、Recall@10 `1`、P95 `240 ms`、peak RSS `2,244,235,264` bytes，GPU package 0。
- 生产 core 当前仓库迁移 `29/29`、search `2/2`；core active ledger 含需保留的历史兼容记录，failed migration 为 0。core/search 连接、迁移、物理隔离与健康探针独立。
- 每日 `backup.sh --db` 已原子覆盖 core/search；集合校验和、release 绑定、权限和双临时库恢复演练通过，§8.2 的双库备份边界闭合。当前保留 7 组备份，临时恢复库已按授权精确清理。

## 17. Out of scope

- 本阶段不重做 Landing 或现行 Wanko 视觉。
- 不建立用户可见的 Hermes 模式切换。
- 不承诺绕过出版商访问控制或替用户判断版权。
- 不在首期启用 BGE-M3 multi-vector、GPU reranker、本地生图或本地生视频。
- Task 1–2 不安装 parser、OCR、向量模型或第三方检索能力；这些能力按后续 Task 的 corpus 评测与 ECS-only 发布门逐项启用。
