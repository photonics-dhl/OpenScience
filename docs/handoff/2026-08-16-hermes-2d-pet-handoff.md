# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-28。** 产品主线是 Research Intelligence；Landing/Hermes 视觉冻结，旧候选只从 Git history 查阅。

## Goal and state

- 目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 仍为 5/12：Tasks 1–3、5、6 已生产部署；Task 4 parser cascade 尚未完成；Task 7 dependency-ready；Task 10 等待 Task 4。
- CPU parser cascade Tasks 2–7 已完成代码与独立复审；Task 8 在最终预部署 breaker 复审中被阻断，ECS Phase B 未启动。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / candidate HEAD: `codex/hermes-wanko-live2d` / `6268be376b70378e78fb09ee0f129abfd83ccc33`
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

- Candidate `6268be3` exact-SHA GitHub Actions run `33173849289` / job `98857320148` 成功。
- Focused `139/139`、Agent Worker `366/366`、compiled composition `2/2`、API `68/68`；build/typecheck/lint/audits/docs/diff/credential gates 全绿。
- 以上只证明代码/CI；没有本机 Docker，也没有 ECS 候选镜像、运行时 corpus、资源峰值或生产部署证据。

## Blocking findings

1. `apps/agent-worker/Dockerfile.parser` 的显式 copy allowlist 漏掉 `dist/parsers/native-pdf-contract.js` 与 `dist/parsers/native-pdf-text-items.js`；完整 workspace tests 看不到该打包缺口，真实 parser image 会启动失败。
2. `native-pdf-text-items.ts` 对 PDF.js viewport 已转换的 top-left Y 再次翻转，导致原生 PDF locator 垂直位置错误；需用 transformed `minY/maxY` 并覆盖上下非对称及旋转页测试。

按 SDD fix round 5/5 上限，Task 8 当前为 `BLOCKED`；不得继续派发修复循环或启动 Phase B，直到下一轮明确恢复任务。

## Fixed constraints

- Docker、迁移、镜像与最终运行验收只在 ECS；本地仅代码、静态检查和单测，不得以本地通过替代服务器证据。
- Windows 禁止裸 `bash`/WSL；PowerShell 必须显式调用 `C:/Program Files/Git/bin/bash.exe` 后再走 `infra/scripts/ssh-run.sh` / `checkup.sh`。
- 不读取、打印或提交 `.env` 值；Secret 仅在服务器受控配置中。服务器纯 CPU，禁止 GPU 栈。
- 不删除历史 migration ledger；不把生成内容冒充 Evidence；生产变更前刷新 branch/HEAD/release/rollback。

## Next action

1. 修复 parser 镜像 allowlist 并新增真实 packaging-contract 回归。
2. 修复 PDF.js Y 几何，新增 asymmetric top/bottom 与 rotated-page 测试。
3. 生成新 exact SHA，完成独立架构/安全复审与 CI。
4. 仅在全部通过后进入 ECS Phase B：exact images、schema-v2 16-case、locator/false-ready、P50/P95、CPU/RSS、worker responsiveness、隔离与清理；失败不修改生产。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
4. `docs/plans/2026-08-27-hermes-cpu-parser-cascade-plan.md`
5. `.superpowers/sdd/2026-08-27-hermes-cpu-parser-cascade-plan/progress.md`
6. `docs/progress.md`

`project_index.md` 只用 `rg` 定向查 CURRENT；不要从较旧 `main` 或旧 Hermes 视觉计划推断现状。
