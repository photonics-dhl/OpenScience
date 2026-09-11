# Hermes Web Image CURRENT Handoff

## Goal and constraints
- 用户当前要求：连续研究工作台（上传→全文凝练与确认→核心图→预览发布）；公开RO科研阅读优先；Hermes侧栏与页面双向编辑同一草稿。先核心图、补图按需，不凑齐六图作为发布前提。Chat6Pro规划后落实。
- 本机仅编辑/静态阅读；不运行测试、预检、CI。服务器执行发布必需构建/启动和实际产品操作。视频仍暂停；用户已授权Codex在测试阶段充当真实用户审核发布，需实际核对科学内容与来源，不能放行已知错误。
- Hermes全文理解后给用户六维精炼总结，机器绘图提示词单独详述。禁止同名章节模板和手工内容代替服务器能力。

## Version tuple
- worktree: E:/Miscellaneous/XGS/.worktrees/onchip-video-release
- branch: codex/onchip-video-release
- application / production: 661d0926d5bfa8ef4126a93fd021fda012f395cf
- browser bundle: f48324870f25b50c3a21eaad898beea87fb0aa1d；provider rollback48d9fa65，application rollback48d9fa65
- application rollback: 9b97522f282951cf9328f673dbde8c53eaafb8f8；provider rollback仍48d9fa65
- 第二批已部署：折叠AI绘图细节、288px侧栏、提示词可见标签/内部规则分层、显式恢复时复用已保存图片。provider同版本，7d8明确限流后匹配的旧不确定熔断已归档，无新生图。
- 已部署领取事务P2034有界重试和attempt0的未提交恢复；Chrome6 Pro已复核GO。未运行测试，服务器发布构建/启动完成。

## Actual product facts (2026-09-11)
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；version 4ed2b16d-0c5f-41a5-a57d-54eff5dbab11；run 436ff261-1f49-42ea-827a-cccfb2fce45b。
- Deep-sub-cycle PDF已完成高级解析及Hermes全文凝练，task 1e324308-fd26-4cc1-8612-8a1c269909a9；六字段已由用户确认并写入版本；6 claims/54 evidence已确认。
- 修订图解方案5fc9ab10-b3f8-4e68-ae31-0eb57c294c4e已经批准，六个场景任务已创建。
- 真实产品现有2/6图：原36a4f82b-10bc-40f4-b43c-bc1d8990f6c9（scene4）及新8b0ca4c9-eb20-4478-a79c-d1b8e0dadc25（scene0），均draft。新任务succeeded/progress100/provider completed；服务器从Hermes提示词→网页提交→下载/规范化→存储→页面自动展示走通，无人工图片导入。
- 六图未全完成。7d8fafce-390c-4a4e-9024-ec89650de631的精确会话明确显示“You’ve hit your rate limit.”；服务器Pro菜单禁用。浏览器CDP实际连接成功，无需重启或重装。
- 8f4f6f79… /986ff3d9… 是EXPIRED；1f2d0677… 是EXECUTION_FAILED；6a2cc3bf…尚无provider结果；7d8…已只读续取原会话确认为failed/USAGE_LIMIT。旧结果和失败marker已归档，无重发。
- 通过真实页面点击一次“Continue unfinished generation”，POST202；run已generating_scene_images/version8。原36a4保留、6a2原id重排，四个新task：ordinal0=5db130af-5ada-4f55-a70f-36fb8f690c9b，2=edc98363-60e1-470a-a77d-e4442c3f47ff，3=64f186c1-0409-4762-a38a-0959e69bf5a3，5=eb1819af-1b22-4d73-9ecf-6998d6494a3f。随后五项均在发送前失败；run已failed/version9，原图step已正确awaiting_approval。定位MODEL_6_PRO_NOT_READY：生图form仅显示Create image/Extra High，硬性6Pro文案检查错误。未写submitted.json、未发送网页prompt。

## Candidate / Chat review
- Chrome会话 https://chatgpt.com/c/6aa2df58-0c20-83ea-838d-4e1129091d79，6 Pro已实际回复GO：成果可见性与run失败分开；明确限流不自动重启/重发；其他场景持久化后再汇总失败。
- 修复runner对所有标签调用canonicalUrl导致遇到/images或产品页即抛错；只对记录的canonical目标做严格匹配。
- 限流消息原来不在alert/toast而在assistant turn，旧代码漏判。新增明确USAGE_LIMIT传递；既有不确定任务只返回同一会话确认失败，不提交新图。
- GET run可按同RO/version/parent/Claims返回已有图片元数据，保留数据库真实失败状态；前端显示独立图解进度和成果入口。
- 生成汇总保留已完成资产和权限/版本校验，等待其他已派发任务结束，避免单图失败取消其余场景authority。

## Next actions
1. 用户访谈完成：连续/edit、工作台主导、Hermes侧栏双向改稿；核心图优先，不再补齐旧六场景。测试阶段已授权Codex审核发布，须真实核对科学内容/来源。
2. 661d0926已完成服务器构建/部署，三阶段工作台实际可打开；公开API和直接下载排除内部storyboard。真实对话改稿请求失败：一次JSON解析失败、两次结构校验失败，原草稿保持未改。当前候选消除只导航/根字段规则冲突，明确改稿JSON和现有Gateway纠错反馈；同步折叠已确认材料、改正共编入口文案。待重新部署后继续同一实际任务。
3. Chat6Pro已实际交付规划；第二次有界复核返回usage limit，禁止盲重试。Sol High已完成有界只读复核，四处草稿/版本异步边界问题已修正并复核关闭；待服务器必要构建和部署。
4. 真实新图8b0ca4c9已打开：公式与标注可读，观察球面中心和散射源几何仍需与原文对照；旧图36a4有制作指令外露，不能发布。原批量run失败仍保留，gallery2张草稿。
5. 部署后用当前RO走通工作台、对话改稿、审核代表图与公开发布；禁止重跑全文提取或补四图冒充本轮完成。
## 本轮问题与修正
| 问题 | 修正与边界 |
|---|---|
| 提取页反复闪动 | 原1.5秒轮询清空页面并用reload作面板key；现保留内容、稳定key、3秒后台更新 |
| 一张失败阻断其他正在生成的图 | 保留独立步骤，其他已派发任务持久化后再汇总失败；权限和版本仍逐步核对 |
| 已有图片却显示全失败且无入口 | 依据实际资产显示1/6与待审状态，失败run仍可打开成果 |
| 读取原Chat会话立即异常 | 不再把/images、产品页传入严格canonical转换，仅匹配已记录的会话 |
| 限流被误判为结果不明 | 识别assistant turn里的准确限流消息，传递USAGE_LIMIT，不重启或自动重发 |
| 已保存图导致继续入口永久拒绝 | 显式恢复时验证同版本/父方案/Claims及completed结果，复用同任务的资产 |
| 领取冲突造成零次执行任务阻挡整组恢复 | claim只对P2034做有界事务重试；attempt0仅在provider证明未提交时复用原任务排队，精确CAS且仅一次 |
| 机器绘图细节占据阅读区 | 默认折叠，保留标题和简洁讲解；可展开查看 |
| Hermes宽侧栏挤占图片 | 宽屏侧栏288px，小屏主内容优先 |
| 制作指令画进图里 | 提示词分开内部规则和可见标签；原图保留draft，尚未重生成证明质量改善 |
| 原生生图入口显示Extra High却被要求6Pro文字 | 移除图片runner的规划模型门槛，保留Create image/登录与发送限制；科学审阅仍用6Pro |
