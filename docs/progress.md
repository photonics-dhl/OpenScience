# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-29。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / implementation: `codex/hermes-wanko-live2d` / `c5817121bddbd065c5ecb38811da8e707e6e5d17`；本轮 docs-only HEAD 不改变产品身份。
- Production application/release: `c5817121bddbd065c5ecb38811da8e707e6e5d17`。
- Rollback: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`。
- Taskmaster `hermes-research-intelligence` 当前为 5/12：Tasks 1–3、5–6 done；已部署的 Task 4 因本轮 acceptance debt closeout 暂时重新进入 in-progress。

## 2026-08-29 — Parser acceptance debt closeout opened

- 用户要求继续关闭 6 个 `needs_review`，不以状态翻转制造 false-ready。批准目标为 `14 succeeded / 2 intentional needs_review / 0 failed / 0 false-ready`：Notebook/Python/CSV/XLSX 四个 actionable gap 自动化；损坏 PDF/空白 PNG 保留稳定原因码的正确安全拦截。
- Taskmaster Task 4 follow-up 重新进入执行，生产仍保持 `c581712…`；只有 schema-v3 exact-SHA ECS acceptance、immutable deployment 和生产 runtime 全绿后才能再次 done。
- 只读磁盘审计已定位明确非生产候选：历史 eval 物理约 15G、root pnpm store 5.7G、Docker build cache 2.317G、dnf cache 61M，合计保守约 23.1G；另有最多约 1.11G dangling image layer。active/rollback、BGE、生产卷和备份不在候选内，尚未执行删除。

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
- 下一步先完成 Task 4 parser acceptance follow-up 的 schema-v3、14/2 exact-SHA ECS 验收与生产切换；随后再恢复 Task 7 身份/兴趣静默路由和 Task 10 外部检索/临时 PDF 生命周期。
- Docker、数据库迁移、镜像和最终运行验收仍只在 ECS；Windows 必须显式 Git for Windows Bash + canonical scripts；不读取/打印 `.env`，不安装 GPU 栈，不把展示资产冒充 Evidence。
