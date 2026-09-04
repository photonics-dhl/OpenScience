# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-04 +08。历史由 Git 保存；旧计划不作为默认输入。

## Current version tuple

- Local candidate: detached `7593e82e8a309ffcaaa8092b5628c53a0fec444a`（PR #70 merged，**not deployed**）。
- Production release / rollback: `e23a94f6622bb65e33ddbfe290970a9e6366567a` / `4bba4e5f634d51febe8e0aa08b306b3aadd7305e`；core/search `36/36` / `2/2`。
- Taskmaster `hermes-research-intelligence` 仍为 9/12。机构条目精确选择已通，但 ZJU CAS 未建立认证会话；订阅 PDF、四入口/72h/600s 仍 pending。

## 2026-09-04 — ScanSci institutional target blocked before release

- 生产 `e23a94f…` / rollback `4bba4e5…` healthy；只有官方 `scansci-pdf==1.13.1` 单 MCP。ScanSci wheel/Chromium 层和 BGE 模型/依赖层均复用缓存，未安装第二套运行时。
- PR #68 / CI `33835200273` 和 PR #69 / CI `33838217748` 修复浙大双语名、Elsevier ARIA 选项；PR #70 / CI `33840879274` 精确接受当前公开标签 `浙江大学(Zhejiang University) (Zhejiang University Library)`，继续拒绝附属医院近似项。
- 未发布候选 `7593e82…` 直接验收 DOI `10.1016/j.physleta.2025.130846`：`selected=2`、`exact_not_found=0`。账号只提交一次，但后续官方下载仍 `CAS login required=2`、`pdf_captured=0`，因此候选不发布。临时服务已恢复正式镜像，8 PID / 0 Chromium。
- 下一步只是获取可成功完成 CAS/二次认证的会话，先直接下载目标 PDF；成功前不发布，不重复跑全仓/视觉门禁。

## 2026-09-03 — ScanSci persistent session and PDF download accepted

- PR #58 / exact CI `33730045672` 合并为 `f9dbd59…`；canonical ECS transaction 通过 exact Parser report、core/search `36/36` / `2/2`、BGE、ScanSci image/tools/storage/Worker、API/Web/Worker health、Nginx/public CAS、retention 与 journal-clear，rollback 为 `2313038…`。
- 浙江大学 CARSI/publisher Cookie 由 active helper 导入并返回 `SCANSCI_COOKIE_IMPORT_OK`。持久文件 UID 10001、mode `0600`、单链接且非空；host/container staging、`.next`、cleanup marker 和本机认证临时目录均已清理。
- 单独重建 `scansci-mcp` 后，runtime verifier 与持久 session 复核通过。DOI `10.1016/j.physleta.2023.129241` 下载为有效 PDF（1,382,940 bytes，SHA-256 `fe441330f962ab8c178071ea8b864cbfc1baf953b27ade5d4cf5c80a2ba70aa1`），重复调用命中相同文件/哈希。
- 该下载的实际 source 为 `SemanticScholar`，所以本轮满足用户指定的“ScanSci 可正常使用与下载文献”，但不冒充 subscription-only institution provenance。首次浏览器路径后 ScanSci 为 healthy，但约 402/512 PIDs；后续需用真正无 OA fallback 的 DOI 验证 publisher source，并在必要时单独修复 Chromium 生命周期/PID 预算。

## 2026-09-03 — ScanSci CARSI import and browser-proxy fix candidate

- PR #54 / CI `33712614976` 的 Cookie 中断清理与机构权利绑定已随 main `e72291f…` canonical deployment 上线；public/active 一致、目标容器 healthy、journal/failed absent、core/search `36/36` / `2/2`。
- 浙江大学统一身份 CARSI 成功进入 ScienceDirect；active helper 先后导入 CARSI 与 publisher cookies，均返回 `SCANSCI_COOKIE_IMPORT_OK`，主机/容器 staging 与本机敏感临时文件已清理。
- PR #57 / CI `33726541805` 的 `0600` 原子持久化与新 context 恢复已随 `2313038…` canonical deployment 上线。真实导入发现嵌入程序把 base64 payload `argv[1]` 误计为三个路径之一；helper 安全退出并证明主机/容器 staging、`.next`、cleanup marker 均 absent。候选 `9729005…` 将路径起点改为 `argv[2]`；RED→GREEN 后 runtime/helper `7/7`、`bash -n`、lint green。下一步 PR/CI、部署、重新导入、download/recreate/repeat 与四入口验收。

