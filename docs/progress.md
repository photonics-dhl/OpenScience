# OpenScience 进度（CURRENT window）

> 最新同步：2026-09-05 +08。历史由 Git 保存；当前应用390afc0已部署，后续文档提交不改变生产。

## Current version tuple

- Worktree / branch: E:/Miscellaneous/XGS/.worktrees/readable-hermes-guidance / codex/product-workflow-design；application HEAD 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7（PR #86），docs HEAD 从 Git 读取。
- Production active/public: 390afc09d3b6ec64d5b23e64f6bffe6bf8a375e7；rollback c07c8d15e5ba3b722577f42d6ad72af8c83189fe。
- 36/36 与2/2迁移、13运行容器、目标服务健康、公网/loopback、journal cleared 与 retention completed。
- 根目录旧 main b9616cb 及 memory/配置/用户资料保持原样。

## Delivered this slice

- RO 图解页面接通真实主张表单、版本/来源选择、生成/任务恢复、私有预览和批准；错误加载、角色/版本只读、跨版本异步结果、幂等重试与审批CAS冲突均有覆盖。
- Hermes→Editor 携带已确认源文件，并保留原 manifest 附件；Claim 编辑/删除在原事务中退役旧图解。新renderer换行、不夸大科学验证且拒绝过高输出；v1读取兼容。
- 摘录关键词额度修正；无新增依赖或迁移。用户已允许自主选择开源安装，本轮复用已有能力。

## Validation and real-paper findings

- 全仓 build/typecheck/lint/test GREEN；Web491+Node5、domain568、worker502、API130。原有 search storage 集成8例按无独立DB配置跳过，未新增跳过。
- 本地 browser98/99后修正模拟任务过快完成的测试时序，图解9/9重验；CI33947575816完整99/99及Hermes专项GREEN。独立复审无剩余产品阻断。
- ECS完整build、Parser16、ScanSci真实OA/Worker、BGE、迁移与健康验收通过；本轮运行文件闭包稳定。c07曾出现96518→96515，原始三路径未定位，不能宣称根因已修复。
- D2NN arXiv:1804.08711v2，20页/4,000,593 bytes：真实页面完成上传、确认、源文件入版本、3条人工主张、生成/预览/批准；匿名内容读取401。真实Claim编辑使已批准旧图rejected，重新生成批准成功。
- 新版本重跑同一PDF仍缺 method/results/reproducibility。展示版本三个字段保留人工补齐标识，未把人工内容冒称自动提取；91.75%数值准确率与88%选定物理样本一致率严格区分。
- 证据：ignored apps/web/test/visual/out/chart-workflow/ 的 real-chart.png/svg、桌面/手机截图、真实任务/提交/失效JSON和日志。受控私有账户会话均已注销，原PDF未公开，图解是主张摘要卡片。

## Product state and next action

- Research Intelligence Tasks1–12与前批UI已交付；不恢复旧MVP任务。frontend/nanqing@e5db5ae无新增，已有每日10:00巡检。
- 下一段按功能/展示优先推进机制图/图片、视频和Hermes语音编辑讨论；真实提取空缺和主张/证据自动衔接并行改进。本轮效果尚待用户验收。
- 保留界限：科学支持未经独立验证；媒体默认关闭/管理员限定；Worker拒绝可能留下无引用对象，charged-on-submit与并发模拟边界仍在。
- 先读CURRENT handoff和需求基线，生产状态必须由Git/服务器事实确定。
