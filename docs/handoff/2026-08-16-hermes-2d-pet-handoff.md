# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-28。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 仍为 5/12：Tasks 1–3、5、6 已生产部署；Task 4 parser cascade 尚未完成；Task 7 dependency-ready；Task 10 等待 Task 4。
- CPU parser cascade Tasks 2–7 已完成；Task 8 的两个预部署 breaker 已在 `0ac37fe` 以 TDD 和双复审闭合，exact CI 运行中，ECS Phase B 未启动。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / candidate implementation: `codex/hermes-wanko-live2d` / `0ac37fe6e97ac77eda5c4582f1c4116adacdab33`
- Deployed immutable application/release: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`
- Rollback: `8163f8b4218e529ee4be41bb9fc732ff6497931a`
- Local main / origin main: `b9616cb92dc83437b1b2094291ff43e2a4c34337` / `7eb2f5bc4718ee445b79bd089acb64acb3691e62`
- 候选、main 与 ECS release 不得混写；后续 docs-only HEAD 不改变生产身份。

## Delivered foundation

- 严格 ResearchIdentity/Profile、Claim、Evidence、PresentationAsset、DocumentSourceMap、SourceLocator 与 ExtractionResult 合同。
- V2 隔离 parser 协议；Markdown/TeX/CSV/XLSX/DOCX/native-PDF 确定性解析；provider-neutral layout/GROBID enrichment；本地 Tesseract 选页 OCR；受控 LLM OCR candidate；artifact-backed `sdf.extract` 真实级联组合与执行时 workspace/role/policy 重建。
- MiniMax Vision 缺省 disabled；不晋升 GROBID、PaddleOCR 或 Docling；二进制字节只在 worker，provider SDK/key 不越过 AI Gateway。
- 生产已有隔离 parser/Tesseract/ClamAV/source-map、BGE-M3 与 PostgreSQL lexical search；core/search migration `29/29`、`2/2`，数据库具备独立迁移和恢复边界。
- LiteParse `2.14.0` ECS pilot 为 5 succeeded/1 needs_review/1 failed、13/16 locator、P50/P95 `8/163 ms`、peak RSS `61,599,744` bytes，仍为 `APPROVED_PILOT`，未部署。

## Candidate evidence, not production acceptance

- Candidate `0ac37fe` 已推送；exact-SHA GitHub Actions run `33177667772` 运行中。
- Compiled packaging/geometry `5/5`、Agent Worker `366/366`、typecheck/lint/docs-sync/dependency/duplicate/diff gates 全绿；独立架构与安全复审均为 Critical/Important/Minor `0`。
- 以上只证明代码/CI；没有本机 Docker，也没有 ECS 候选镜像、运行时 corpus、资源峰值或生产部署证据。

## Closed breaker findings

1. `Dockerfile.parser` 的显式 allowlist 已加入两个 native-PDF 模块；compiled packaging contract 从真实 entrypoint 递归相对依赖并验证 spawned child，仍禁止 broad COPY。
2. `native-pdf-text-items.ts` 已直接使用 PDF.js transformed `minY/maxY`；literal 回归覆盖非旋转上下区与 90° 旋转页。

以上只闭合代码阻断；exact CI 与 ECS 镜像/运行时证据未完成，因此不得声称服务器验收或生产可用。

## Fixed constraints

- Docker、迁移、镜像与最终运行验收只在 ECS；本地仅代码、静态检查和单测，不得以本地通过替代服务器证据。
- Windows 禁止裸 `bash`/WSL；PowerShell 必须显式调用 `C:/Program Files/Git/bin/bash.exe` 后再走 `infra/scripts/ssh-run.sh` / `checkup.sh`。
- 不读取、打印或提交 `.env` 值；Secret 仅在服务器受控配置中。服务器纯 CPU，禁止 GPU 栈。
- 不删除历史 migration ledger；不把生成内容冒充 Evidence；生产变更前刷新 branch/HEAD/release/rollback。

## Next action

1. 等待实现 SHA 与本轮 docs closeout SHA 的 exact GitHub CI。
2. CI 全绿后进入 ECS Phase B：exact images、schema-v2 16-case、locator/false-ready、P50/P95、CPU/RSS、worker responsiveness、隔离与清理。
3. Phase B 全绿后才通过 canonical immutable release 部署并复验公网/回滚；失败不修改生产。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/plans/2026-08-27-hermes-cpu-parser-cascade-plan.md`
5. `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/progress.md`
6. `docs/progress.md`

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 或旧 Hermes 视觉计划推断现状。