## 2026-09-03 — Academic identity progression deployed

- `e72291f…` 已整合注册用户→主邮箱验证→ORCID OAuth→机构邮箱验证的四阶段进度，并完成 canonical deployment。
- credential 与 scoped-role assignment 分离；同一用户可同时持有 RO author、assignment reviewer、journal editor、organization member 等作用域角色，凭证本身不自动授权。
- core migration 35 为身份凭证、机构邮箱挑战与多作用域角色；migration 36 增加 ROR 全球机构目录。生产 migration ledger 为 `36/36`。
- 本地 ROR v2.12 已导入 137,398 家机构（0 rejected，34,466 家含域名）；发布时须在生产迁移后执行同版本导入并核对计数。

## 2026-09-03 — ScanSci institutional acceptance fix candidate

- 候选 `a722099…` 在 Cookie 写入容器前即登记退出清理责任，避免中断后遗留部分敏感文件；helper contract 已覆盖 source-order 和 cleanup。
- Agent Worker 现优先识别官方 MCP 的明确机构来源标签（含 `institutional:*`、CARSI/WebVPN/EZProxy/CampusConnector），映射为用户绑定、72 小时有效的 `institutional_access`，不再降级为泛化 `source_retrieval`。
- RED→GREEN 后 focused retrieval `18/18`、Domain rights `6/6`、helper contract、Agent Worker typecheck、全仓 build/typecheck/lint 均通过；独立复审无 Critical/Important、结论 READY。下一步是 PR/CI、canonical ECS 部署，再执行一次机构登录、Cookie 导入和正向下载旅程。

## 2026-09-03 — Official-only ScanSci final release and hygiene closeout

- 09:17 +08 只读复核：公网与 loopback HTTPS 200，目标容器健康，active/public `80db41e…`、rollback `761b93d…`，failed/journal absent，core/search migrations `34/34` / `2/2` current；根盘 `50G/148G`，可用 `92G`。
- PR #47 首次上线 `761b93d…`；PR #50 / CI `33653209566` 合并为最终 `80db41e…`。生产只运行 upstream `scansci-pdf==1.13.1` 的单一 streamable-HTTP MCP；Agent Worker 通过正式 SDK 调用完整 17 tools。旧 `scansci-legal`、自制 auth/browser/noVNC、服务 token、专用网络/防火墙代码均已从仓库和服务器 release retention 中移除。
- ECS canonical transaction 通过 exact Parser report、BGE CPU、core/search `34/34`/`2/2`、MCP image/tools/storage、Worker-origin `tools/list`、真实 OA PDF、API/Web/Worker/Nginx/public CAS/retention；active/public `80db41e…`，rollback `761b93d…`，journal/failed absent。
- 首轮精确移除 2 个旧网络、7 个旧卷、2 个旧 auth image tag、旧 systemd/drop-in/iptables/Squid browser 规则、宿主旧 Secret 和 29.21GB inactive cache。最终再清 38 个旧 Parser acceptance、5 个 eval、1 个匿名失败容器、所有 dangling image 与 154.3MB builder cache；现仅保留 active/rollback 两个 release/report，旧 runtime counters 均为 0。
- 根盘最终 `50G/148G（35%）`、可用 `92G`；Docker images `22.71GB`、产品卷 `6.893GB`、build cache `0`。两套正式 BGE/ScanSci 镜像是 active/rollback，不冒充冗余；保留 `scansci-data`、`scansci-papers`、数据库、对象存储、BGE、监控和备份，未运行 system/volume prune。
- 官方机构认证改为管理员从普通浏览器导出 Netscape Cookie，再由 active release 的 `import-scansci-cookies.sh` 调用上游 `scansci_pdf_login(kind=cookie_import)` 导入持久 `scansci-data`；不再部署第二浏览器。机构 PDF 与四入口正向验收仍 pending，不能冒充已完成。

