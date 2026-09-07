# Progress

## 2026-09-07 PRD v1.1 实施启动

- 用户已授权完善功能、版本管理、GitHub 推送和服务器部署；本轮按 M1/M2 修复记录闭环并提供只读 API。
- 分支 codex/open-research-publication，起点 1b974dd；18:53 +08 巡检 production 5e4b4d4 / rollback 8e4ecb2，容器健康、公网/内网 200、出网 204。
- 实施计划已登记；导入确认原子快照、页面材料恢复、固定版本 API 依次开发并独立审查。M3/M4 仍为后续阶段。

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
