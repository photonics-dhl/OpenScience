# Handoff — 2026-08-10 Optical Editorial 前端重构

- Current goal: 按用户确认的 Art Direction v3，重构 OpenScience 产品级网页视觉与交互，并在服务器直接验收部署。
- Done:
  - 审计 `docs/user_ideas/8.10/` 资源；确认 `OpenScience_Art_Direction_v3.md` 覆盖旧视觉，Masterplan v2 保留产品结构。
  - 完成 27 项 grill-me 设计决策：三种表面、双入口身份流、Hermes/Live2D、Evidence Intake、三联屏、启动语料、Figma/浏览器职责、动效、部署方式均已确认。
  - 新 spec：`docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`。
  - 新计划：`docs/plans/2026-08-10-optical-editorial-frontend-plan.md`，15 Task 完整覆盖；Task Master `optical-editorial-v3` tag 已验证 15 tasks / 42 valid dependencies，旧 master 视觉任务已 cancelled。
  - Task 1 完成：新工作树 `E:/Miscellaneous/XGS/.worktrees/optical-editorial-v3` / branch `codex/optical-editorial-v3`；Prisma generate → full build → full test 全绿（Web 92、Domain 313、API 58、Agent Worker 24、Science Worker 29）。
  - Task 2 完成：ADR-009 决定 Canvas 2D + SVG/CSS 原生 Optical Field（无新增运行时依赖）；Bricolage Grotesque、Bodoni Moda、Noto Serif SC、IBM Plex Mono 以 next/font 构建期自托管；v3 黑/纸白/朱红 tokens、0/4/8px 半径、motion/字体角色与 AA/禁蓝紫门禁已落地。聚焦 24/24、全 Web 99/99、typecheck/build 通过；review 后修正朱红控件黑字与双表面 focus 对比度。
  - Task 3 完成：`OpenScience.`/`O.` 品牌原语与 Public/Identity/Dashboard/Workspace 四类无 Card shell 已落地；单一 main、skip link、19/56/25 Workspace 平面、8px action/press/reduced-motion、中英文 shell 文案均有测试。focused 9/9、全 Web 108/108、typecheck/build 通过。
- Constraints:
  - 不读取/打印 `.env`；不把效果图伪数据投入生产。
  - 视觉核心必须由可访问 DOM + 自有轻量 Canvas/WebGL 媒介层实现；第三方库只作受控局部依赖。
  - 开发阶段无用户，验收通过后直接替换服务器页面；保留上一镜像以便回滚。
- Open risks:
  - v3 foundations 与共享 shell 已编码，但实际页面尚未替换；Figma canonical 需要按 v3 新建 foundations，旧文件不再作为视觉裁决源。
  - 启动 6 个完整 Demonstration RO 与 12–18 个索引条目尚未采集/登记。
- Next action: 执行 Task Master `optical-editorial-v3` Task 4；先以失败测试定义 DOM 标题、纯函数 Optical Field 与 reduced-motion，再替换 Landing 并做浏览器截图审美验收。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` → `docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`。
