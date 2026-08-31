# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-31。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / reviewed controlled-egress candidate / main: `codex/scansci-controlled-egress` / `c933a60` / `25983c1`；远端仅 `main`。
- Production application source / immutable release: `689331845574612130f223d08c92e61721c16586`。
- Production rollback: `c435c4c8b2800bb20998fd9a9a93f2db96328661`；core/search migrations `32/32` / `2/2`。
- Taskmaster `hermes-research-intelligence` 仍为 9/12；独立 ScanSci plan Tasks 1–9 done、Task 10 in progress，Task 11 继续阻断。

## 2026-08-31 — ScanSci Task 10 controlled-egress preflight candidate

- PR #13/#14 已分别把 stdin Secret provision 与 ScanSci Compose build context 修复合并至 main `25983c1`；ECS root-only token/bootstrap Secret、三个 public source-lock hash、五个 SHA-tagged candidate image 和 schema-v3 16-case parser acceptance 已通过，production 保持 `6893318`。
- direct bridge arXiv TLS reset 的根因已收敛为 fail-closed 受控出网：legal service 仅在 `internal: true` 的 `172.24.0.0/24` retrieval network，经固定 gateway `172.24.0.1:7891` 使用 Squid；仅 `.arxiv.org` 可进入 SSH parent，其他域同 resolver DIRECT。ECS no-switch 临时网络证明 proxy TCP、DIRECT、FIRSTUP_PARENT、private/HTTP/non-443 deny 与 raw-direct deny，随后 exact cleanup；active/public release 未变。
- publish/CAS 前 runtime gate 现强制真实 `arXiv:2009.06045v1` HTTP→worker PDF canary；payload 经真实 policy 验证 `institutional:true`，响应经真实 `open_access` route、PDF magic 与 100 MiB streaming cap 校验。最终独立 security review 为 READY（0 Critical/Important）；fresh ScanSci `87/94`、Infra `48/53`、auth tunnel `21/21`、full build/typecheck/lint/docs/full workspace test 均 0 fail。合并后 ECS 真正 candidate image/canary 与 CARSI 仍 pending。

## 2026-08-31 — ScanSci Task 9 local security/release gate

- 用户明确授权的例外修复波 `3d23b87` 已关闭最终两项 Important：任何既有 candidate/protected rollback sidecar 均在 mutation 前拒绝，真实 publish/CAS-failure cleanup 只删除本事务唯一 staging/owned sidecar；canonical verifier 内部派生 release-tagged Worker image，核验 source label、运行 image ID 与精确三个挂载。独立 scoped review 无 Critical/Important，结论 READY。新鲜全仓 build/typecheck/lint/test green：release `97/104`、ScanSci `82/89`、Web `469`、Domain `535`、Worker `503`、API `101`，失败 0；22 skips 均为 Linux/ECS gate。两项 bounded hygiene Minor（部分 unique staging 写失败残留、早期 dangling symlink 检查）记录到 Task 10 ECS preflight/清理，不影响 canonical/protected state。
- 禁用词精确扫描 58 个命中均为 fixed false、拒绝/compatibility 逻辑或 adversarial test；`audit:knip`、`audit:dep`（831 modules / 1936 dependencies）和 `audit:deps` green。全仓 build/typecheck/test green：release `95/102`（7 skips）、ScanSci `82/89`（7 Windows/POSIX skips）、Web `469`、Domain `535`、Worker `503`、API `101`；本机总计 `2115 pass / 22 skip / 0 fail`。Linux CI 将执行真实 RLIMIT/child 继承用例。
- 本地候选不等于生产：ECS 仍为 `6893318` / `c435c4c` / core-search `32/32`-`2/2`，ScanSci disabled。Migration 33、Linux negative-cache/硬 file limit/NAT64/serial/256 MiB runtime、真实 OA/CARSI、四入口、72h GC、zero-grey/Tor 与 exact rollback/retention 均留给 Task 10。

