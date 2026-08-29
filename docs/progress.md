# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / implementation: `codex/hermes-wanko-live2d` / `c5817121bddbd065c5ecb38811da8e707e6e5d17`；本轮 docs-only HEAD 不改变产品身份。
- Production application/release: `c5817121bddbd065c5ecb38811da8e707e6e5d17`。
- Rollback: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`。
- Taskmaster `hermes-research-intelligence` 为 6/12：Tasks 1–6 done；Tasks 7、10 dependency-ready。

## 2026-08-29 — Task 4 CPU parser cascade deployed

- Exact GitHub Actions run `33221760698` 全绿；本地 release-contract 89 tests（82 pass/7 Windows-only skip）、Agent Worker `373/373`、focused acceptance `91/91`、compiled composition `5/5`、build/typecheck/lint/docs-sync/diff 全绿。
- ECS exact-image 16-case 正式验收为 10 succeeded / 6 needs_review / 0 failed / 0 false-ready，P50/P95 `151.9/1255.32 ms`，并返回 `TASK8_PARSER_ACCEPTANCE_OK` 与 `PARSER_ACCEPTANCE_DEPLOY_CONTRACT_OK`。
- 接受镜像为 Agent Worker `sha256:ae98ea5ffeebb16c145b60207ca7a3b0499afd6e6e370c2c94ad61a45dc7cbe8`、Parser `sha256:0ac86bfc6dbcda36765f0829550735a1c7c6fb248d3d4006d26dc8611d7dc902`；隔离 startup self-test 与生产真实 scan self-test 均通过 text/locator/Tesseract/confidence/bbox。
- Canonical immutable transaction 已把 `c581712…` 部署为 production，rollback 为 `e2c0eaf…`；core/search migration `29/29`、`2/2`，BGE runtime、Nginx、公网/loopback release 与实际镜像身份通过，journal/failure marker 均不存在。
- Parser 仍为 CPU-only、`network=none`、无 Secret、非 root、只读、512 MiB/64 PID；MiniMax Vision 默认 disabled，未调用付费能力，GROBID/PaddleOCR/Docling/LiteParse 均未晋升生产。

## Rollback recovery and hygiene

- 首次候选 `0b431ef…` 在新 Worker startup self-test 因脆弱低分辨率 scan fixture 被 Tesseract 分为 `ULF`/`t2`/`FS` 后自动回滚；生产恢复 `e2c0eaf…` 且无残留。根因是 ECS 运行时 fixture/断词语义，不是本地/服务器依赖漂移或 SSH key。
- TDD 修复 `c581712…` 统一 startup 与 16-case 的 canonical 612×792 scan fixture，并用跨 block locator 语义验证；同一 exact image 的隔离与生产验证均通过。
- 已按精确白名单清理 12 个失败候选 release/acceptance 目录、候选 image tag 和诊断产物；当前 stale count 均为 0、备份 7 组、磁盘可用 72G。active、rollback、生产数据/模型卷和 Git 历史均保留。
- 一次错误 search status CLI 和一次冗余 systemd cleanup 数组引用失败均已识别为操作命令问题；前者用真实 Prisma schema 复核 `2/2`，后者未执行删除且最终只读审计为 0。

## Foundation and next action

- 生产现具备统一 source-map、确定性多格式解析、本地选页 OCR、受控 LLM OCR candidate、ClamAV、BGE-M3、tenant-safe lexical+dense retrieval，以及 core/search 独立迁移与恢复边界。
- 下一步进入 Task 7：身份/兴趣画像与无用户模式开关的 Hermes 静默路由；Task 10 的 Semantic Scholar/Tavily/ScanSci、72h 临时 PDF 和 10min 签名链接已解除 Task 4 依赖。
- Docker、数据库迁移、镜像和最终运行验收仍只在 ECS；Windows 必须显式 Git for Windows Bash + canonical scripts；不读取/打印 `.env`，不安装 GPU 栈，不把展示资产冒充 Evidence。
