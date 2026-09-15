> HISTORICAL — 本文保留当时的实施目标、版本、待办及结果，不是当前工作指令；不得据此重跑测试、迁移、生成或发布。续作只读 [当前交接](2026-09-10-hermes-web-image-handoff.md)；未完成需求仍须按当前基线逐项判断。

# Handoff — 2026-08-15 Hermes 少年星图龙静态原型

- Current goal: 当前 Blender 少年星图龙已被用户视觉否决；下一步需先选定新的资产方法，禁止沿旧基础体继续修补。
- Done: E 盘便携 Blender 确定性生成可编辑 `.blend`、四张 768 px 视图、1536 px contact sheet 与 manifest；focused asset contract 2/2 GREEN。
- Done: 形体已从高瘦管状原型改为修长卷体；六节点墨色证据带位于外脊，包含三片书页背鳍、竖向杏仁眼、后掠页冠、墨绿验证耳鳍、短圆肢与双叶朱砂引用尾。
- Constraints: 当前只做静态 stop/go；未生成 GLB、骨骼或六态动作，未修改生产 UI/API/数据库/部署，未读取 `.env`。
- Open risks: 用户已经给出 NO-GO；结构门禁不能代表品牌质量。Blender 自动生成的本地 `.blend1` 备份不属于交付物，因禁止无授权删除而保留未提交。
- Next action: 比较高质量 2.5D 分层骨骼、完整雕刻 3D、授权基础模型改造三条路线；首选 2.5D，确认方法后另写新 spec，旧原型不得直接复用为产品资产。
- Read first: `AGENTS.md` → `docs/OpenScience_Kimi_Development_Spec.md` → `docs/specs/2026-08-15-hermes-constellation-dragon-prototype-design.md` → `docs/progress.md` → `project_index.md` → 本 handoff。
