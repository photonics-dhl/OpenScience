# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-28。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## 2026-08-28 — 卫生债与 ECS 临时资源清理

- 仓库复现并清理 10 个无引用文件、19 个无用导出、44 个无用导出类型和 1 个重复导出；Compose 动态 parser 入口、隔离子进程 `mammoth`/`pdf-parse` 依赖及 LiteParse 独立 workspace 已显式建模。`audit:knip` 仅余非阻断 configuration hints，`audit:dep` 为 0 violation；聚焦公开阅读面 `5/5`、全仓单测、build、typecheck、lint、docs-sync、Markdown lint 与 diff check 均已复跑通过。
- ECS 按精确 ID/名称删除 7 个退出候选容器、6 个恢复/测试数据库、3 个无引用卷、旧 BGE/LiteParse/agent/parser 镜像世代与 build cache；保留 current/rollback、生产 BGE worker/版本卷及通过门禁的 LiteParse 候选。Docker images 从 `35.63 GB` 降至 `12.56 GB`，volumes 从 `11.44 GB` 降至 `6.754 GB`，volume reclaimable 为 `0 B`。
- 卫生 implementation `d37d7a8…` 随 immutable application/release `e2c0eaf…` 部署，rollback 为 `8163f8b…`；服务器全量 build、core `29/29`、search `2/2`、所有目标容器、公网/loopback、失败标记与精确 release 通过。BGE CPU canary 返回 `EMBEDDING_RUNTIME_OK`，真实 `OpenScience_Kimi_Development_Spec.docx` 经生产 sidecar 提取 `18,118` 字符并返回 `DOCUMENT_PARSE_CANARY_OK`。
- 文档处理能力仍未全部配齐：现有 sidecar/Tesseract/ClamAV/strict source-map 与 BGE-M3 为生产能力；LiteParse 仍是 `APPROVED_PILOT`，Docling/GROBID/PaddleOCR 尚无保留门禁，复杂版式/表格公式/参考文献/扫描件级联不得声称完成。

## 2026-08-28 — Research Intelligence Task 6 生产收口

- Taskmaster Task 6 `Semantic Retrieval with BGE-M3 and Hybrid Fusion` 已完成，Research Intelligence 现为 5/12；Tasks 4、7 dependency-ready，Task 10 仍等待 Task 4。
- ECS-only BGE-M3 exact gate：revision `5617a9f61b028005a4858fdac845db406aefb181`，model manifest `08cc5a668e899e216e8ce66e7f3a5e144cefd9600a082997483c5dd0c66478e4`，package freeze `dc2bc38e5ddda73889d15265eac0cdfa8eaaebe311bc2e63a9b2e32e19cd0fc3`，1024 维、GPU package 0。
- 自著双语 corpus 16 chunks/24 queries：nDCG@10 `0.996655`、Recall@10 `1`、P50 `232 ms`、P95 `240 ms`、peak RSS `2,244,235,264` bytes；满足 P95≤2.5s 与 6 GiB 上限。
- 生产 release `8163f8b4218e529ee4be41bb9fc732ff6497931a`、rollback `f9659668b237b70b4c018b866e20498689d327c2`；core/search migration 当前 `29/29`、`2/2`，物理库隔离通过，公网与 loopback release marker 一致且 `.release-failed` absent。
- `embedding-worker` 仅 internal network，无 published port，user `10001:10001`、read-only、cap-drop ALL、no-new-privileges、2 CPU/6 GiB/128 PID；生产 image digest `sha256:137352df4cb1c0937693f3b61d897d22c578232cc8ac15c5a088d0fcb08a0a3e`。
- 人工停止 embedding worker 后，真实生产 worker 返回 `lexical_only / embedding_unavailable`；恢复服务后 strict model-identity vector canary 再次通过，未写生产搜索数据。
- 双库原子备份集合 `db-set-20260827T155422Z-1676593` 校验和、0700/0600 权限与 release 绑定通过；core/search 均恢复到隔离临时库，schema/data hash 与生产一致或 PostgreSQL 规范化后一致；恢复与测试临时库已在后续明确授权下精确清理。
- fresh gates：Python embedding `8/8`、deploy contract `19/19`、Web `422/422`、Search `66/66`（8 个 ECS-only integration 本地跳过）、Agent Worker `140/140`、Domain `433/433`、全仓 build/typecheck/lint/unit/docs/diff GREEN；无本地 Docker。
- 当时 `audit:knip`/`audit:dep` 的既有红线已在本文件顶部卫生轮次闭合；不得再沿用旧红线判断当前状态。

