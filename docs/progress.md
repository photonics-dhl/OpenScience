# OpenScience 当前进度

## 2026-09-11 — 媒体工作台、Hermes与公开页已部署
- branch：codex/onchip-video-release；worktree：.worktrees/onchip-video-release；代码HEAD/release b05aaeacf810516670776f851b99794e23c8851e，rollback cec596e809a558139ea1b391a65605c104dc64ba；browser provider f4832487未变。
- Chat6Pro实际接收用户截图、给出规划和上线后复核；服务器第二账号已登录。会话6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581，无需再要求登录。
- 已部署画廊优先/详细指令折叠、同工作台Hermes图片视频操作、统一主题色与控件、公开760px居中阅读栏、次要信息折叠；实际服务器页面已观察。
- 已修许可证嵌套响应导致PUT400，以及审核请求空JSON导致500；真实v6审核已创建，唯一阻断evidence_unverified。未修改发布审核规则。
- 已修空commit、附件单独变更提交、Hermes模糊失败的完整请求重放、切版本保存幂等记录，以及最终公开快照和许可证事务一致性。Sol High定向静态复核通过。
- 服务器必要构建/启动已完成；没有运行测试、CI、预检或重跑OCR。初次编译遗漏publicId后已补齐前后端并成功部署。

## 当前真实论文的后续任务
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8，v6 47e82df5-7694-42e6-9c61-3675d0c2963a仍draft、暂无图片。v3旧图FWHM_s误画横向缝宽，不能发布或挪到v6。
- 新Hermes方案任务1956a2c5-7aa1-49cf-bc69-0f645220675c已通过产品操作提交，明确修正为沿电子z方向场宽，已失败于storyboard:scene_0:visual_action，尚未生图；字段诊断及图片专用修正反馈已完成静态复核，待部署。
- v6有50条已验证+58条待审Evidence。精确来源与Claim语义比对表明可保守继承0条，不批量改状态。
- 已把58项和13条有意义对照组成服务器JSON资料并实际上传Chat6Pro，正在逐项语义审阅。文件：/opt/openscience-chatgpt-browser/jobs/publication-review-v6-20260911.json（161042 bytes，私有600，无个人审核者ID/Secret）。
- Chat明确：六字段确认不能追认为逐条证据已核对；未来若升级为一次批量确认，应明确包含本版主张和证据，保留未决科学问题。当前直接完成实际审阅，不能绕过。
- OSR-2026-000020/v/2是旧E2E内容，仅用于观察公开页布局，不能当作新精选成果。

## 约束与入口
- 产品落地优先；不测试/预检/CI、本机不运行应用；服务器复用已有能力。视频实际生成和批量冷启动暂停。
- 没有全局自动账号轮换、没有安装新软件。网页规划和服务器网页生图按各自接口判断可用性。
- 唯一CURRENT交接：docs/handoff/2026-09-10-hermes-web-image-handoff.md。更早记录保存在Git历史，不能恢复旧next action。