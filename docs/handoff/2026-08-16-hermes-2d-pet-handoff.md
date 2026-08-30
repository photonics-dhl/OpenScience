# Hermes Research Intelligence CURRENT Handoff

> **CURRENT active-memory，2026-08-30。** Task 10 外部检索与临时文档生命周期已部署、生产验收并合入 main；下一产品任务是 Task 11 确定性 PresentationAssets。Landing/Hermes 视觉仍冻结。

## Goal and state

- 产品目标：以 3–7 个 Claim 为公开 RO 中心，提供可定位 Evidence、条件/限制、身份静默路由、CPU 文档解析、混合检索和可版本化富媒体。
- Taskmaster `hermes-research-intelligence` 为 10/12：Tasks 1–10 done；Task 11 dependency-ready。
- 证据整理稿位于 `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`；当前产品主线转入 Task 11。

## Version tuple

- Worktree: `E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance`
- Branch / repository main: `codex/seaweed-metadata-compat` / `689331845574612130f223d08c92e61721c16586`；远端仅保留 `main`。
- Production application source / immutable release: `689331845574612130f223d08c92e61721c16586`
- Rollback: `c435c4c8b2800bb20998fd9a9a93f2db96328661`; core/search migrations `32/32` / `2/2`
- 本地 `main` 与其他 worktree 有用户改动，不得触碰或用它推断生产；上述 tuple 已从 ECS 重新实测。

## Production truth

- Public/loopback `/__release` 均返回 `2fa10aa…`；目标容器和数据服务 healthy，BGE CPU runtime、Parser 与公网入口全绿。
- TLS certificate subject 为 `openscience.428312321.xyz`，有效期自 2026-08-03 20:10:34 +08:00；ECS、域名反代、Landing、Cloudflare Tunnel 的上线日期必须按证据包分开表述。
- `agent_tasks.result` 为 JSONB，`IngestionTaskState` 含 `needs_review` 与 `confirmed`。生产聚合为 14 条待确认建议、7 条 confirmed、21 条总计；未输出业务正文或用户信息。
- 数据库不存在字面 `suggested` 枚举：产品语义映射为 `result != null + state=needs_review`，确认后 `state=confirmed`。

## Task 8 accepted

- 计划入口：`docs/plans/2026-08-29-hermes-claim-evidence-api-plan.md`。实现包括可信 SourceMap ref、Claim/Evidence CRUD、乐观锁/审计、locator resolver、发布 blockers、narrative snapshot/hash、公开版本不可变、外部权利 fail closed 与 SourceMap redaction。
- SeaweedFS HEAD 不返回自定义 checksum metadata 的生产兼容已在 `4c73469…` 修复：缺 metadata 时对原件做有界流式 SHA-256，同一对象复验只读一次；有 metadata 时仍直接校验。
- Exact CI `33257516418` / job `99113706374` success。ECS parser acceptance 与真实 RO journey 通过：5 source blocks、3 Claims/Evidence、未核验阻断、locator 篡改拒绝、核验后 review/publish、公开页 200、残留用户 0。

## Decisions and hygiene

1. Code locator 已失败关闭：API 不接受 `codeRange`，Domain 也拒绝；待未来 Version 有权威 source revision 后另行开放，禁止把 UUID `commitId` 冒充 Git revision。
2. SourceMap/object-storage 解析已移出 Claim/Evidence Serializable 事务；短事务重新校验 version/manifest/artifact/hash、SourceMap ref 与 CAS 时间戳。
3. `review.analyze` 已在 API payload、Domain submit 和 Worker save 前强绑定 session/payload/version 同一 RO；Worker 只使用持久化任务 payload。
4. Presentation reuse 改为按全部受审 Evidence hash 精确查找，不再依赖可截断的资产前缀。SourceMap 为可共享的内容寻址对象，Task 8 不盲删；GC/retention 在 Task 10 建立全引用扫描后实施。
5. Task 8 已完成。公开页 journey 的 RO 由一次性 fixture 预置为 public；正式“扩大可见性审批”不得借 generic PATCH 绕过，应与 Task 9 的发布/公开衔接一起关闭。
6. `/opt/openscience-evals` 的 40 个历史工作目录已在生产锁内精确清理；有效 acceptance 报告保留。Task 9 再清 dev 栈/卷与可重建缓存后，根盘当前约 35G used / 107G available。
7. PR #6 已合并为 main `cf63392a…`；远端分支删除后仅保留 `main`，独立旧 Live2D 历史仍由 `archive/hermes-2d-pet-20260829` tag 保存。
8. Task 9 已生产完成：candidate CI `33263991191` 全绿；R3 publish→public、账号偏好、3 Claims/3 Evidence/source、桌面/移动/打印真实旅程通过；一次性数据库行与对象存储清至 0。
9. ECS dev 栈、3 个 dev 卷、390.7MB build cache 与两个无引用旧 Node 镜像已精确清理；根盘 35G/148G（25%），保留 production/rollback、BGE、沙箱、解析评测与监控数据。
10. Task 10 已生产完成：Semantic Scholar/Tavily/ScanSci legal-only adapter、rights、72h cache、10min one-use download、GC/provenance 均接通；ScanSci 默认 disabled，Tavily 四个授权 key 当前均额度耗尽并显式降级。
11. 真实 Semantic Scholar Hermes 任务返回 3 sources；SeaweedFS checksum metadata 生产兼容经 PR #9 修复。77-byte 自著 PDF 完成 HEAD hash、下载、重放 404、72h 到期和真实 Worker GC；GC 后 provenance/locator 保留，取证后 canary 业务行精确清零、审计保留。
12. Exact CI `33284956868` / job `99186426490` 全绿；最终 release `6893318…`、rollback `c435c4c…`。远端仅 `main`；精确移除无容器引用的旧 dev MinIO server/mc 镜像后，磁盘 36G/148G（25%）、107G available，active+rollback 两个 release，390.7MB bounded build cache 保留，无 broad prune。

## Constraints

- 服务器验收为准；本地不运行 Docker。Windows 远程操作只用显式 `C:/Program Files/Git/bin/bash.exe` 调 canonical wrapper。
- 不读取/打印 `.env`；不 broad prune；不删除文件或服务器对象，除非用户明确批准 exact scope。
- 不把本地 API 或本地 Docker 当生产证明；服务器验收继续是最终门禁。

## Next action

1. 从 Taskmaster Task 11 开始：以真实 Claim/source hash 生成确定性 SVG/Plotly/交互 HTML，并强制 `presentation_not_evidence`。
2. MiniMax image/video 仍仅管理员代表性成果、显式审批和成本审计；服务器纯 CPU，不部署本地 GPU 栈。
3. 继续以服务器为最终验收；本地只做代码与浏览器门禁，不运行 Docker。Task 12 再做完整 golden-corpus 和上线总验收。

## Read first

1. `AGENTS.md`
2. 本 handoff
3. `docs/proposals/2026-08-29-project-development-deployment-evidence-pack.md`
4. `docs/plans/2026-08-30-hermes-external-retrieval-lifecycle-plan.md`
5. `docs/specs/2026-08-26-hermes-research-intelligence-platform-design.md`
6. `docs/progress.md`

`project_index.md` 只定向检索 CURRENT；不要从较旧 `main` 或历史 release 段落推断现状。