## 2026-08-27 — Research Intelligence Task 4 启动

- 生产只读复验：release `f965966` exact，Web/API/Worker/Parser healthy；真实 PDF/DOCX sidecar self-test、`DOCUMENT_PARSER_CONTRACT_OK`、`AI_GATEWAY_OCR_CONTRACT_OK` 均通过。Vision 仍 disabled，因此未声称真实 LLM OCR 质量。
- Task 4 当时完成 LiteParse ECS-only bake-off：`2.14.0`/Apache-2.0 exact image `sha256:b2c9bf96…eaa60f`，7-PDF 为 5 succeeded/1 needs_review/1 failed，13/16 locator，P50/P95 `8/163 ms`、peak RSS `61,599,744` bytes，超限/timeout 均 fail-closed 且无残留；评测时生产 release 为 `f965966`。LiteParse 至今仍为 `APPROVED_PILOT`，须与 Docling/current 同门禁比较，未部署。
- Docling `2.123.0`/MIT 候选已在本地以 wheel SHA-256 `95c0a4d…fde9c` source-lock：OCR/remote services/plugins 均 disabled，CPU 2 threads；镜像构建期下载模型并生成 package freeze 与逐文件模型 hash manifest，运行前经 64 KiB content-free lock preflight。纯逻辑 `3/3`、评测脚本 `14/14` 与 Bash 语法 GREEN。ECS build 在 corpus 前依次 fail-closed 于非法临时 wheel 名、默认 PyPI Torch 的 CUDA 解析、以及 CPU Torch 与 Docling 共层时的依赖索引失败；现将官方 CPU `torch 2.13.0+cpu`/`torchvision 0.28.0+cpu` 独立成可缓存验证层，Docling 显式走 PyPI official index，build + preflight 双重拒绝 GPU package。待新 exact SHA 重跑，不得声称质量、RSS 或保留。
- Task 6 计划阶段锁定 BGE-M3 revision `5617a9f…b181`、FlagEmbedding `1.4.2` wheel SHA-256 `35e33a0…9bf2`、CPU-only/6 GiB 候选门禁与 lexical+dense RRF；当时 route 尚 disabled，后续完整 ECS 门禁与生产晋升见本文件顶部 2026-08-28 条目。
- Task 6 Task 1 候选 harness 已完成本地无模型/无 Docker 的 TDD 切片：16 个自著中英 evidence chunk、24 个含跨语言与相近干扰项的 query，BGE-M3 runner 明确区分 `encode_queries`/`encode_corpus`，仅输出 bounded base64 float32 或 content-free nDCG/Recall/P50/P95/RSS；FlagEmbedding/model exact lock 与 ECS-only 2 CPU/6 GiB/128 PID/network-none/read-only gate 已编码。Python `5/5`、corpus `1/1`、Bash contract/syntax/diff GREEN；尚未在 ECS build/download/run，因此不得声称模型效果或可保留。
- Task 6 Task 2 当时完成 expand-only TDD 与 exact-SHA ECS drill：五表 tenant scope、stable SHA `CHAR(64)` chunk ID、locator array、database-owned `tsvector`+GIN、1024-dimension/4096-byte/vector hash+norm 约束、复合 tenant FK 与逆序 rollback；当时生产保持 `1/1`，现已随 Task 6 release `8163f8b…` 升为 `2/2`。
- Task 6 Task 3 locator-safe chunking 已完成 TDD、双专家复审与提交 `c8fc590`：Unicode Latin/数字词与 CJK bigram、稳定 schema-version hash、512–1024 token/65,536-character 双边界、流式可拆段落填充、表格/公式/参考文献不可拆分、Claim 分层预算、null-prototype 词频、canonical UUID/hash 和 O(1) locator 构造/round-trip；未知 Claim block 与不可持久化输入 fail-closed。Search `11/11`、Domain full `430/430` + focused `43/43`、全仓 lint/typecheck GREEN；未连接模型或生产 route。
- Task 6 lexical 阶段在 exact `7d489c51…` 完成 tenant-safe BM25、migration `2/5/1/3 → 1/0/0/0 → 2/5/1/3` 与真实 PostgreSQL `5/5`；当时生产保持 `f965966`/search `1/1`，现已随 `8163f8b…` 生产晋升。GIN gate 不替代 Task 12 的真实规模 planner/concurrency hardening。
- 安全处置与版本恢复：一次诊断误将临时迁移容器 argv 中的数据库 URL 暴露到受控工具输出后，立即停止失败 unit、清理一次性数据库并以 `openscience-db-credential-rotation-20260827-a2.service` 轮换 PostgreSQL 应用凭据；仓库未写入 Secret。轮换脚本现固定 active immutable release Compose，并加入 `flock` 单飞、mutation-intent、旧/旧或新/新补偿与两端认证/健康核验。生产已按 `f965966…` 强制协调并实测 exact images/mounts/health/public release；巡检 public/local 200、egress 204、约 105 GiB 磁盘及 26 GiB available memory。后续迁移 Secret 只可通过 stdin 或 `--env-file` 路径传递，禁止进入 argv/诊断输出。

