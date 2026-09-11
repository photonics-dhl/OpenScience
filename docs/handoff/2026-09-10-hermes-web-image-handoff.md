# Hermes Web Image CURRENT Handoff

## Goal and constraints
- 用户当前要求：当前先用服务器Chat网页生图；用户量/并发增加后再接API。先让当前论文图片进入产品，再优化网页；不扩建恢复框架。
- 本机仅编辑/静态阅读；不运行测试、预检、CI。服务器执行发布必需构建/启动和实际产品任务。视频暂停；不自动批准或发布图片。
- Hermes全文理解后给用户六维精炼总结，机器绘图提示词单独详述。禁止同名章节模板和手工内容代替服务器能力。

## Version tuple
- worktree: E:/Miscellaneous/XGS/.worktrees/onchip-video-release
- branch: codex/onchip-video-release
- application / production / browser bundle: 6a9f650e50aa5358c50522c3c680977879190b18
- rollback: 3ee10d6e2d5efb9df8f4a09fa4febd7feda60857
- 首批已部署，实际页面显示1/6图解、限流说明、成果入口。第二批候选：折叠AI绘图细节、288px侧栏、提示词可见标签/内部规则分层、显式恢复时复用已保存图片。

## Actual product facts (2026-09-11)
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；version 4ed2b16d-0c5f-41a5-a57d-54eff5dbab11；run 436ff261-1f49-42ea-827a-cccfb2fce45b。
- Deep-sub-cycle PDF已完成高级解析及Hermes全文凝练，task 1e324308-fd26-4cc1-8612-8a1c269909a9；六字段已由用户确认并写入版本；6 claims/54 evidence已确认。
- 修订图解方案5fc9ab10-b3f8-4e68-ae31-0eb57c294c4e已经批准，六个场景任务已创建。
- 图片36a4f82b-10bc-40f4-b43c-bc1d8990f6c9实际已由服务器chatgpt-web保存到产品为draft，sceneIndex4；并非只存在spool。authenticated presentation-assets GET已返回该图片与两份方案。
- 六图未全完成。7d8fafce-390c-4a4e-9024-ec89650de631的精确会话明确显示“You’ve hit your rate limit.”；服务器Pro菜单禁用。浏览器CDP实际连接成功，无需重启或重装。
- 8f4f6f79… /986ff3d9… 是EXPIRED；1f2d0677… 是EXECUTION_FAILED；6a2cc3bf…尚无provider结果；7d8…已只读续取原会话确认为failed/USAGE_LIMIT。旧结果和失败marker已归档，无重发。
- run仍failed/version7，旧P2034事务冲突错误掩盖已保存结果。失败run隐藏成果入口、1.5秒轮询重置整页和面板key，是当前直接体验问题。

## Candidate / Chat review
- Chrome会话 https://chatgpt.com/c/6aa2df58-0c20-83ea-838d-4e1129091d79，6 Pro已实际回复GO：成果可见性与run失败分开；明确限流不自动重启/重发；其他场景持久化后再汇总失败。
- 修复runner对所有标签调用canonicalUrl导致遇到/images或产品页即抛错；只对记录的canonical目标做严格匹配。
- 限流消息原来不在alert/toast而在assistant turn，旧代码漏判。新增明确USAGE_LIMIT传递；既有不确定任务只返回同一会话确认失败，不提交新图。
- GET run可按同RO/version/parent/Claims返回已有图片元数据，保留数据库真实失败状态；前端显示独立图解进度和成果入口。
- 生成汇总保留已完成资产和权限/版本校验，等待其他已派发任务结束，避免单图失败取消其余场景authority。

## Next actions
1. 部署第二批候选及对应provider bundle，复用已有浏览器和renderer，不下载；--confirm --no-tests --reuse-unchanged-capability-images。
2. 7d8现已明确USAGE_LIMIT，只解除该任务不确定状态的旧熔断记录；不发起新生成。后续由既有显式继续入口处理限额恢复后的剩余图。
3. 真实产品页已观察1/6、来源与审核按钮。现图把内部限制反复画进画面，还有游离>2标记；保持草稿，不能精选发布。
4. 剩余图等待网页使用限制解除；不靠重复重启/新账号切换绕过限制，不以1张声称6张完成。
5. 同步本handoff、server-capabilities、capability registry、progress和index中的精确版本。
- Chat6 Pro再次GO：折叠机器细节、缩小侧栏、区分制作规则与可见标签、同任务已落库图片经完整作用域检查后零生成复用。其“两个机制”的替换例子不受论文证据支持，未采纳。
