# Progress

## 2026-09-08 — Authorized merge correction and production integration

- User reopened correction;2d19052b passes full domain624, build/types/lint. GitHub b3d9a879 upload verified. Current production97aa06a5/rollbackc5b0dd71 integrated to preserve source excerpts, Claim review and video features. Final merged review/server acceptance/deploy pending; old release blocker is historical.

## 2026-09-07 — Final review release blocker

- Final correction resolves canonical ambiguity and timestamp ordering. Scoped rereview found merge Version graph continuity is incomplete; release blocked pending focused correction under SDD final-review breaker. No candidate deployment or confirmed GitHub push; exact server/real PostgreSQL acceptance remains unrun. Docs lint passed; browser product cases passed cumulatively, not a single clean full run.

## 2026-09-07 发布候选验证

- 候选 f199b4fd 已合入新生产 17eb209 的 PDF 保真修复；当前 production17eb209 / rollbackc9439ae，本轮尚未部署。
- 完成原子确认、材料恢复、固定 API/Schema/OpenAPI、共享预览与导出；迁移37可空快照，旧数据不回填。两项审查修复补齐连续图谱、歧义定位与同时间戳父版本顺序；151专项通过，最后复审进行中。
- 合并 Web548单测与生产构建通过；Node22浏览器124项覆盖通过（全量121 +补齐夹具后3项复验），文献恢复13项通过。Node24本机图片优化超时已在Node22消失，生产同为Node22。
- 下一步：精确候选服务器构建/迁移/真实PG/Parser16与HTTP流程验收。GitHub仍待本机GCM登录；服务器也无可用GitHub SSH认证。受控dev数据库服务验收后停止并保留卷。
## 2026-09-07 固定 API 与生产修复合并候选

- Task3 候选 dd7b131：提交时冻结研究记录，固定 API/Schema/OpenAPI、来源、JSON/ZIP 导出和页面预览共用。新增 nullable 迁移 37；旧版本明确 not_recorded，不回填。
- 本地 Task3 门禁：616 domain、159 API、529 Web +5 Node、18 浏览器通过，构建/类型/lint 通过；独立审查进行中。
- 20:33 +08 核实并行部署：production c9439ae / rollback 5e4b4d4，已合并该来源定位、隐私投影和文献恢复修复；origin/main 仍1b974dd。合并后全量验证待跑，不能沿用单分支结果。
- 生产仍未部署本轮候选。GitHub GCM 登录仍待用户完成。隔离 dev PG/Redis 由本轮启动，最终验收后停止服务并保留卷。
## 2026-09-07 PRD v1.1 实施启动

- 用户已授权完善功能、版本管理、GitHub 推送和服务器部署；本轮按 M1/M2 修复记录闭环并提供只读 API。
- 分支 codex/open-research-publication，起点 1b974dd；18:53 +08 巡检 production 5e4b4d4 / rollback 8e4ecb2，容器健康、公网/内网 200、出网 204。
- 实施计划已登记；导入确认原子快照、页面材料恢复、固定版本 API 依次开发并独立审查。M3/M4 仍为后续阶段。
- 记录修复候选 0822515：原子确认、幂等重放、普通入口材料恢复 API、保守 Claim/Evidence 定位；76 domain / 8 API、构建/类型/lint 通过，独立复审通过。SDF/manifest 固定；草稿图谱仍可编辑，Task3 负责冻结 API 记录。
- Web 基线 525 单元测试通过，补装 Chromium 后 source-art 测试通过；服务器 Linux 发布合同 137/137 通过。本机同合同受 Windows shell/symlink 限制，不作为发布通过证据。
- 网页一致性 Task2 已独立复审通过，候选 99793fd；528 Web 单测、18 浏览器用例、构建/类型/lint 通过，修复并发附件恢复与快照重试。Task3 固定记录 API 开发中。GitHub 推送待本机 GCM 登录；用户已收到登录提示。尚未切换生产。

## 2026-09-07 开放研究出版物 PRD 草案

- 新增 `docs/specs/2026-09-07-open-research-publication-prd.md`，登记索引；四阶段需求、关系合同、样板回归和里程碑已整理，状态 DRAFT，待评审，不替换既有基线。
- PRD 更新 v1.1：用户要求每个 RO 都有 AI 友好 API；新增 3.4 节、R1-10/R2-09/R2-10 及客户端验收。阶段一冻结合同，阶段二交付只读 API/OpenAPI，后续写操作沿用审批；仅文档更新。
- 本地 main / HEAD 1b974dd；本轮实测 app 5e4b4d4、rollback 8e4ecb2。当前仅增加文档，未改代码或部署。
- 超快科学 0175 网页实测完成上传、解析、人工补充、确认与额外提交。RO 7edd680f-cecc-4a1c-957b-6aec6b7f61ca 保持私有；快照 v2，页面草稿 revision 3；附件哈希一致，Claim/Evidence 各 0。
- 待修问题：局限与数据声明遗漏、确认/版本语义、草稿材料跨页面恢复、文件页已有材料展示、结构化证据关系。PRD 明确记录人工介入与未实现能力。

## 2026-09-07 entry continuity deployed

- Branch codex/overview-responsive-companion; app/public 5e4b4d47cba918db5a9b7f7092de32aa244c258e, rollback 8e4ecb2b5f9e291385b0df8495082e923af328a6. Later docs HEAD differs from deployed app. Main and branch pushed; root user files untouched.
- Skills-guided compact login/register layout, original Wanko, shorter bilingual copy, optional signup preferences collapsed with state/defaults preserved. Shared DashboardShell palette and active navigation unified; desk metadata/search simplified.
- Preserved previous Wanko texture fix, RO focused editor and media companion area. No auth/provider/schema changes, installs, paid generation or research writes.
- Exact server build/parser16/core36/search2/BGE/ScanSci/container/public acceptance passed; journal cleared/retention complete, edge/loopback200 and egress204.
- Auth37 unit checks, Web build/lint/docs and5 focused existing browser fixtures passed. Public auth8 and dashboard/new/settings/me8 desktop/mobile checks passed;0business writes, controlled session closed. High review found no auth/returnTo regression. No full-site business or CI completion claim.
- Evidence: ignored entry-*.log/png/json under apps/web/test/visual/out/research-journey/. Canonical handoff records exact scope and remaining issues.

## Next

- User reviews deployed visual iteration. Continue individual-page layout and actual paper-to-RO/media/evidence workflow; shared style is not complete whole-site redesign.
- Preserve original Wanko/lamp, Serena v4, animated D2NN and existing runtimes; CPU image installation stays paused.
- Extraction/Evidence grounding and existing internally recovered RO literature-disclosure visibility remain unresolved.