## 2026-09-02 — ScanSci IdP gate deployed; ZJU credential blocked (`405b85a`)

- PR #38 / CI `33550018143` 将 Cookie 捕获绑定本次 main-frame ZJU/CARSI IdP 访问；匿名 bounce 与 `evilzju.edu.cn` 均 fail-closed。ScanSci `174 pass / 11 skip`、全仓 lint/test、独立复审全绿。
- Merge `405b85a` 完成 schema-v3 16-case Parser 两阶段 ECS 发布；core/search `33/33`/`2/2`、quota `8/8`、BGE CPU、ScanSci OA、API/Web/Worker/Nginx/public CAS/retention 全绿。
- 生产 helper 在单一 180 秒窗口到达 ZJU CAS；学号与学校邮箱两种用户名均被 `zjuam.zju.edu.cn` 明确判为“用户名或密码错误”。已停止重试，未保存凭据、未发布 Cookie/ready。
- active/rollback `405b85a` / `09093e7`；磁盘 58G/148G（41%，84G available），仅两个 release，Parser report `0:0:600:1`，eval/auth/journal/failed 均清零。

## 2026-09-01 — Snapshot fix deployed; CARSI false-positive isolated

- PR #28 exact CI `33461988607` / job `99713876656` 合并为 `2019f8a`。ECS schema-v3 Parser、BGE CPU、core/search `33/33`/`2/2`、ScanSci OA、API/Web/Worker/Nginx/public CAS/retention 全绿；active/rollback `2019f8a` / `9eeb8d5`，journal/failed absent，磁盘 50G/148G、92G available。
- 请求快照现真实满足 `cache_dir == snapshot`，但安全诊断仍为 Cookie 1 个/JSON 5 records、state `auth_required` generation 16、persistent/snapshot load 均 0。Requests、CPU Chromium、ECS direct 与本机 7890 tunnel 对同一 ScienceDirect article/PDF 均为 403、无 SSO redirect、无 PDF magic。
- Pinned 1.11.0 只凭 publisher URL 或 Cookie 数量即可把 403 误报登录成功；其 `try_carsi` 实际是浏览器源，而生产 legal image 无 Chromium/Patchright/Xvfb。故此前 `ready` 与 helper 自动退出不是机构下载完成证据，Step 5 已诚实重开。
- Strict browser Tasks 3A/3B `2756952` / `781e830` 已完成：job/DOI-bound proof 与 browser failure 终态、pinned dirfd、严格单次 Patchright、上游 AST/signature guard、CDP 1 MiB 流式捕获（100 MiB/响应、8 候选/150 MiB/job）、ScanSci exact-output 唯一绑定、180s worker/210s client、进程组回收、心跳、运行中 stale cleanup 与 pinned profile workspace。RED→GREEN 后 ScanSci `135 pass / 11 platform skip / 0 fail`；安全/架构多轮 Important 全闭合并 READY。Task 3C 及 ECS Linux/runtime 验收 pending。

## 2026-08-31 — ScanSci Task 10 controlled-egress production retry

