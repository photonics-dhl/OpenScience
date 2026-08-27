# Hermes Capability Registry

> 状态：**CURRENT**
> 最后核验：2026-08-28
> 设计真源：`docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
> 安全原则：只记录变量名与注入状态，禁止记录、读取或输出真实 key/token/cookie。

## 1. Purpose

本台账防止 Hermes 能力在后续迭代中被重复安装、遗忘、误判或污染服务器。新增、升级、启用、停用、替换或删除任何 Skill、MCP、模型、parser、provider 或运行容器时，必须同步本文件与 `project_index.md`。

状态定义：

- `PRODUCTION`：生产已运行并有验收证据。
- `AVAILABLE_LOCAL`：本机已挂载或可调用，不代表生产可用。
- `APPROVED_PILOT`：用户已批准评测/安装，尚未进入生产。
- `BLOCKED`：存在凭据、额度、授权、安全或性能阻断。
- `PATTERN_ONLY`：只参考工作流，不复制或安装。
- `REJECTED`：已明确不适用于当前基础设施。

## 2. Capability table

| Capability | Purpose | Current state | Auth/cost policy | Runtime/install boundary | Retention gate |
|---|---|---|---|---|---|
| Existing `document-parser` sidecar | PDF/DOCX/OCR isolation | `PRODUCTION` | 无外部 API | 固定容器；无网络/Secret、只读、非 root、512 MiB/64 PID、bounded IPC | isolation/self-test、hash fixture、失败显式复核 |
| Tesseract `eng+chi_sim` | 扫描页 OCR fallback | `PRODUCTION` | 免费、本地 CPU | 仅 parser 镜像；禁止宿主全局安装 | 双语字符质量、page/bbox round-trip、CPU/内存 |
| ClamAV | 上传文件恶意内容扫描 | `PRODUCTION` | 免费、本地 CPU | agent-worker/隔离边界；fail-closed | signature freshness、blocked path、资源峰值 |
| MiniMax text/vision | LLM OCR、复杂表格/公式补救 | `APPROVED_PILOT / BLOCKED` | 自动平台处理；最少页；凭据已在聊天暴露，轮换前不得调用 vision | 仅 AI Gateway；`openscience-ocr-v1` route 已实现但默认 disabled + external-policy deny；生产 worker 当前有变量注入，文档不记录值 | locator 复验、页成本、数据外发、错误率、审计 |
| MiniMax image/video | 代表性 RO 展示资产 | `APPROVED_PILOT / BLOCKED` | 仅管理员；逐项批准公开；凭据轮换前阻断 | 外部 API，经 AI Gateway；不在 CPU 服务器部署模型 | 科学真实性、成本、prompt/source provenance、可撤回 |
| Tavily MCP/API | 通用网页发现 | `AVAILABLE_LOCAL / BLOCKED` | 本机变量已注入但当前额度耗尽；生产未注入 | 项目 MCP 或 AI Gateway adapter；不得成为唯一来源 | source precision、quota/cost、降级、隐私 |
| Semantic Scholar MCP/API | 论文、作者、引用关系 | `AVAILABLE_LOCAL / BLOCKED` | MCP 已挂载但请求限流；常用变量未进入本机进程或生产 worker；凭据已暴露需轮换 | 项目 MCP/adapter；不把 provider schema 泄漏到 Domain | metadata accuracy、rate limit、OA URL、cache policy |
| ScanSci PDF | 合法全文发现/下载 | `APPROVED_PILOT` | 学校认证作为平台 Secret；必须遵守来源权限 | 独立受控 adapter/container；文件进临时对象存储，不进源码/rootfs | rights decision、72h TTL、10min signed URL、成功率 |
| BGE-M3 | 多语 dense embedding | `PRODUCTION` | MIT；无 API 费，运营成本为 CPU/内存/磁盘 | 独立 internal-only `embedding-worker`；exact revision/hash、只读 versioned volume、2 CPU/6 GiB/128 PID | nDCG@10 `0.996655`、Recall@10 `1`、P95 `240 ms`、peak RSS `2,244,235,264` bytes |
| PostgreSQL lexical search | 无模型词法基线与降级 | `PRODUCTION` | PostgreSQL 内置 FTS；无新增 extension/API 费 | `packages/search` + 独立 `SEARCH_DATABASE_URL`/迁移/连接池 | tenant-safe BM25、migration/restore、embedding outage 降级通过 |
| Docling | layout/table/OCR parser 候选 | `APPROVED_PILOT` | MIT；官方 wheel `2.123.0`/SHA-256 `95c0a4d…fde9c` 已锁定 | 独立 parser candidate image；官方 CPU wheels `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu`；OCR/remote/plugin disabled | 双栏/表格/公式、P95、内存；与 LiteParse 二选一主 parser |
| LiteParse | bbox/layout parser 候选 | `APPROVED_PILOT` | Apache-2.0；npm `2.14.0` 与 Linux x64 包已锁定 | 独立 parser candidate image；ECS evidence only，未进生产 Compose | 5/7 ready、13/16 locator、P95 163 ms、peak RSS 61,599,744 bytes；仍须与 Docling/current baseline 比较 |
| GROBID | 学术元数据、章节、引用解析 | `APPROVED_PILOT` | 开源、本地 CPU；运行资源需基准 | 独立 CPU service/container，只输出统一 source map adapter | DOI/作者/参考文献准确率、启动/内存、fallback |
| PaddleOCR | 复杂中英扫描 OCR 候选 | `APPROVED_PILOT` | 开源、本地 CPU；模型资源需基准 | 独立 candidate image/model volume | 对 Tesseract 的质量增益必须覆盖额外资源成本 |
| Deterministic SVG/Mermaid | Claim graph、流程与方法图 | `APPROVED_PILOT` | 免费；普通用户不限量但有任务资源配额 | 项目依赖或受控 renderer；输出对象存储 | data fidelity、XSS sanitization、可访问文本、版本化 |
| Plotly/interactive HTML | 真实数据图表与 Claim/Evidence demo | `APPROVED_PILOT` | 免费；普通用户不限量但有任务资源配额 | sandbox/受控 HTML renderer；CSP、无任意网络 | source-data hash、CSP/XSS、静态 fallback、导出 |
| Existing science-worker | Notebook/科学计算与产物收集 | `PRODUCTION` | 平台配额 | 无网络/Secret、非 root 沙箱，产物经 collector | AST policy、资源限额、artifact provenance |
| `beautiful-notes` workflow | 长文结构与笔记呈现参考 | `PATTERN_ONLY` | 不自动复制第三方 Skill | 只抽取可验证工作流模式；安装前审许可证与输入输出 | 对 RO 阅读质量的可测提升，否则不保留 |
| `humanizer` workflow | 减少机械生成文风参考 | `PATTERN_ONLY` | 不允许改写 exact quote | 只可处理说明/摘要，不触碰 Evidence 原文 | 事实保持、引用不变、语言质量人工盲评 |
| `bishe-guider` workflow | 学生/毕业研究引导参考 | `PATTERN_ONLY` | 身份静默路由给 student，不成为显式模式 | 只参考任务分解模式 | 对学生任务完成率的增益与错误建议率 |
| 本地 GPU 生图/视频栈 | 生成式展示 | `REJECTED` | ECS 无 GPU 预算 | 禁止安装 Stable Diffusion/ComfyUI/Wan 等服务 | 基础设施改变前不得重开 |

### 2.1 Approved-pilot evaluation ownership

本表与上表所有 `APPROVED_PILOT` 行必须一一对应。`UNLOCKED` 是阻止生产启用的显式状态，不是待填占位；只有完成精确版本/摘要和许可证复核后才可变化。

| Candidate | Owner | License/source terms | Version/digest | CPU/RSS boundary | Latency/throughput | Cost boundary | Data flow | Evaluation | Kill switch | Rollback |
|---|---|---|---|---|---|---|---|---|---|---|
| MiniMax text/vision | Hermes AI Gateway owner | Official Coding Plan VLM HTTP transport reviewed；provider terms/data policy must be rechecked before enable | Gateway contract `openscience-ocr-v1`；underlying provider model `UNLOCKED`，credential rotation blocks canary | External compute；adapter stays inside existing worker budget；internal cap 4 pages/4 MiB each/8 MiB aggregate | One page per attempt；attempt/total latency and error code audited | Versioned integer micro-USD estimate；unknown billing is explicit null；no unbounded retry | Authorized selected raster page bytes → AI Gateway → `/v1/coding_plan/vlm`；candidate text returns；no URL/full document | OCR/table/formula fidelity、page cost、audit completeness、locator revalidation | `MINIMAX_VISION_ENABLED=false` default；async provider policy；`AI_DISABLED_PROVIDERS=minimax-vision` | Disable route/policy；local parser and explicit review remain available；revert adapter release |
| MiniMax image/video | RO presentation owner | Provider terms plus generated-media disclosure required | `UNLOCKED`; credential rotation and model ID pin required | External compute；no GPU or model on ECS | Async admin job；queue and generation P95 recorded before use | Administrator-only capped showcase budget | Approved representative RO summary → provider；asset → object storage | Scientific fidelity、provenance、cost、removal drill | Media-generation admin flag | Disable generation；unpublish generated asset while RO evidence remains |
| ScanSci PDF | Source acquisition owner | School/source access terms and redistribution rights checked per source | `UNLOCKED`; adapter/auth mechanism must be digest-pinned | Isolated CPU adapter；RSS/CPU measured under pilot cgroup | Download success/P95 and provider throttling measured | No per-user charge assumed until terms review；egress/storage metered | Authorized source → temp object storage → parser；rights decision retained | Rights accuracy、download success、72h deletion、10min link | Source-adapter enable flag and credential revocation | Disable adapter；expire links and cache；retain hashes/rights audit only |
| Docling | Document intelligence owner | MIT upstream release；bundled model terms/hash manifest required before retention | wheel `2.123.0`/SHA-256 `95c0a4d…fde9c`；official CPU `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu`；image digest pending | Isolated 2 CPU/2 GiB/64 PID image；non-root/read-only/network none；OCR/remote/plugin disabled；build/preflight reject GPU packages | Compare per-page P50/P95 and queue throughput | No API fee；CPU/RAM/image/model storage measured | Read-only self-authored corpus → isolated candidate → 64 KiB content-free attached outcome | Dual-column/table/formula/scan fidelity；package/model aggregate lock and `gpuPackageCount=0` before cases | Parser route weight zero and candidate container stop | Return route to current parser image；candidate stays `APPROVED_PILOT` until exact ECS gate |
| LiteParse | Document intelligence owner | Apache-2.0 upstream npm package；transitive lock retained for review | npm `2.14.0`，integrity `sha512-lIFB…ThWA==`；exact-SHA ECS image `sha256:b2c9bf96af5cfc4d119a6ae2ffb0f305353129a315296a25aabf0ab533eaa60f` | 2 CPU、2 GiB/64 PID、non-root/read-only/network none；observed peak RSS `61,599,744` bytes | 7-PDF P50 `8 ms`、P95 `163 ms`；5 succeeded/1 needs review/1 failed | No API fee；candidate image/eval storage only | Read-only self-authored corpus → isolated candidate → 64 KiB content-free attached outcome；OCR disabled | 13/16 locators；native/dual/table/formula/references exact，scan correctly needs review，corrupt fails；overflow/timeout canary capture/residue 0 | No production route；ephemeral containers；120s timeout；overflow fail-closed | Remains `APPROVED_PILOT` pending Docling/current comparison；LiteParse 未进入 current release `8163f8b` |
| GROBID | Scholarly metadata owner | Exact upstream release license and bundled model terms required | `UNLOCKED`; service image digest required | Isolated CPU service；cold-start and peak RSS gate | Metadata/citation P50/P95 and queue throughput | No API fee；resident CPU/RAM budget measured | Authorized document → isolated service → normalized metadata/source map | DOI/author/reference accuracy、fallback、resource peak | Metadata-enrichment flag and service stop | Disable enrichment；preserve parser output without GROBID fields |
| PaddleOCR | Document intelligence owner | Exact upstream release plus OCR model licenses required | `UNLOCKED`; image and model hashes required | CPU-only isolated candidate；hard cap compared with Tesseract | Per-page OCR P50/P95 and queue throughput | No API fee；CPU/RAM/model disk measured | Selected scan pages → isolated OCR → locator revalidation | Chinese/English OCR fidelity gain versus Tesseract and resource cost | OCR backend selector | Route back to Tesseract or explicit review；restore prior model volume |
| Deterministic SVG/Mermaid | RO presentation owner | Renderer and transitive licenses recorded from locked dependency | `UNLOCKED`; renderer version and sanitizer policy hash required | Sandboxed CPU renderer with per-job time/RSS limits | Render P50/P95 and queue throughput | Free for users within platform resource quota | Hashed Claim/source data → renderer → sanitized SVG/object storage | Data fidelity、XSS/CSP、accessible text、export stability | Visualization renderer flag | Disable renderer；serve accessible text/static prior asset |
| Plotly/interactive HTML | RO presentation owner | Exact renderer bundle and transitive licenses required | `UNLOCKED`; bundle digest and CSP policy hash required | Sandboxed CPU renderer；no arbitrary network；per-job cap | Render/load P50/P95 and concurrent job throughput | Free for users within platform resource quota | Hashed source data → sandbox → sanitized HTML/object storage | Source-hash fidelity、XSS/CSP、static fallback、export | Interactive-HTML renderer flag | Disable interactive asset；serve static chart and accessible data table |

## 3. Current credential and runtime truth

2026-08-26 只做了变量存在性与最小只读探测，未读取 `.env`，未输出任何值：

| Layer | MiniMax | Tavily | Semantic Scholar |
|---|---|---|---|
| Current local process | 未注入 | 已注入；额度耗尽 | 常用变量未注入；MCP 请求限流 |
| Current user environment | 未注入 | 已注入 | 常用变量未注入 |
| Production `agent-worker` | 已注入 | 未注入 | 常用变量未注入 |

“仓库或服务器 `.env` 中存在”不等于“目标进程已注入”。以后排障按四层分别记录：配置文件变量存在性、Compose 映射、容器环境存在性、provider 最小健康探测。任一层失败都不得笼统写成“API key 失败”。

用户在聊天中提供的 MiniMax 与 Semantic Scholar 凭据视为已暴露。后续配置顺序固定为：轮换 → 只写本地/生产 Secret → 只检查存在性 → 最小健康探测 → 记录日期和状态；旧值不得用于测试。2026-08-27 presence-only 复核确认生产仅有 MiniMax key，Vision route disabled；Tavily/Semantic Scholar 尚未注入生产，须等 Task 10 consumer 与权限边界完成后再配置。

## 4. Installation and directory policy

### 4.1 Repository

- Node：根 `devDependencies` 或对应 workspace package，使用 `npx pnpm@9.15.0`，提交 lockfile。
- Python 评测：项目 `.venv` 或 `uvx`；`.venv`、缓存和模型权重必须 gitignored。
- Production：固定版本和 digest 的独立容器；禁止 `pip install`/`npm install -g` 到宿主机。
- Skill/MCP：项目级配置优先；登记来源 repo、commit/tag、license、入口与需要的变量名。

### 4.2 Server

允许的持久位置：

- 应用 release：`/opt/openscience-releases/<sha>`，不可写。
- 稳定配置：`/opt/openscience/.env.prod` 或后续 Secret manager，只保存于服务器。
- 模型：版本化只读 Docker named volume，例如 `embedding-models-v1`、`parser-models-v1`。
- 临时文档：独立 object-storage prefix/volume `hermes-cache/<workspace>/<job>`，带 TTL 与容量配额。
- 任务 IPC：现有 bounded `parser-jobs` tmpfs 或专用 bounded queue/volume。

禁止位置：应用源码目录、release tree、用户 HOME、`/usr/local`、应用容器 rootfs、未命名临时目录。

### 4.3 Cleanup

- PDF/OCR page cache：默认 72 小时。
- Signed download URL：10 分钟。
- 失败任务临时输入：任务终态后最多 24 小时，安全事件可按审计政策延长但不得向用户提供下载。
- Embedding/model：不按 TTL 清理，只按版本退役；退役前保留上一个健康版本和索引可重建证明。
- 永久保留：内容哈希、来源 URL、rights decision、Claim/Evidence locator、parser/model 版本、审计与用户确认记录。

清理必须由可观测 job 完成，记录 scanned/deleted/skipped/bytes/failures；禁止用未校验路径的递归删除命令。

## 5. Evaluation matrix

每个候选使用相同 golden corpus，与当前生产基线比较：

| Axis | Required evidence |
|---|---|
| Claim quality | 双盲人工 precision、漏失与重复 Claim |
| Evidence fidelity | exact quote round-trip、page/bbox 命中率、反证识别 |
| Document coverage | native/scanned/double-column/table/formula/reference/zh-en |
| Interest relevance | identity + current goal 的 top-k 相关性与可解释理由 |
| Performance | P50/P95、CPU、RSS、磁盘、冷启动、队列吞吐 |
| Cost | 每文档/API 页/媒体资产成本与额度行为 |
| Reliability | timeout、rate limit、partial result、retry、provider outage |
| Security/privacy | data destination、Secret scope、network、CSP/XSS、malware boundary |
| Operations | healthcheck、metrics、kill switch、rollback、index rebuild |
| Licensing | source license、model/data restrictions、学校访问和再分发边界 |

保留条件：质量在关键轴优于现有基线，或以显著更低资源达到同等质量；且无未缓解的安全/许可问题。否则停用并记录原因，不因已经安装而保留。

2026-08-26 Foundation 当时仅建立 `BASELINE_ONLY`。截至 2026-08-28，BGE-M3 与 PostgreSQL lexical search 已通过 exact-SHA ECS 评测、隔离部署、降级/恢复和双库恢复门禁升为 `PRODUCTION`；Docling、LiteParse、GROBID、PaddleOCR 仍为 `APPROVED_PILOT`，MiniMax OCR 继续 `BLOCKED`。

## 6. Change record template

每次能力变更在本节顶部追加一行：

| Date | Capability | From → To | Version/digest | Evidence | Rollback | Operator |
|---|---|---|---|---|---|---|
| 2026-08-28 | BGE-M3 hybrid retrieval | `APPROVED_PILOT` → `PRODUCTION` | revision `5617a9f…b181`；model manifest `08cc5a6…78e4`；image `sha256:137352df…0a3e`；release `8163f8b…` | exact-SHA ECS nDCG/Recall/P95/RSS pass；internal-only CPU isolation；lexical outage fallback/recovery；search migration `2/2`；dual-DB restore | disable `BGE_M3_ENABLED` for lexical-only or deploy `f9659668…` | Codex |
| 2026-08-27 | Docling evaluation candidate | untracked → source-locked pilot | official wheel `2.123.0`/MIT；SHA-256 `95c0a4d…fde9c`；official CPU `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu`；image digest pending | local runner `3/3`、worker `14/14`、Bash GREEN；ECS caught invalid wheel filename then default CUDA dependency before corpus；CPU lock now requires build/preflight `gpuPackageCount=0` | keep `APPROVED_PILOT`; no production route/Compose change | Codex |
| 2026-08-27 | MiniMax LLM OCR Gateway route | absent → deployed/default disabled | `openscience-ocr-v1`；release `f965966`；provider model unresolved | mocked route、strict image/input/result bounds、policy/kill-switch、redacted audit、ECS `AI_GATEWAY_OCR_CONTRACT_OK`；no paid call | keep vision disabled and external policy deny；rollback `ef043eb` | Codex |
| 2026-08-27 | LiteParse evaluation harness | untracked → source-locked evaluated pilot | npm `2.14.0` / Apache-2.0；image `sha256:b2c9bf96…eaa60f` | exact-SHA ECS 7-PDF：5 succeeded/1 review/1 failed、13/16 locator、P50 8 ms/P95 163 ms、peak RSS 61,599,744 bytes；timeout/overflow fail-closed且无残留 | keep `APPROVED_PILOT`; compare Docling/current before retention | Codex |
| 2026-08-26 | Current parser benchmark | unmeasured → `BASELINE_ONLY` | corpus schema 1 / 13 self-authored hashes + locators | recorded local run: 7 ready、6 expected-text matched、6 explicit review；image-only PDF 的页分隔符造成 1 项 false-ready；P50 0.03 ms、P95 226.09 ms、max RSS delta 28,672 B；deterministic facts repeat stable | delete ignored report and revert benchmark commits；production unchanged | Codex |
| 2026-08-26 | Registry baseline | untracked → registered | docs-only | local/process/container existence checks; Taskmaster alignment | revert docs commit | Codex |

禁止把 key、cookie、学校账号、容器完整环境或认证响应写入 Evidence 栏。

## 7. Windows SSH preflight

服务器能力核验和安装只能从 PowerShell 显式调用 Git Bash：

```powershell
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/checkup.sh
& 'C:\Program Files\Git\bin\bash.exe' ./infra/scripts/ssh-run.sh '<read-only command>'
```

日志出现 `wsl: Failed to translate` 代表误用了 WSL，不代表 SSH key 失效。详细根因与禁令见 `docs/runbooks/deployment.md` §1.1。
