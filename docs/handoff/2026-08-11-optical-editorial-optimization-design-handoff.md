# Handoff — 2026-08-11 Optical Editorial 原型形变纠偏

## Current goal
在现有线上产品和业务流程之上，用固定 glyph-to-particle 狭缝拓扑替换已被用户拒绝的鼠标圆形场，并完成生产动态帧审美验收。

## Done
- 已核对线上主要路由均可访问，生产服务运行中。
- 用户确认本轮不重构功能、不更换 API/数据模型、不重新搭建系统。
- 已更新 `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`：Explore 主入口、Create 次入口、Sign in 独立入口；删除虚构首页元数据；保留中央粒子光学场；Hermes 全局可唤起、Live2D 仅在面板内呈现。
- 实施计划 `docs/superpowers/plans/2026-08-11-landing-incremental-optimization-plan.md` 已执行完毕。
- Hero、OpticalField、Open RO 和 hydration/视觉测试修复已提交于 `99f1686` 之前的提交链；最终发布 ref 为 `99f16862389605d7552ac8d092ee5c8942c4e5c1`。
- focused/browser/full Web 门禁：Landing/Optical 18/18、Web 157/157、typecheck、build、lint、docs lint、docs-sync 全通过；线上 1440/1920/390 normal/reduced/Open RO smoke 全通过。
- ECS 部署前备份 `BACKUP_OK size=276K files=7/7`；远端 install/build、生产栈重启和 Nginx 配置测试成功；线上 `/auth/me` 与 `/admin` 仍按预期受保护返回 401。
- 首轮 `3336be4` 已部署但被用户判定视觉不合格：错误地改动了原有标题布局，并把点阵扩成大面积白色椭圆；不得作为接受基线。
- 第二轮恢复原标题布局与 50% 光轴；删除同心椭圆干涉环；点阵收窄为垂直狭缝，改用密集、低透明度的右向波前线；文字局部折射遮罩横向收窄。
- 第二轮本地证据：focused 20/20、typecheck/build、3044 production 三视口 normal/reduced/Open RO shots 通过；截图中已无白色同心圆或大面积粒子团。
- 第二轮已以 release `b45e002` 部署：部署前数据库备份 `BACKUP_OK size=276K files=7/7`；远端全量 build、生产容器重启/健康检查及 Nginx `-t` 通过；线上三视口 normal/reduced/Open RO shots 通过，`/`、`/explore` 返回 200，未登录 `/auth/me` 返回 401。
- 用户随后在真实指针操作中否决 `b45e002`：ambient pointer disk、core radial repulsion、moving ellipse mask 与 turbulence 叠加，仍产生大圈和灰色字形撕裂；旧截图门禁未覆盖 active intermediate frames。
- spec、现有实施计划 Task 7 与 Task Master 4 已重新打开：固定 aperture，粒子从实际 glyph alpha 采样，指针只调制能量/相位/有限纵向偏折；禁止圆形边界、移动光轴和随机完整字母撕裂。
- 第三轮本地实现已完成：删除 pointer-centered ambient disk、径向排斥、移动 ellipse mask、SVG turbulence duplicate 与 quadratic fan；实际 Bricolage/Bodoni DOM 字形经 offscreen Canvas alpha 采样后在固定 aperture 两侧压缩/折射，鼠标只调制能量、相位和有界纵向偏折。
- 第三轮独立复审发现并修复：reduced-motion 字形采样后漏重绘、首次重复栅格化、resize 使用旧尺寸、active-frame 延时累计以及旧 renderer 死合同。
- 第三轮本地证据：focused 24/24、Web 161/161、typecheck、production build、3045 production visual shots 均通过；已人工检查 1440/390 normal/reduced 及相互独立的 left/slit/right 60/150/300ms 帧，无鼠标大圆或移动光轴。
- 第三轮已以 release `cd5be36` 无迁移部署：前置巡检正常，数据库备份 `BACKUP_OK size=276K files=7/7`，远端全仓 build、生产应用重启和 Nginx `-t` 通过。
- 公网 Chromium 重跑 1440/1920/390 normal/reduced/Open RO 及独立 left/slit/right 60/150/300ms 全矩阵；人工检查无鼠标大圆、移动光轴或蜘蛛网扇形；`/`、`/explore` 为 200，未登录 `/auth/me` 为 401。

## Constraints
- 不读取或写入 `.env`；不删除现有文件。
- 保留现有页面风格、素材和已完成功能，改动以增量优化为准。
- 每次页面改动后必须运行 focused tests、三视口截图、线上路由验证，并同步 progress/project_index/handoff。
- Live2D 生产使用仍需保留 ADR-010 的授权记录门禁。

## Open gate
- 用户已明确否决 `cd5be36` 的视觉观感；其工程/生产证据仍有效，但不再是审美接受基线。Task Master 4 已重新打开。
- 第四轮不得继续调现有 CPU Canvas `arc()` renderer；先按 spec §5.1.1 建立独立 Optical Lab，对比连续字形 GPU displacement + shared flowmap + sparse instanced particles。生产 Landing 在用户选中候选前保持不变。
- `b45e002` 与 `cd5be36` 均已被人工审美复核否决；`cd5be36` 的本地/生产工程门禁事实保留，但不能再用于关闭视觉任务。
- 后续应按产品表面矩阵逐页优化 Dashboard/Workspace/Public RO/Hermes，新增范围先建立对应 spec/plan 和验收证据。

## Next action
建立不进入生产路由的 Optical Lab：同屏显示目标原型裁切、`cd5be36` 和 OGL/原生 WebGL2 混合候选，并记录 chunk/FPS/frame time/mobile/reduced-motion。用户选中候选后才替换 Landing；不要恢复 `3336be4` 的白色大椭圆、`b45e002` 的 moving pointer disk、已废弃的旧卡片/媒体叙事，也不要扩张后端合同。

## Read first
`AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` → `docs/decisions/ADR-010-hermes-visual-runtime-and-live2d-license-gate.md`
