# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-29。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 6/12：Tasks 1–6 已完成；Task 4 CPU parser cascade 已生产部署，Tasks 7、10 dependency-ready。
- Task 4 不再是阻断项；后续优先实现 Task 7 身份/兴趣静默路由，再推进 Task 10 外部检索与临时文档生命周期。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / implementation: `codex/hermes-wanko-live2d` / `c5817121bddbd065c5ecb38811da8e707e6e5d17`
- Deployed immutable application/release: `c5817121bddbd065c5ecb38811da8e707e6e5d17`
- Rollback: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`
- 本轮文档收口提交不改变生产 release；候选、docs-only HEAD、main 与 ECS release 不得混写。

## Delivered and verified on ECS

- V2 隔离协议和统一 `DocumentSourceMap`：Markdown/TeX/CSV/XLSX/DOCX/native PDF 确定性解析、provider-neutral layout/GROBID enrichment、本地 Tesseract 选页 OCR、受控 LLM OCR candidate 与 artifact-backed `sdf.extract`。
- Parser 保持 `network=none`、无 Secret、只读、非 root、512 MiB/64 PID；MiniMax Vision 默认 disabled，未晋升 GROBID、PaddleOCR、Docling 或 LiteParse。
- Exact CI run `33221760698` 全绿；ECS 16-case 为 10 succeeded / 6 needs_review / 0 failed / 0 false-ready，P50/P95 `151.9/1255.32 ms`。
- 接受镜像：Agent Worker `sha256:ae98ea5ffeebb16c145b60207ca7a3b0499afd6e6e370c2c94ad61a45dc7cbe8`；Parser `sha256:0ac86bfc6dbcda36765f0829550735a1c7c6fb248d3d4006d26dc8611d7dc902`。
- 生产真实 scan startup self-test 的 text/locator/Tesseract/confidence/bbox 五项均通过；BGE runtime 通过；core/search migration 为 `29/29`、`2/2`。
- `.release-id`、loopback/public `/__release` 均为 `c581712…`；失败标记和 durable journal 均不存在，关键容器健康。
- 卫生收口后备份为 7 组、失败候选 release/acceptance/image tag 为 0，磁盘可用 72G；只清理精确白名单，保留 active、rollback、生产卷与 Git 历史。

## Incident and correction

- 首次候选 `0b431ef…` 的 CI、16-case 和部署前门禁通过，但新 Worker 因低分辨率 startup fixture 被 Tesseract 分块为 `ULF` / `t2` / `FS` 而 unhealthy；事务自动回滚到 `e2c0eaf…`，未留下失败生产状态。
- `c581712…` 以 TDD 统一 startup 与正式 acceptance 的确定性 scan fixture，并按跨 block locator 语义验收；同一 exact image 隔离自检和生产自检均通过。
- 一次错误的 search migration CLI 路径已改用真实 Prisma schema 入口复核 `2/2`；冗余 cleanup systemd 命令的 Bash 数组引用失败未执行删除，随后只读审计确认目标已清零。两者均为操作命令问题，不是生产故障。
- Windows 远程入口始终是显式 Git for Windows Bash + canonical SSH 脚本；不得再把 shell 选择错误误报为 SSH key 失败。

## Fixed constraints

- Docker、迁移、镜像和最终运行验收只在 ECS；本地仅代码、静态检查和单测。
- 不读取、打印或提交 `.env` 值；Secret 仅在服务器受控配置中。服务器纯 CPU，禁止 GPU 栈。
- 不删除 migration ledger；不把生成内容冒充 Evidence；生产变更前刷新 branch/HEAD/release/rollback。

## Next action

1. 完成本轮 docs-only 提交并取得 exact-SHA CI；生产继续保持 `c581712…`。
2. 进入 Task 7：注册身份采集、兴趣画像与无显式模式开关的 Hermes 静默路由。
3. 并行设计 Task 10 的 Semantic Scholar/Tavily/ScanSci 适配、72h 临时 PDF 和 10min 签名链接；生产启用仍逐项过能力台账门禁。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/progress.md`
5. `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/progress.md`

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 推断服务器现状。
