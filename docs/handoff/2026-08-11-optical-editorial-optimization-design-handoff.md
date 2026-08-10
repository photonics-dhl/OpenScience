# Handoff — 2026-08-11 Optical Editorial 增量优化设计

## Current goal
在现有线上产品和业务流程之上，优化 Landing 的视觉构图、粒子交互、入口层级与 Hermes 唤起，并逐页传播已确认的视觉规则。

## Done
- 已核对线上主要路由均可访问，生产服务运行中。
- 用户确认本轮不重构功能、不更换 API/数据模型、不重新搭建系统。
- 已更新 `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`：Explore 主入口、Create 次入口、Sign in 独立入口；删除虚构首页元数据；保留中央粒子光学场；Hermes 全局可唤起、Live2D 仅在面板内呈现。
- 设计文档自检通过，当前未修改业务代码。

## Constraints
- 不读取或写入 `.env`；不删除现有文件。
- 保留现有页面风格、素材和已完成功能，改动以增量优化为准。
- 每次页面改动后必须运行 focused tests、三视口截图、线上路由验证，并同步 progress/project_index/handoff。
- Live2D 生产使用仍需保留 ADR-010 的授权记录门禁。

## Open gate
- 设计 spec 已获用户确认；实施计划已写入，等待用户选择执行方式。

## Next action
按 `docs/superpowers/plans/2026-08-11-landing-incremental-optimization-plan.md` 执行；第一步在 `codex/optical-editorial-v3` 建立失败契约测试和当前视觉基线。

## Read first
`AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` → `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md`