## 2026-08-27 — Research Intelligence Task 5 已部署

- Task 5 收口当时 Taskmaster 为 4/12、release `f9659668…`、rollback `ef043ebb…`；它们现分别是 Task 6 的 rollback 与历史 release，CURRENT tuple 见下。
- AI Gateway 新增 provider-neutral LLM OCR candidate contract：Gateway-owned prompt/hash、真实图片 header/尺寸核对、4 页/4 MiB 单页/8 MiB 总量、external-processing policy、运行时 kill switch、逐页 fallback、成本/latency 脱敏审计。
- MiniMax Coding Plan VLM adapter 只允许官方 origin；provider wire payload 不越过 `packages/ai-gateway`，API/Domain/Web 无 SDK 或 schema 扩散。Vision 默认 disabled，未做真实或付费调用。
- Fresh gates：AI Gateway `48/48`、worker `102/102`、全仓 build/typecheck/lint/test、docs 226 files/0、docs-sync 8/8、`AI_GATEWAY_OCR_CONTRACT_OK`、diff 通过；本机 Docker 零调用。
- ECS：pre/post checkup 健康，backup `452K files=7/7`，服务器 full build 与 SHA-tagged Worker/Parser images 完成，`--skip-migrate` 无 migration/seed/research write；core `28/28`、search `1/1`。
- Runtime：Parser network none/read-only/user node/512MiB/64PID/仅 `/parser-jobs`；公网 `/` 200、auth/admin 401、release exact、failure marker absent。
- Secret presence-only 检查：MiniMax key present；Vision route disabled；Tavily/Semantic Scholar keys 尚未进入生产，留待 Task 10 有 consumer 和权限边界后注入。

## 2026-08-27 — Research Intelligence Task 3 已部署