## 2026-08-30 — ScanSci Task 8 local review candidate

- `8238a9f` + fix rounds `d75ca1c` / `c0bcf0a` 接通并加固 Hermes Drawer、RO Hermes、RO Files/Evidence：Drawer intent 自持 stable key/SHA-256 fingerprint，并在 generic history recovery 前 exact replay；Dashboard 固定 Personal、RO route ID 为唯一 target authority；IME composition Enter 不提交。
- Durable payload server-stamp target；API 严格 target 组合；active/retryable/terminal 均在 limit 前做 user/authority/target 筛选，Web 不再 global-then-filter。Domain `535`、API `101`、Worker `502`、Web `463 + 5 Node`、19-route build/typecheck、browser fix `6/6`、product `72/72`、Hermes `19/19 + 8/8` green。
- 这是本地 review candidate；生产仍为 `6893318` / `c435c4c` / core-search `32/32`-`2/2`。ECS 375px、真实 OA/CARSI、一次性下载与部署仍属 Task 10，不能标 done。
- Task 10 部署前须只读确认 targetless durable ScanSci task 数为 0；非零即阻断并另行决策，本轮不自动回填或扩 migration。

## 2026-08-30 — ScanSci Task 7 local review candidate

- `22088c0` + `86e037e` + `3e829db` + `1059072` + `82d4772` + `185d5d6` 闭合 persisted DTO/hash-only intent、同 task/credit retry、精确 poll cleanup、server-only retry invariant 与 PostgreSQL parity test truthfulness；generic/public/internal caller 不能注入 marker，Worker 只读精确 durable v1，历史/畸形/撤权任务 false。
- Retry 的 authority read/CAS/audit 现为三次 P2034-only Serializable 事务，Redis commit 后投递；recovery 用一次参数化 ID-only SQL 精确筛选权限/JSONB/DOI-arXiv 后 hydrate 并复用共享 predicate，无 top-N/循环/payload 泄露。14-case corpus 显式区分 JSONB 与 JavaScript-only `undefined` own-property；PG parity 用更新 terminal sentinel 分辨 raw candidate 与 fallback。Fresh Domain `534`、API `99`、Worker `502` 与三包/typechecked real-PG contracts green；既有 Web/Playwright `441 + 5 Node` / `7` 未改。
- 这是本地 review candidate；ECS 375px、真实 CARSI/OA、一次性下载与 Task 8 四入口仍 pending，不能把 Task 10 标 done。生产保持 `6893318` / `c435c4c` / core-search `32/32`-`2/2`。

## 2026-08-30 — ScanSci Task 6 local recovery candidate

- `60b3740` 闭合 provider state 事务/重放/generation、三次 P2034、非致命 observation、descriptor Secret 与 disabled rollback；Domain 520、Database 26、Worker 501、三包 typecheck、独立复审均 green。
- 真实 PG forward/rollback/redeploy + 双 client 合同仅 typecheck；migration 33、OA/CARSI/session/四入口仍须 ECS。生产保持 `6893318` / `c435c4c` / core-search `32/32`-`2/2`。

## 2026-08-30 — ScanSci Task 5 atomic acquisition candidate

- 本地 `ff5568f` + `4763228` 将 Personal RO/SDF、AgentSession、AgentTask、AI Credit debit 与三类 audit 收口到一笔三次有界 Serializable acquisition 事务；同键用完整 target/query/identifier/server payload digest 绑定，exact replay 在余额前返回，不再使用补偿删除。P2002 仅在 Prisma modelName 与该操作 idempotency field/column/constraint 同时精确匹配时重试，其他唯一冲突原样传播。
- `createResearchObject`、`createAgentSession`、`submitAgentTask` 共用 transaction primitives；公开 RO 仍拒绝 `system:`，公开 generic Agent API 仍拒绝 `source.retrieve`，严格 4 KiB/字段/CSRF/auth/rate-limit 合同未变。Redis 仅在 commit 后投递；失败留下一个 `dispatchedAt=null` pending task，可由 replay 或 recovery 重派且不重复扣费。
- 本地 Domain `59/514`、API `18/95`、Agent Worker `33/468`、全仓 typecheck/lint green。真实 PostgreSQL 集成 suite 已覆盖 rollback、credit、audit、并发、两连接确定性 archive/membership SSI cycle、同键 target/query/identifier mismatch 与 recovery；依本地 no-Docker 规则只完成编译，须在后续服务器验收执行。