- PR #15/#16 两次 canonical retry 分别在 Compose working-dir identity 与 pinned client 忽略通用 proxy 处 fail-closed，均完整恢复 `6893318`、清除 sidecar/journal；`453ae4c` 固定所有 Compose `--project-directory`，`05111e7` 仅把严格校验的 Squid URL 映射为 `SCANSCI_PDF_PROXY`。
- PR #17 / exact CI run `33397550370`、job `99505612016` 合并为 main `abd38d3`。ECS 新 SHA schema-v3 16-case Parser acceptance、core/search `33/33`/`2/2`、BGE-M3 CPU、ScanSci source/topology/policy/file-limit/token/session 与 API/Web/Worker health 全绿。
- canonical post-switch Worker+ScanSci OA 门禁真实下载 `arXiv:2009.06045v1`，route `open_access`、PDF magic `%PDF-`、24,671,920 bytes；Squid 记录 `172.24.0.2 -> arxiv.org:443 -> FIRSTUP_PARENT/127.0.0.1`。active/public CAS 到 `abd38d3`，rollback `6893318`，journal/failed/pending 均 absent；CARSI 仍 `auth_required`。
- 发布后独立 checkup 与 exact working-dir 复核全绿。删除历史 parser-eval/悬空镜像并按 `>24h + keep 4GB` 清 54 个 BuildKit 对象，释放约 586MB；磁盘 `44G/148G`（31%，98G available），保护对象均保留。PR #18 / CI `33404431776`（13m10s）以 red→green 合同把 release metadata 移到稳定 Chromium 层之后，merged main `a08237a`，不单独部署。下一步只剩 CARSI、四入口/375px、one-use 与 72h/600s 生产旅程。

## 2026-08-31 — ScanSci Task 9 local security/release gate

- 用户明确授权的例外修复波 `3d23b87` 已关闭最终两项 Important：任何既有 candidate/protected rollback sidecar 均在 mutation 前拒绝，真实 publish/CAS-failure cleanup 只删除本事务唯一 staging/owned sidecar；canonical verifier 内部派生 release-tagged Worker image，核验 source label、运行 image ID 与精确三个挂载。独立 scoped review 无 Critical/Important，结论 READY。新鲜全仓 build/typecheck/lint/test green：release `97/104`、ScanSci `82/89`、Web `469`、Domain `535`、Worker `503`、API `101`，失败 0；22 skips 均为 Linux/ECS gate。两项 bounded hygiene Minor（部分 unique staging 写失败残留、早期 dangling symlink 检查）记录到 Task 10 ECS preflight/清理，不影响 canonical/protected state。
- 禁用词精确扫描 58 个命中均为 fixed false、拒绝/compatibility 逻辑或 adversarial test；`audit:knip`、`audit:dep`（831 modules / 1936 dependencies）和 `audit:deps` green。全仓 build/typecheck/test green：release `95/102`（7 skips）、ScanSci `82/89`（7 Windows/POSIX skips）、Web `469`、Domain `535`、Worker `503`、API `101`；本机总计 `2115 pass / 22 skip / 0 fail`。Linux CI 将执行真实 RLIMIT/child 继承用例。
- 本地候选不等于生产：ECS 仍为 `6893318` / `c435c4c` / core-search `32/32`-`2/2`，ScanSci disabled。Migration 33、Linux negative-cache/硬 file limit/NAT64/serial/256 MiB runtime、真实 OA/CARSI、四入口、72h GC、zero-grey/Tor 与 exact rollback/retention 均留给 Task 10。

## 2026-08-30 — ScanSci Task 8 local review candidate

- `8238a9f` + fix rounds `d75ca1c` / `c0bcf0a` 接通并加固 Hermes Drawer、RO Hermes、RO Files/Evidence：Drawer intent 自持 stable key/SHA-256 fingerprint，并在 generic history recovery 前 exact replay；Dashboard 固定 Personal、RO route ID 为唯一 target authority；IME composition Enter 不提交。
- Durable payload server-stamp target；API 严格 target 组合；active/retryable/terminal 均在 limit 前做 user/authority/target 筛选，Web 不再 global-then-filter。Domain `535`、API `101`、Worker `502`、Web `463 + 5 Node`、19-route build/typecheck、browser fix `6/6`、product `72/72`、Hermes `19/19 + 8/8` green。
- 这是本地 review candidate；生产仍为 `6893318` / `c435c4c` / core-search `32/32`-`2/2`。ECS 375px、真实 OA/CARSI、一次性下载与部署仍属 Task 10，不能标 done。
- Task 10 部署前须只读确认 targetless durable ScanSci task 数为 0；非零即阻断并另行决策，本轮不自动回填或扩 migration。
