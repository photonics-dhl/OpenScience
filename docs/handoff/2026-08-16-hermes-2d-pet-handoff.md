# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-27。** 当前产品主线是 Research Intelligence；Hermes/Landing 视觉阶段冻结，旧候选只从 Git history 查阅。

## Objective and status

- 用户目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster tag `hermes-research-intelligence` 已完成 Task 1–3、5（4/12）；Task 5 `AI Gateway and LLM OCR Routing` 已部署，Tasks 4、6 均已解锁。
- Task 1 建立能力台账、初始 13-case 自著权 corpus 与现状 parser baseline；Task 4 已将 corpus 升为 schema-v2 16-case，补入表格/公式/参考文献 PDF 与顺序/区域 locator；尚未安装生产 parser/OCR/model/MCP。
- Task 5 已完成实现、独立安全/架构复审、精确 CI、ECS 构建、生产部署与运行验收；未新增 schema、migration、seed、研究数据写入或真实付费调用。
- Task 4 LiteParse `2.14.0` exact-SHA ECS bake-off 已真实完成：image `sha256:b2c9bf96…eaa60f`，7-PDF 为 5 succeeded/1 scan needs_review/1 corrupt failed，13/16 locator，P50 `8 ms`、P95 `163 ms`、peak RSS `61,599,744` bytes；超限/timeout canary 均无 Shell 原文捕获和容器残留。结果通道为 log-driver none 的 64 KiB attached stdout normalizer，Sol High 复审安全；仍须与 Docling/current baseline 同门禁比较，候选保持 `APPROVED_PILOT`、未部署。
- Docling `2.123.0`/MIT 候选已 source-lock 到官方 wheel SHA-256 `95c0a4d…fde9c`，本地无 Docker runner `3/3`、评测脚本 `16/16`、Bash 语法 GREEN；OCR/remote/plugin disabled，模型只在 ECS image build 获取并生成 package/model lock。exact source `efa6367ef4d0bf18a9c4e1c6e073ba338bfe7ee1` 已在 ECS frozen prepare 完成；CPU Torch 层 `sha256:1542d393…924f` 可复用，SciPy/OpenCV/RapidOCR 已拆成独立缓存层。前台 SSH reset 丢失未提交 layer 后，长任务改由 `openscience-parser-eval-docling-efa6367-a2.service` 托管；该 unit 仍在构建，尚无 Docling image/质量/RSS 证据，不得视为已接受。
- Task 6 的 ECS-first TDD 计划与 Task 1 本地候选 harness 已完成：BGE-M3 exact revision `5617a9f…b181`、FlagEmbedding `1.4.2` wheel SHA-256 `35e33a0…9bf2`，16 chunk/24 query 自著双语 corpus、官方 `encode_queries`/`encode_corpus` 分流、content-free metrics、2 CPU/6 GiB/128 PID ECS gate；Python `5/5`、corpus `1/1`、Bash contract/syntax GREEN。计划/静态实现不等于模型已下载、安装或启用；生产 route 仍 disabled。
- Task 6 search migration 2 已完成本地 TDD：五表、tenant 复合外键、locator-safe chunk、generated `tsvector`/GIN、1024×float32 byte/hash/norm 约束、content-free query telemetry 和 rollback；Search `5/5`、Prisma generate/build/typecheck GREEN。它仍是未部署候选，下一步只在 ECS disposable search DB 演练，生产 ledger 保持 `1/1`。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application implementation: `codex/hermes-wanko-live2d` / `f9659668b237b70b4c018b866e20498689d327c2`
- Candidate branch HEAD 由 `git HEAD` 解析；Task 4 后续提交是未部署候选，不得误写成 application release，也不在 handoff 中嵌入 self-hash。
- Deployed application / immutable release: `f9659668b237b70b4c018b866e20498689d327c2`
- Exact implementation CI: run `33002216562`，12m22s；independent review `DEPLOYABLE / CLEAN`。
- Rollback: `ef043ebb8e51332effe75a5639cb207aec7bfc47`
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

## Fixed constraints

- 不在本机启动 Docker；Docker、迁移、镜像与最终运行验收全部只在服务器。
- Windows 禁止裸 `bash`/WSL；必须显式 `C:/Program Files/Git/bin/bash.exe`。
- 不读取、打印、提交 `.env` 值；Secret 只在服务器受控配置中。
- 服务器纯 CPU，无 GPU 预算；Task 5 未安装 BGE-M3、新 parser/OCR 二进制或第三方 MCP。
- Landing/Hermes 视觉冻结；Research Intelligence 工作不得顺带改 UI。
- 不删除历史 migration ledger，不用本地通过替代服务器证据。

## Open risk and next action

- `backup.sh --db` 目前只备份 core。search baseline 仍为空且派生数据可重建；在 Task 6 写入搜索数据或接受真实流量前，必须实现并恢复演练独立 search backup。
- Task 4 `CPU Parser Cascade Implementation` 正在由 ECS systemd unit 执行 Docling 候选 bake-off；先取得同一 7-PDF corpus 的 source-lock、沙箱、质量、locator、P95 与 RSS 结果，再与 LiteParse 比较并决定保留，禁止预选。等待下载期间仅推进 Task 6 的已批准计划/非容器实现；BGE-M3 的镜像构建、模型下载、迁移、运行和最终验收全部在 ECS。
- 生产 `.env.prod` 中 MiniMax key 存在且 Vision route disabled；Tavily/Semantic Scholar key 尚未注入生产。它们在 Task 10 有实际 consumer 与权限边界前不提前暴露给容器。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. Taskmaster Task 4 brief/新计划
5. `docs/progress.md`
6. `docs/OpenScience_Kimi_Development_Spec.md` 的相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；旧 Hermes 视觉计划仅作历史证据。
