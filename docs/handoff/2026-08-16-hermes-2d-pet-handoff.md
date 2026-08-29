# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` Tasks 1–6 已生产部署，完成计数 6/12；Task 4 acceptance debt closeout 已达到 `14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready`。
- Notebook/Python/CSV/XLSX bounded subset、schema-v3 原因码和正式 table locator 已收口；Task 7 与 10 均 dependency-ready，产品顺序先 Task 7。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / implementation HEAD: `codex/hermes-wanko-live2d` / `28a3d5ca681b7744fae521dfa9154100a24e8845`
- Deployed immutable application/release: `28a3d5ca681b7744fae521dfa9154100a24e8845`
- Rollback: `c5817121bddbd065c5ecb38811da8e707e6e5d17`
- 本轮文档收口提交不改变生产 release；候选、docs-only HEAD、main 与 ECS release 不得混写。

## Delivered and verified on ECS

- V2 隔离协议和统一 `DocumentSourceMap`：Markdown/TeX/CSV/XLSX/DOCX/native PDF 确定性解析、provider-neutral layout/GROBID enrichment、本地 Tesseract 选页 OCR、受控 LLM OCR candidate 与 artifact-backed `sdf.extract`。
- Parser 保持 `network=none`、无 Secret、只读、非 root、512 MiB/64 PID；MiniMax Vision 默认 disabled，未晋升 GROBID、PaddleOCR、Docling 或 LiteParse。
- Exact CI run `33235948918` 全绿；ECS schema 3 profile `hermes-parser-14-2-v1` 为 14 succeeded / 2 intentional needs review / 0 failed / 0 false-ready，structured fake 14 / external 0。
- 接受镜像：Agent Worker `sha256:35191f652dfd873fd9f817d567a329a061e2c99eb55049b9898c2ffc2a5ec5aa`；Parser `sha256:aed451e95337219376499fa1ffe9ff5d7854c75f1c96df8d3ca6c5ef5b577dbe`。
- 生产真实 scan startup self-test 的 text/locator/Tesseract/confidence/bbox 五项均通过；BGE runtime 通过；core/search migration 为 `29/29`、`2/2`。
- `.release-id`、loopback/public `/__release` 均为 `28a3d5c…`；失败标记和 durable journal 不存在，关键容器、BGE、core/search `29/29`/`2/2` 均通过。
- 13:58 +0800 只读审计：根盘可用 `73,816,707,072` bytes，release 根物理/表观 `22,499,897,344` / `19,399,624,994` bytes（41 树），eval 根物理 `15,406,067,712` bytes，备份 7 组。本轮无删除。

## Constraints and hygiene decision

- Docker、迁移、镜像和最终运行验收只在 ECS；本地仅代码、静态检查和单测。
- 不读取、打印或提交 `.env` 值；Secret 仅在服务器受控配置中。服务器纯 CPU，禁止 GPU 栈。
- 不删除 migration ledger；不把生成内容冒充 Evidence；生产变更前刷新 branch/HEAD/release/rollback。
- `KEEP`：active/rollback、`28a…` acceptance、生产/BGE/监控卷和备份。`DELETE_CANDIDATE`：失败 `63eb…`/`9e9…`、dangling images、build cache、pnpm/npm/dnf cache。其余 release/eval/dev/tool cache 是 `INVESTIGATE`。
- 任何删除必须先获得用户对精确路径/image/cache 白名单的明示批准；禁止 broad prune/wildcard。Windows 只用显式 Git for Windows Bash + canonical scripts。

## Next action

1. 从 Task 7 身份/兴趣静默路由开始；Task 10 外部检索/临时文档生命周期也已 dependency-ready。
2. 如要回收磁盘，先对 `docs/runbooks/deployment.md` §5.40 的精确 `DELETE_CANDIDATE` 形成用户批准白名单；未批准前不删除。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `docs/runbooks/deployment.md` §5.40

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