## 2026-08-30 — Task 10 reopened for default ScanSci capability

- Task 4 本地实现已完成：生产 Compose 新增 SHA-tagged legal/auth、networkless Secret init、UID10001/0400 分权 named Secret volumes 与持久 session；部署先验 ScanSci 再切 Worker，回滚精确恢复旧 SHA 或在旧版无服务时停止 candidate，retention 保护 active+rollback ScanSci tags。ECS/真实 CARSI 尚未执行。
- `provision-scansci-secrets.mjs` 仅从 stdin 原子写 root-only 固定文件且默认保留既有值；`verify-scansci-runtime.mjs` 仅输出状态并校验 source/archive/dependency、UID/mount/network/port/limit/policy/token/session。决策见 ADR-012。
- 用户明确要求浙江大学 CARSI 认证一次后成为 Hermes 的持久默认能力；账号凭据可在需要时作为服务器 Secret 保存。用户不选择 provider/mode，OA 失败后自动使用持久机构会话。
- 已批准设计覆盖独立 `scansci-legal`、loopback-only 认证 helper、持久 session volume、统一 `/literature/acquisitions` 异步入口，以及 Dashboard/Personal Space、Hermes、RO Hermes、RO Files/Evidence 四类产品入口。
- 新设计写入 `docs/specs/2026-08-30-scansci-default-capability-design.md`；Sci-Hub/LibGen/SciBban/Tor 继续硬禁用。当前生产仍是 `6893318…` 且健康，但 ScanSci 仍 disabled，因此 Task 10 不再记 done。
- 用户已审核批准书面 spec；TDD/Compose/多入口/ECS 计划写入 `docs/plans/2026-08-30-scansci-default-capability-plan.md`，Task 11 继续阻断。

## 2026-08-30 — Task 10 external retrieval and temporary documents production-accepted

- Semantic Scholar/Tavily/ScanSci legal-only adapters、provider-neutral rights、`source.retrieve`、migration 32、72h private cache、10min HttpOnly one-use download、GC lease/fence/backoff 与永久 provenance 已完成。ScanSci 保持默认 disabled；Tavily 四个授权 key 均被供应商判定额度耗尽并优雅降级。
- PR #8 实现合入 `c435c4c…`；真实调用发现 SeaweedFS/minio-js 把 `x-amz-meta-sha256` 规范化为 `sha256`，PR #9 以严格 64-hex 双键兼容修复并清除 parser isolation 测试拒绝竞态。Exact CI `33284956868` / job `99186426490` 11m09s 全绿；本地 Storage 22/22、Worker 468/468、API 89/89。
- Final ECS release `6893318…`：migration 32、search 2/2、Parser 16-case、BGE CPU 实向量、数据库隔离、容器/Nginx/public identity 全绿。真实 Semantic Scholar 任务返回 3 sources；连续请求的 provider 429 被正确记录为 unavailable，不影响任务完成。
- 受控自著 PDF 完成 checksum HEAD、一次性下载、77-byte SHA-256、重放 404、精确 72h 边界与真实 60s Worker GC；GC 后对象不存在而 source/rights/provenance/locator 仍在。取证后精确清除 1 user/1 workspace/1 session/5 tasks/4 sources/4 rights/1 document/2 accesses/5 ledger，审计日志保留。
- 远端旧 Task 10 分支经祖先校验后删除，仅 `main`；retention 仅保留 active `6893318…` + rollback `c435c4c…`。精确删除无容器引用、仅属已下线 dev Compose 的 MinIO server/mc 两个镜像后，磁盘 36G/148G（25%）、107G available；保留 390.7MB bounded build cache，无 broad prune。