- Taskmaster `hermes-research-intelligence`：Task 1–3 done（3/12）。严格 DocumentSourceMap、deterministic locator round-trip、worker parser contract 与 image-only false-ready gate 已随 immutable application/release `ef043ebb8e51332effe75a5639cb207aec7bfc47` 部署；rollback `e0828a6118c92c87b7869493413441bba0e76a95`。
- 核心领域合同已实现：ResearchIdentity/Profile、Claim、Evidence、PresentationAsset、严格 locator 与 ExtractionResult；Claim graph 要求每个公开 Version 有 3–7 个核心 Claim、同 RO/version、无环，发布校验与状态切换位于同一 Serializable 事务。
- 核心迁移 28 新增 `ResearchIdentityProfile`、`ClaimNode`、`EvidenceRecord`、`PresentationAsset` 与关联表；只保存元数据、哈希、locator 与对象键，不保存 PDF/图片/视频字节。
- `packages/search`、`infra/search/schema.prisma`、独立迁移账本和 `SEARCH_DATABASE_URL` 已建立；core/search URL 物理隔离门禁和迁移链已接入部署，API/domain 不直接依赖搜索 client。
- ECS disposable PostgreSQL 已完成 core/search migrate → rollback → reapply：core `28`、5 张新表、9 个 scoped constraints；search `1`，临时数据库随后清理。没有使用本机 Docker。
- 生产已创建独立 `openscience_search` 数据库并以不输出值的方式写入 Secret 配置；`.env.prod` 权限保持 `600`，回退副本为 `.env.prod.pre-search-e0828a6`。
- 已审阅 implementation parent `c47b3f182ba857897c3c33ee21c250f6b4db3f3c`；`ef043eb` 是同树 empty CI marker。GitHub Actions exact run `32992769105`（12m18s）通过 build/typecheck/lint/unit/product visual/Hermes gates，尽管 Actions 曾短暂 major outage；临时 PR #5 已关闭未合并，PR #4 保持开放。
- core 生产 ledger 有 29 条 active 记录，其中 28 条与当前仓库一致，额外一条是保留的历史 `20260809010000_ro_create_idempotency`；没有 failed migration，不删除或伪造该历史记录。
- Fresh local gates：domain `429/429`、worker `95/95`、full typecheck/lint/unit/build/diff pass；未启动 local Docker。ECS preflight：disk 22%、available memory 26GiB、ingress 200、egress 204。
- ECS 使用 canonical `deploy.sh --skip-migrate`；无 migration、seed 或 research write。backup `452K files=7/7`；core current `28/28`、search `1/1`、failed `0/0`，保留 historical extra ledger。exact SHA Worker/Parser images 与 containers healthy；Parser network none/read-only/user node/512MiB/64PID、仅 `/parser-jobs`、无 secret-named env，production `DOCUMENT_PARSER_CONTRACT_OK`；public/loopback 200，auth/admin 401，release exact，`.release-failed` absent。

## 2026-08-26 — Research Intelligence Task 1 Foundation

- Foundation 当时建立 21 行能力主表与 11 行候选矩阵；BGE-M3 后于 2026-08-28 晋升 `PRODUCTION`，Docling、LiteParse、GROBID、PaddleOCR 仍为 `APPROVED_PILOT`，MiniMax OCR 保持 `BLOCKED`。
- 13 项自著权 deterministic corpus 覆盖 native/scanned/dual-column PDF、table、formula、references、DOCX、TeX、Markdown、CSV/XLSX、notebook 与 code，不使用用户文件。
- current-parser 基线为 7 项 `ready`、6 项 expected-text matched、6 项显式复核；image-only PDF 的 false-ready 已记录为 Task 3 候选必须消除的缺陷。
- 尚未安装或部署 OCR、BGE-M3、ScanSci、Tavily、Semantic Scholar 或新模型能力；Task 2 只建立数据合同与独立存储边界。

## Current version tuple

- Branch: `codex/hermes-wanko-live2d`；hygiene implementation: `d37d7a8acb4ff74e8f7b511e518fc84b888065f8`；production application/release: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`；rollback: `8163f8b4218e529ee4be41bb9fc732ff6497931a`。
- 后续 docs-only HEAD 不改变已部署 application/release 身份。

## Constraints and open risk

- 所有 Docker、数据库迁移、镜像构建和生产验收只在 ECS 执行；Windows 远程操作必须由 PowerShell 显式调用 Git for Windows Bash，再走 canonical scripts。
- Landing/Hermes 视觉冻结；Task 2 只含一次 context-loss 恢复控件可访问性修复。
- 每日 `backup.sh --db` 已原子覆盖 core/search；恢复演练库与旧候选模型卷已在 2026-08-28 明确授权后精确清理，current/rollback、生产 BGE 模型卷及通过门禁的 LiteParse 候选继续保留。
- 不读取、打印或提交 `.env` 值；不安装 GPU 栈；不把生成内容冒充 Evidence。

## Next action

1. 继续 Task 4 的 Docling/current/LiteParse 同门禁比较；未取得完整质量与 RSS 证据前不保留 Docling。
2. Task 7 `Research Identity Profile and Hermes Routing` 已因 Task 6 完成而解锁；实现与部署仍遵循服务器最终验收。
