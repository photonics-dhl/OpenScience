# Handoff — 2026-08-10 Optical Editorial 前端重构

- Current goal: 按用户确认的 Art Direction v3，重构 OpenScience 产品级网页视觉与交互，并在服务器直接验收部署。
- Done:
  - 审计 `docs/user_ideas/8.10/` 资源；确认 `OpenScience_Art_Direction_v3.md` 覆盖旧视觉，Masterplan v2 保留产品结构。
  - 完成 27 项 grill-me 设计决策：三种表面、双入口身份流、Hermes/Live2D、Evidence Intake、三联屏、启动语料、Figma/浏览器职责、动效、部署方式均已确认。
  - 新 spec：`docs/specs/2026-08-10-optical-editorial-rebaseline-design.md`。
- Constraints:
  - 不读取/打印 `.env`；不把效果图伪数据投入生产。
  - 视觉核心必须由可访问 DOM + 自有轻量 Canvas/WebGL 媒介层实现；第三方库只作受控局部依赖。
  - 开发阶段无用户，验收通过后直接替换服务器页面；保留上一镜像以便回滚。
- Open risks:
  - 新视觉尚未编码；Figma canonical 需要按 v3 新建 foundations，旧文件不再作为视觉裁决源。
  - 启动 6 个完整 Demonstration RO 与 12–18 个索引条目尚未采集/登记。
- Next action: 用户书面审阅新 spec；确认后进入 writing-plans，先做 v3 tokens 与 Landing/Workspace/Public RO 三联屏。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/progress.md` → `project_index.md` → `docs/specs/2026-08-10-optical-editorial-rebaseline-design.md` → `docs/user_ideas/8.10/OpenScience_Art_Direction_v3.md`。