## 2026-08-30 — Task 9 deployed, production-accepted and merged

- Tasks 1–7 已完成：匿名 DTO 仅暴露 `published + Publication`；R3 发布原子扩大 RO 为 public；generic PATCH 不再接受 visibility；migration 31 保存账号 Evidence 默认折叠偏好；公开 source/approved asset 端点在返回前复验原件、SourceMap、大小与 SHA-256，并隐藏 object key、workspace、验证者和私有 provenance。
- Claim-first Research Folio 已实现 760px 正文 + 280px graphite Evidence rail、3–7 core/child/counter Claim、conditions/limitations、关系型 Evidence、按需原文/页码/归一化区域定位、移动 Radix bottom sheet、焦点返回、账号/匿名偏好与 approved PresentationAsset 的“展示而非证据”分标。Evidence 折叠不使用 `hidden`/`display:none`/`aria-hidden`，SSR、辅助技术与打印保留全文。
- Exact candidate CI `33263991191` / job `99130646214` 全绿；本地全仓 build/typecheck/lint/test、产品视觉 `72/72`、Claim-first Chromium `4/4` 与 Hermes `10/10` 通过。Canonical ECS deploy 应用 migration 31，Parser 16-case、BGE-M3 CPU 实向量、数据库隔离、目标容器、Nginx 与公网/loopback release identity 全绿。
- 真实生产旅程以一次性账号完成 preference CAS、draft→under_review→approved→published、匿名 3 Claims/3 Evidence、3 个可信原文定位；真实 Chromium 再证 Settings、1440px 760/280、375px sheet/focus、print 3/3。夹具数据库行、Blob 与 SourceMap 对象均精确清至 0。
- PR #6 合并为 main `cf63392a…`，远端产品分支删除后仅 `main`。ECS dev 栈/3 卷、390.7MB build cache 与两个未引用旧 Node 镜像精确清理；根盘 `36G/26% → 35G/25%`，生产与回退/模型/沙箱/评测资产保留且健康。

## 2026-08-29 — Main/branch consolidation and Task 9 started

- PR #4 已在精确 CI `33259207780` 全绿后合并为 main `5105b1e…`；旧 PR #3 已关闭，其 9 个独立提交由 annotated tag `archive/hermes-2d-pet-20260829` 保留。GitHub 远端 6 个已合并/被取代分支已删除，收口后一度仅保留 `main`。
- 固定 worktree 已从合并后的 main 创建短分支 `codex/claim-first-public-ro`。Task 9 实施计划登记为 `docs/plans/2026-08-29-hermes-claim-first-public-ro-plan.md`，覆盖 publication-only DTO、R3 publish→public、阅读偏好、Evidence source/asset 安全交付、760/280 页面、移动 sheet、打印/WCAG 与 ECS journey。

## 2026-08-29 — Task 9 backend contracts 1–3 implemented locally

- `82fb874` 将匿名公开读取限制为 `published + Publication`，显式映射 Claims/Evidence/approved PresentationAssets/history，并从 locator/DTO 排除 workspace、验证者、object key、prompt 与私有 provenance；API 81/81、API/Web typecheck 通过。
- `f26d895` 关闭 generic RO PATCH 的 visibility 字段；R3 发布在同一 Serializable 事务内写 Version、Publication、RO public 与 `visibilityFrom/To` 审计，单一确认框明确永久公开 URL/所有人可见；Domain 471/471、API 81/81、Web 417/417。
- `2abf0d6` 增加 core migration 31 `reading_preferences` 与认证 GET/PATCH CAS API：缺省 expanded=`false/version 0`，首次写版本 1，同值幂等，变更递增，用户 ID 只取 session；数据库 21/21、Domain 475/475、API 83/83。生产仍为 core/search `30/30`/`2/2`，migration 31 待最终 ECS 候选部署。
