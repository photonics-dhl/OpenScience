# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-09-02。** 公网 release `405b85a` 全绿、rollback `09093e7`；匿名 Elsevier return 已 fail-closed，浙大/CARSI IdP main-frame gate 已部署。浙大 CAS 对已核对输入明确返回“用户名或密码错误”，故未发布 Cookie/ready；机构 PDF、Task 11 继续阻断，Landing/Hermes 视觉冻结。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 仍为 9/12；独立 ScanSci plan Tasks 1–9 done、Task 10 in progress，Task 11 blocked。
- 当前产品主线是将一次浙江大学 CARSI 认证变成 Hermes 持久默认下载能力，并接通全部产品入口。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Docs branch / code base / origin main: `codex/scansci-auth-credential-blocker-docs` / `405b85a8e1d6b3aec51d2de20ec6ce5b93ab73e4` / `405b85a8e1d6b3aec51d2de20ec6ce5b93ab73e4`
- Production application source / immutable release: `405b85a8e1d6b3aec51d2de20ec6ce5b93ab73e4`
- Rollback: `09093e7e879dbc7e9175e957f217afe5c6eb2e67`; core/search migrations `33/33` / `2/2`
- 本地 `main` 与其他 worktree 有用户改动，不得触碰或用它推断生产；上述 tuple 已从 ECS 重新实测。

## Production truth

- Public `/__release` 与 active marker 均返回 `405b85a…`；API/Web/Worker/Parser/BGE/ScanSci healthy，journal/failed absent，磁盘 58G/148G（41%，84G available），只保留 active+rollback release。Parser 报告 `root:root 0600`、临时 eval/auth 容器为 0。Session 为 `auth_required`；不得把 IdP 访问或 CAS 表单提交冒充机构 PDF 下载完成。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Task 8 accepted

- 计划入口：`docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`。实现包括可信 SourceMap ref、Claim/Evidence CRUD、乐观锁/审计、locator resolver、发布 blockers、narrative snapshot/hash、公开版本不可变、外部权利 fail closed 与 SourceMap redaction。
- SeaweedFS HEAD 不返回自定义 checksum metadata 的生产兼容已在 `4c73469…` 修复：缺 metadata 时对原件做有界流式 SHA-256，同一对象复验只读一次；有 metadata 时仍直接校验。
- Exact CI `33257516418` / job `99113706374` success。ECS parser acceptance 与真实 RO journey 通过：5 source blocks、3 Claims/Evidence、未核验阻断、locator 篡改拒绝、核验后 review/publish、公开页 200、残留用户 0。

## Decisions and hygiene

