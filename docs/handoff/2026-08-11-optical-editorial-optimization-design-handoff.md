# Handoff — 2026-08-11 Optical Editorial 原型形变纠偏

## Current goal
在现有线上产品和业务流程之上，修正 Landing 与 8.10 原型之间的光学几何差异，并完成生产复验。

## Done
- 已核对线上主要路由均可访问，生产服务运行中。
- 用户确认本轮不重构功能、不更换 API/数据模型、不重新搭建系统。
- 已更新 `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`：Explore 主入口、Create 次入口、Sign in 独立入口；删除虚构首页元数据；保留中央粒子光学场；Hermes 全局可唤起、Live2D 仅在面板内呈现。
- 实施计划 `docs/superpowers/plans/2026-08-11-landing-incremental-optimization-plan.md` 已执行完毕。
- Hero、OpticalField、Open RO 和 hydration/视觉测试修复已提交于 `99f1686` 之前的提交链；最终发布 ref 为 `99f16862389605d7552ac8d092ee5c8942c4e5c1`。
- focused/browser/full Web 门禁：Landing/Optical 18/18、Web 157/157、typecheck、build、lint、docs lint、docs-sync 全通过；线上 1440/1920/390 normal/reduced/Open RO smoke 全通过。
- ECS 部署前备份 `BACKUP_OK size=276K files=7/7`；远端 install/build、生产栈重启和 Nginx 配置测试成功；线上 `/auth/me` 与 `/admin` 仍按预期受保护返回 401。
- 本轮纠偏：恢复单轴横排标题；固定桌面狭缝到词间交界附近；粒子点阵改为固定纵向场 + 指针局部位移；SVG mask 改为纵向椭圆局部折射，底层焦点区透明度降至接近零，消除整句重影。
- 本轮本地证据：focused 20/20、Web 159/159、typecheck/build、3040 三视口 normal/reduced/Open RO shots 通过；交界点额外截图为 `apps/web/test/visual/out/boundary-1440.png`。

## Constraints
- 不读取或写入 `.env`；不删除现有文件。
- 保留现有页面风格、素材和已完成功能，改动以增量优化为准。
- 每次页面改动后必须运行 focused tests、三视口截图、线上路由验证，并同步 progress/project_index/handoff。
- Live2D 生产使用仍需保留 ADR-010 的授权记录门禁。

## Open gate
- 代码与本地视觉门禁已完成；生产发布仍需执行一次备份、部署和线上 Chromium 复验。
- 后续应按产品表面矩阵逐页优化 Dashboard/Workspace/Public RO/Hermes，新增范围先建立对应 spec/plan 和验收证据。

## Next action
先完成本轮纠偏版本的 ECS 发布与线上截图，再以新 Landing 为视觉基线推进下一个明确产品表面；不要恢复已废弃的旧卡片/媒体叙事，也不要在未授权时扩张后端合同。

## Read first
`AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` → `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md`
