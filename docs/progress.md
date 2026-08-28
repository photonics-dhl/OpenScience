# OpenScience 进度（CURRENT window）

> 最新同步：2026-08-28。历史由 Git 保存；旧计划和 archive 不作为默认输入。

## Current version tuple

- Branch / candidate HEAD: `codex/hermes-wanko-live2d` / `6268be376b70378e78fb09ee0f129abfd83ccc33`。
- Production application/release: `e2c0eaf3b13a220a8bc2cd49b2c1dfe40a6fd61f`。
- Rollback: `8163f8b4218e529ee4be41bb9fc732ff6497931a`。
- 候选 HEAD 与生产 release 严格分离；Task 8 Phase B 未启动，生产没有修改或重新部署。

## 2026-08-28 — CPU parser cascade 预部署阻断

- Task 2–7 已完成代码与独立复审：V2 隔离协议、确定性多格式 `DocumentParser`、provider-neutral layout/GROBID enrichment、本地 Tesseract 选页 OCR、受控 LLM OCR candidate、`sdf.extract` 真实级联组合与执行时权限重建均已落地。MiniMax Vision 仍默认 disabled，未晋升 GROBID/PaddleOCR/Docling。
- Task 8 候选 `6268be3` 的 exact-SHA GitHub Actions run `33173849289` / job `98857320148` 成功；focused `139/139`、Agent Worker `366/366`、composition `2/2`、API `68/68`，build/typecheck/lint/audits/docs/diff/credential gates 全绿。这些仅是代码/CI 证据，不是生产验收。
- 最终 breaker 复审发现两个真实阻断：`Dockerfile.parser` allowlist 漏拷 `native-pdf-contract.js` 与 `native-pdf-text-items.js`，会导致打包后的 parser service 启动失败；PDF.js viewport 坐标已是 top-left，当前实现再次翻转 Y，导致原生 PDF locator 垂直位置错误。
- 按 SDD 5/5 修复回合上限，Task 8 标记 `BLOCKED`。必须先补镜像 packaging-contract 回归，修复 Y 几何并增加上下非对称及旋转页测试，再生成新 exact SHA、完成复审与 CI，之后才允许进入 ECS Phase B。
- 没有运行本机 Docker；没有启动 ECS 候选部署、迁移、provider 调用或生产写入。

## Production foundation retained

- Research Intelligence Taskmaster 仍为 5/12：Tasks 1–3、5、6 已部署；Task 4 的 parser candidate 工作尚未完成，Task 7 dependency-ready，Task 10 等待 Task 4。
- 生产现有隔离 parser/Tesseract/ClamAV/strict source-map、BGE-M3 与 PostgreSQL lexical search；core/search migration 为 `29/29`、`2/2`，数据库与产品代码保持独立迁移边界。
- 当前 parser 保持 `network=none`、read-only、非 root、512 MiB/64 PID、仅 `/parser-jobs`；BGE worker 为 internal-only、CPU-only、read-only。LiteParse 仍为 `APPROVED_PILOT`。
- 2026-08-28 已完成 ECS 卫生清理：退出候选容器、恢复/测试库、无引用卷、旧候选镜像世代与 build cache 已按精确目标清除；current/rollback、生产模型卷与通过门禁的 LiteParse 候选保留。
- 生产 `e2c0eaf…` 已有服务器全量 build、容器健康、公网/loopback release、BGE runtime 与真实 DOCX `18,118` 字符 canary 证据；这些证据不覆盖新候选 `6268be3`。

## Constraints and next action

- 所有 Docker、数据库迁移、镜像构建与最终运行验收只在 ECS；本地仅做代码、静态检查与单测。Windows 远程操作必须由 PowerShell 显式调用 Git for Windows Bash，再走 canonical scripts。
- 不读取、打印或提交 `.env` 值；不安装 GPU 栈；不把生成内容冒充 Evidence；Landing/Hermes 视觉冻结。
- 下一轮只修复两个 breaker，完成新 SHA 的复审与 CI 后，才执行 ECS exact-image build、真实 schema-v2 corpus、CPU/RSS/worker responsiveness、隔离与清理门禁；全部通过后再决定部署，失败则不触碰生产。