1. Code locator 已失败关闭：API 不接受 `codeRange`，Domain 也拒绝；待未来 Version 有权威 source revision 后另行开放，禁止把 UUID `commitId` 冒充 Git revision。
2. SourceMap/object-storage 解析已移出 Claim/Evidence Serializable 事务；短事务重新校验 version/manifest/artifact/hash、SourceMap ref 与 CAS 时间戳。
3. `review.analyze` 已在 API payload、Domain submit 和 Worker save 前强绑定 session/payload/version 同一 RO；Worker 只使用持久化任务 payload。
4. Presentation reuse 改为按全部受审 Evidence hash 精确查找，不再依赖可截断的资产前缀。SourceMap 为可共享的内容寻址对象，Task 8 不盲删；GC/retention 在 Task 10 建立全引用扫描后实施。
5. Task 8 已完成。公开页 journey 的 RO 由一次性 fixture 预置为 public；正式“扩大可见性审批”不得借 generic PATCH 绕过。`/opt/openscience-evals` 的 40 个历史工作目录已在生产锁内精确清理，有效 acceptance 报告保留。
7. PR #6 已合并为 main `cf63392a…`；远端分支删除后仅保留 `main`，独立旧 Live2D 历史仍由 `archive/hermes-2d-pet-20260829` tag 保存。
8. Task 9 已生产完成：candidate CI `33263991191` 全绿；R3 publish→public、账号偏好、3 Claims/3 Evidence/source、桌面/移动/打印真实旅程通过；一次性数据库行与对象存储清至 0。
9. ECS dev 栈、3 个 dev 卷、390.7MB build cache 与两个无引用旧 Node 镜像已精确清理；根盘 35G/148G（25%），保留 production/rollback、BGE、沙箱、解析评测与监控数据。
10. Task 10 已生产完成：Semantic Scholar/Tavily/ScanSci legal-only adapter、rights、72h cache、10min one-use download、GC/provenance 均接通；ScanSci 默认 disabled，Tavily 四个授权 key 当前均额度耗尽并显式降级。
11. 真实 Semantic Scholar Hermes 任务返回 3 sources；SeaweedFS checksum metadata 生产兼容经 PR #9 修复。77-byte 自著 PDF 完成 HEAD hash、下载、重放 404、72h 到期和真实 Worker GC；GC 后 provenance/locator 保留，取证后 canary 业务行精确清零、审计保留。
12. Exact CI `33284956868` / job `99186426490` 全绿；最终 release `6893318…`、rollback `c435c4c…`。远端仅 `main`；精确移除无容器引用的旧 dev MinIO server/mc 镜像后，磁盘 36G/148G（25%）、107G available，active+rollback 两个 release，390.7MB bounded build cache 保留，无 broad prune。
13. 用户验收指出 disabled adapter 不能算产品完成。Task 10 已重开：浙江大学 CARSI 登录只在 loopback noVNC 输入，不保存账号密码；Pinned ScanSci 仅持久 publisher Cookie JSON/Netscape 文件，Hermes/Personal Space/RO Hermes/Files-Evidence 走统一下载入口。
14. PR #20–#24 已完成 auth browser isolation、`/usr/sbin/ss`、PID `128→256`、internal `.2:6080` tunnel 与 ECS-compatible `/proc` process probe；PR #24 exact CI `33443570873` 合并并部署为 `cca5908`，rollback `9042ed3`。CARSI 尚未认证。
15. ScanSci plan Task 5 atomic candidate 为 `ff5568f` + `4763228`：Personal RO/SDF、Session、Task/credit/audit 在一笔三次有界 Serializable 事务提交；exact replay 先于余额，P2002 精确绑定 model/constraint，Redis 仅 commit 后投递并保留 pending recovery。Domain/API/Agent 本地门禁 green；两连接 PostgreSQL SSI/mismatch suite 已加入但本地未运行，ECS acceptance pending。
16. ScanSci plan Task 6 local candidate 为 `60b3740`：durable provider state 的事务回滚/重放/generation 矩阵、disabled rollback Secret、非致命 observation persistence 与真实 PostgreSQL migration/concurrency 合同已闭合；Domain 520、Database 26、Worker 501 与 typecheck green，独立复审 READY。Migration 33/真实 suite/CARSI 仍是 ECS-only pending。
17. ScanSci plan Task 7 local candidate 为 `22088c0` + `86e037e` + `3e829db` + `1059072` + `82d4772` + `185d5d6`：public `canRetry` 只来自共享 predicate；marker 只能由 acquisition durable path 构造，generic/public/internal caller 与历史/畸形/撤权均 false。Retry 用三次 P2034-only Serializable authority/CAS/audit，recovery 单次 ID-only SQL 精确筛选后复验，无循环/top-N/payload 泄露；14-case corpus 标注 JSONB/JavaScript-only，PG parity 以独立 terminal sentinel 证明 raw selector 分支。Domain/API/Worker `534/99/502`，real-PG race/parity/deep-history contract 仅 typecheck；既有 Client/Playwright `7/7` 未改，ECS 375px/真实下载和 Task 8 四入口仍 pending。
18. ScanSci plan Task 8 local candidate 为 `8238a9f`：Hermes Drawer、RO Hermes、RO Files/Evidence 与 Personal Space 共用唯一 acquisition/recovery/poll/download；有界双语 + shared DOI/arXiv 确定性分类，Dashboard Personal/RO target、query-only metadata、44px/i18n/dark-paper/within-form 均闭合。Web `462 + 5 Node`、build/typecheck、product `72/72`、Hermes `19/19 + 8/8` green；ECS/CARSI/OA/一次性下载仍 pending。
19. Task 8 fix round `d75ca1c`：Drawer stable key/fingerprint 跨关闭重开且新 intent 换 key；recovery durable target + API strict query + Domain pre-limit target scope，RO route ID 不受 cross-RO task 影响，IME composition Enter inert。Domain/API/Worker/Web `535/101/502/463 + 5 Node`、browser fix `6/6`、product `72/72`、Hermes `19/19 + 8/8` green。
20. 用户授权的例外修复波 `3d23b87` 已关闭 protected-sidecar cleanup ownership 与 canonical Worker image binding：mutation 前拒绝既有 candidate sidecar，unique no-clobber staging/hard-link publication 与 ownership-gated cleanup 经真实函数行为测试；Worker release image ID/source label/运行容器和精确三挂载 fail closed。独立 scoped review 无 Critical/Important，READY。
21. PR #15 已合并为 main `ac086fa`，CI `33375614367` 全绿；ECS exact images、parser acceptance、targetless `0|0` 与真实 retrieval/Squid 门禁通过。首次 canonical deploy 应用 migration 33 后在 ScanSci runtime identity fail-closed，自动恢复旧 release/容器并清除 sidecar/journal；active/public 仍 `6893318`。
22. 根因是 Compose v2.26 默认 `project.working_dir=<release>/infra/compose` 与 strict `<release>` 合同不符。reviewed implementation `453ae4c` 对 current/rollback/state/verifier、凭据轮换、备份和认证隧道全部固定 `--project-directory <release-root>`；独立复审 0 Critical/Important/Minor、READY，本地 build/typecheck/lint/docs/full test 0 fail；PR/CI 与 merged-SHA ECS 重试 pending。
23. PR #16 / CI `33388359242` 已合并为 main `bdf7eb7`。ECS exact Parser acceptance、Compose identity、BGE CPU、legal source/topology/policy/session 与新 API/Web/Worker health 均通过；第二阶段 OA canary 在 local legal endpoint 返回 stable 404 后事务再次完整回滚，active/public 仍 `6893318`，sidecar/journal 清零。
24. 真实诊断证明 pinned ScanSci `Session.trust_env=False` 且只认 `SCANSCI_PDF_PROXY`/`network_proxy`；reviewed `05111e7` 仅把已严格校验的固定 Squid URL 同步到专用变量。PR #17 / exact CI `33397550370` 合并为 main `abd38d3`；ECS schema-v3 16-case Parser acceptance、core/search `33/33`/`2/2`、BGE CPU、ScanSci source/topology/policy/token/session、Worker 与真实 24,671,920-byte arXiv OA PDF canary 全绿，active/public 已 CAS 到 `abd38d3`，rollback `6893318`。
25. `cca5908` tunnel 的 RFB 失败根因是 auth 容器继承 `RLIMIT_NOFILE=1073741816`，触发 LibVNCServer 巨大 fd-limit 扫描。`396b301` 固定 nofile `4096/4096` 并纳入 verifier；PR #25 / exact CI `33447387815`、job `99669426363` 合并为 `36033ae`，ECS exact Parser/BGE/ScanSci/OA/application/public/retention 与真实 auth nofile/HTTP/RFB/network/PID gates 全绿，active/rollback `36033ae` / `cca5908`。
26. `aff435a`/`860b2b0`/`b1d6662` 关闭 tunnel PID-reuse、十次 bounded window 与 auth child TERM 生命周期；PR #26 exact CI `33452984344` / job `99686782627` 合并为 `9eeb8d5`。ECS corpus 目录误设 `0700` 曾使 Worker `EACCES` fail-closed；root-owned `0555/0444` staging 后 Parser acceptance 和完整部署全绿，active/rollback `9eeb8d5` / `36033ae`，临时 eval/诊断对象清零。
27. Strict browser、CPU browser、proxy-only `browser_net`、proof-backed session 与稳定 canary 诊断已合并；PR #36→#37 部署到 `09093e7`，ECS Parser/BGE/ScanSci OA/application/public/retention 全绿。
28. PR #38 / CI `33550018143` 将匿名 publisher bounce 收紧为本次 main-frame 必须经过 `*.zju.edu.cn`/`*.carsi.edu.cn` 后才可取 Cookie；`evilzju.edu.cn` 回归拒绝，ScanSci `174/11/0`、全仓 lint/test 与独立复审 READY。
29. Merge `405b85a` 经 schema-v3 16-case Parser 两阶段 canonical 部署；core/search `33/33`/`2/2`、quota `8/8`、BGE CPU、ScanSci OA、容器/公网/retention 全绿，rollback `09093e7`，验收临时目录与 auth helper 已清零。
30. 生产登录在同一 180 秒窗口内到达 `zjuam.zju.edu.cn`；学号与学校邮箱两种用户名、同一隐藏密码均被 CAS 明确判为“用户名或密码错误”。为避免锁号已停止重试；未保存账号密码，未产生 ZJU/publisher Cookie 或 ready。
31. Constraints：服务器验收为准，本地不运行 Docker；Windows 只用显式 Git Bash 调 canonical wrapper；不读取/打印 `.env`，不 broad prune，不删除未经批准的文件/服务器对象。

## Next action

1. 用户先提供或重置一份可在 `zjuam.zju.edu.cn` 成功登录的当前密码；不要继续重试现有失败凭据。
2. 用 loopback helper 在单一 180 秒窗口内完成 ZJU→Elsevier；固定非 OA canary 必须返回 institutional `%PDF-` 才发布 ready，并在 exact service 重启后仍为 ready。
3. 用真实 institutional PDF 完成四入口/375px/one-use/72h/600s/zero-grey-Tor 与精确磁盘卫生，再关闭 Task 10。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-30-scansci-default-capability-design.md`
4. `docs/plans/2026-08-30-scansci-default-capability-plan.md` 与 `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
5. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`，再读 `docs/progress.md`；`project_index.md` 只定向检索 CURRENT，不要从较旧 `main` 或历史 release 段落推断现状。
