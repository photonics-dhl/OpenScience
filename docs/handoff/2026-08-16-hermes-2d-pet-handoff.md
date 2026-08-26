# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-27。** 当前产品主线是 Research Intelligence；Hermes/Landing 视觉阶段冻结，旧候选只从 Git history 查阅。

## Objective and status

- 用户目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster tag `hermes-research-intelligence` 已完成 Task 1–3、5（4/12）；Task 5 `AI Gateway and LLM OCR Routing` 已部署，Tasks 4、6 均已解锁。
- Task 1 建立能力台账、13-case 自著权 corpus 与现状 parser baseline；尚未安装新 parser/OCR/model/MCP。
- Task 5 已完成实现、独立安全/架构复审、精确 CI、ECS 构建、生产部署与运行验收；未新增 schema、migration、seed、研究数据写入或真实付费调用。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / application implementation: `codex/hermes-wanko-live2d` / `f9659668b237b70b4c018b866e20498689d327c2`
- Any subsequent closeout-fix commit is a docs-only descendant resolved by `git HEAD`, never an application release; do not embed a self-hash in this handoff.
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
- Tasks 4 `CPU Parser Cascade Implementation` 与 6 `Semantic Retrieval with BGE-M3 and Hybrid Fusion` 均 ready。按产品依赖先执行 Task 4；任何 Docling/LiteParse/GROBID/PaddleOCR 候选必须先经 corpus/ECS CPU 评测再保留。
- 生产 `.env.prod` 中 MiniMax key 存在且 Vision route disabled；Tavily/Semantic Scholar key 尚未注入生产。它们在 Task 10 有实际 consumer 与权限边界前不提前暴露给容器。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. Taskmaster Task 4 brief/新计划
5. `docs/progress.md`
6. `docs/OpenScience_Kimi_Development_Spec.md` 的相关章节

`project_index.md` 只用 `rg` 定向查 CURRENT；旧 Hermes 视觉计划仅作历史证据。
