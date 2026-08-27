# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-28。** 当前产品主线是 Research Intelligence；Hermes/Landing 视觉阶段冻结，旧候选只从 Git history 查阅。

## Objective and status

- 用户目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster tag `hermes-research-intelligence` 已完成 Task 1–3、5、6（5/12）；Task 6 已生产部署，Tasks 4、7 依赖就绪，Task 10 仍等待 Task 4。
- Task 1 建立能力台账、初始 13-case 自著权 corpus 与现状 parser baseline；Task 4 已将 corpus 升为 schema-v2 16-case，补入表格/公式/参考文献 PDF 与顺序/区域 locator；尚未安装生产 parser/OCR/model/MCP。
- Task 5 已完成实现、独立安全/架构复审、精确 CI、ECS 构建、生产部署与运行验收；未新增 schema、migration、seed、研究数据写入或真实付费调用。
- Task 4 LiteParse `2.14.0` exact-SHA ECS bake-off 已真实完成：image `sha256:b2c9bf96…eaa60f`，7-PDF 为 5 succeeded/1 scan needs_review/1 corrupt failed，13/16 locator，P50 `8 ms`、P95 `163 ms`、peak RSS `61,599,744` bytes；超限/timeout canary 均无 Shell 原文捕获和容器残留。结果通道为 log-driver none 的 64 KiB attached stdout normalizer，Sol High 复审安全；仍须与 Docling/current baseline 同门禁比较，候选保持 `APPROVED_PILOT`、未部署。
- Docling `2.123.0`/MIT 候选已 source-lock 到官方 wheel SHA-256 `95c0a4d…fde9c`，本地无 Docker runner `3/3`、评测脚本 `16/16`、Bash 语法 GREEN；OCR/remote/plugin disabled，模型只在 ECS image build 获取并生成 package/model lock。exact source `efa6367ef4d0bf18a9c4e1c6e073ba338bfe7ee1` 已在 ECS frozen prepare 完成；CPU Torch/SciPy/OpenCV 分层缓存可复用。a2 在 RapidOCR 层因 PyPI read timeout 失败，a3 正以同 exact source 受控重试；尚无 Docling image/质量/RSS 证据，不得视为已接受。
- Task 6 已在 exact implementation `8163f8b…` 完成 locator-safe chunk、tenant-safe BM25、bounded BGE protocol、1024 维 dense exact search、RRF、幂等异步索引、词法降级、search migration 2、双库备份恢复与隔离生产拓扑；独立架构/安全/最终复审均为 deployable。
- BGE-M3 ECS gate 锁定 revision `5617a9f…b181`、model manifest `08cc5a6…78e4`、package freeze `dc2bc38…fc3`，16 chunks/24 queries 得 nDCG@10 `0.996655`、Recall@10 `1`、P50/P95 `232/240 ms`、peak RSS `2,244,235,264` bytes、GPU package 0；生产 image `sha256:137352df…0a3e`。
- 数据库 URL 曾因不安全的临时容器 argv 诊断进入受控工具输出；失败 unit 立即停止、一次性数据库清理、应用凭据由 `openscience-db-credential-rotation-20260827-a2.service` 完成轮换，仓库未写入 Secret。轮换脚本只使用 active immutable release Compose，并以 `flock` 单飞、mutation-intent 和旧/旧或新/新补偿保证状态安全；当时生产恢复并验证为 release `f965966…` exact images/mounts/health/public marker。禁止再以 `docker run -e SECRET=value` 启动可诊断任务。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application implementation: `codex/hermes-wanko-live2d` / `8163f8b4218e529ee4be41bb9fc732ff6497931a`
- Candidate implementation HEAD / deployed immutable release: `8163f8b4218e529ee4be41bb9fc732ff6497931a`；后续 docs-only closure commit 不改变 application release。
- Rollback: `f9659668b237b70b4c018b866e20498689d327c2`
- Local main / origin main: `b9616cb92dc83437b1b2094291ff43e2a4c34337` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`
- docs-only 后续 HEAD 不改变 production application/release；不得从较旧 main 推断现状。

## Delivered foundation

- 严格 ResearchIdentity/Profile、Claim、Evidence、PresentationAsset、locator 和 ExtractionResult 合同。
- 公开 Version 的 3–7 core Claim、同 RO/version、父子关系与无环校验；发布校验与状态改变处于同一 Serializable 事务，不存在 generic approved→published 绕过。
- Task 3 严格 DocumentSourceMap、SourceLocator 生成/解析及 parser boundary 已完成；未知字段、跨 artifact/hash/versioned map locator 与空/boilerplate-only 成功解析均被拒绝或转 `needs_review`。二进制字节仍仅在 worker，provider SDK/key 未越过 AI Gateway。
- Task 5 新增独立 OCR provider pool、Gateway-owned versioned prompt、页面/结构/尺寸/总量硬边界、严格 external-processing policy、运行时 kill switch、逐页 fallback 与 `llm_ocr_candidate` 来源标记。
- MiniMax VLM 仅允许两个官方 origin 和 `/v1/coding_plan/vlm`；prompt/image/OCR text/key/raw payload 不入日志。Vision 缺省 disabled，凭据轮换、Task 4 trusted policy 与获批 paid canary 前不得启用。
- Exact candidate `ef043eb` 的 GitHub Actions run `32992769105` 在临时 major outage 中仍于 12m18s 成功完成 build、typecheck、lint、unit、product visual 与 Hermes gates；临时 PR #5 已未合并关闭，PR #4 仍开放。
- 核心 Prisma migration 28：5 张 Research Intelligence 表、normalized asset-claim 关联、scoped composite FKs/unique keys，以及可重放 rollback ledger 清理。
- 独立 `packages/search` client、`infra/search` schema/migration ledger、`SEARCH_DATABASE_URL` 和 core/search physical-isolation verifier。
- 部署链在同一受控环境中迁移 core/search，URL 不经 CLI 输出；无 provider SDK、模型、parser 或二进制资产进入数据库。
- CI run `32977425693` 对 exact SHA `e0828a6` 全绿。WebGL context-loss 恢复按钮的 accessible name 回归已闭合，不改变 Hermes 构图。

## ECS acceptance evidence

- 所有 Docker、数据库、镜像和部署操作均在 ECS；Windows 仅以显式 Git for Windows Bash 调用 `infra/scripts/ssh-run.sh`、`checkup.sh`、`deploy.sh`。
- Disposable DB：core/search migrate → rollback → reapply 全绿；core 28、5 表、9 scoped constraints，search 1；临时 DB 已清理。
- Task 5 final gates：AI Gateway `48/48`、worker `102/102`、full typecheck/lint/unit/build/docs/diff 通过；未启动本地 Docker。ECS preflight：disk 22%、available memory 26GiB、ingress 200、egress 204。
- Production：backup `452K files=7/7` 后 canonical `deploy.sh --skip-migrate` 部署 `f965966...`；服务器 full build、core current `28/28`、search `1/1`，所有目标容器 healthy，`AI_GATEWAY_OCR_CONTRACT_OK`。
- core ledger 29 条 active 记录中的额外一条 `20260809010000_ro_create_idempotency` 是需保留的历史记录；failed migrations 为 0。
- Parser/Worker 使用 exact SHA images；Parser 保持 `network=none`、read-only、user `node`、512 MiB/64 PID，仅挂载 `/parser-jobs`，无 secret-named env；production worker 输出 `DOCUMENT_PARSER_CONTRACT_OK`。
- Public/loopback `/` 200，受保护 auth/admin 路径 401，exact release marker 正确，`.release-failed` 不存在；rollback tree `ef043eb...` 保留。
- 2026-08-27 credential rotation 后版本身份复验：Parser/Worker image 均为 `f965966…`，API/Worker/Web 均挂载该 immutable release；Parser 不挂 release root 且仅挂 `/parser-jobs`。巡检 public/local 200、egress 204、105 GiB 可用磁盘、26 GiB available memory。
- Task 6 终验：release file、公网 `/__release` 均为 `8163f8b…`，`.release-failed` absent；embedding 为 internal-only、non-root/read-only、2 CPU/6 GiB/128 PID。停服时真实词法降级、恢复后 strict vector canary 均通过。
- 双库集合 `db-set-20260827T155422Z-1676593` 已恢复到隔离临时库；core/search schema 与 data hash 比对通过，恢复库按不删除规则保留。

## Fixed constraints

- 不在本机启动 Docker；Docker、迁移、镜像与最终运行验收全部只在服务器。
- Windows 禁止裸 `bash`/WSL；必须显式 `C:/Program Files/Git/bin/bash.exe`。
- 不读取、打印、提交 `.env` 值；Secret 只在服务器受控配置中。
- 服务器纯 CPU，无 GPU 预算；BGE-M3 仅作为受限 CPU 平台服务运行，禁止安装 GPU 栈。
- Landing/Hermes 视觉冻结；Research Intelligence 工作不得顺带改 UI。
- 不删除历史 migration ledger，不用本地通过替代服务器证据。

## Open risk and next action

- 双库备份/恢复已闭合；恢复临时库、旧评测镜像和模型卷仍占磁盘，未经用户明确批准不得删除。`audit:knip`/`audit:dep` 的既有 hygiene debt 仍为红，但不阻断 Task 6 生产链。
- Task 4 Docling 仍无可接受 image/质量/RSS 证据；取得同一 7-PDF corpus 完整门禁后再与 LiteParse/current 比较，禁止预选。Task 7 已解锁，所有部署验收继续只在 ECS。
- 生产 `.env.prod` 中 MiniMax key 存在且 Vision route disabled；Tavily/Semantic Scholar key 尚未注入生产。它们在 Task 10 有实际 consumer 与权限边界前不提前暴露给容器。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. Taskmaster Task 4 brief/新计划
5. `docs/progress.md`
6. `docs/OpenScience_Kimi_Development_Spec.md` 的相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；旧 Hermes 视觉计划仅作历史证据。
