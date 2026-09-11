# Hermes / Workbench CURRENT Handoff

## Read first / current objective
- 用户已批准高保真稿风格并要求正式实现；截图六个研究栏目进一步突出。沿用冷白/墨色/青绿、凝练正文+媒体、Hermes形象和固定对话输入，不再访谈已确认方向。
- 当前讨论材料：docs/proposals/2026-09-11-ui-skill-references.md。它是参考目录与待决问题，不是批准实施方案。
- 基线 docs/OpenScience_Kimi_Development_Spec.md；当前产品设计 docs/specs/2026-09-05-integrated-research-product-design.md；服务器操作先读 docs/runbooks/server-capabilities.md。

## Version / environment
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- code HEAD / application release 329ad2e821f3aac1c7345a792b190f1f8e97619e；rollback 25917596e640cdda5451a4b15a00c7245a832566。本轮实读 .release-id；无新部署。
- browser provider f48324870f25b50c3a21eaad898beea87fb0aa1d；provider rollback 48d9fa65db134575f53cf2a30724aa47a14eeea4。
- 根 E:/Miscellaneous/XGS 其他脏文件不碰。本轮实现正式工作台/公开页及Hermes对话，部署前仍为候选；旧ready-card实现不恢复。
- 服务器浏览器仍登录第二账号；普通 Chat 实际 6 Pro。CDP localhost9233，已有 playwright-core；不重启/安装/重复登录。
- Google OAuth bridge 补丁仅 accounts.google.com / www.gstatic.com 的精确 443 域，原备份保留；不轮换账号绕限额。

## User constraints
- 不测试、不预检、不 CI、本机不运行应用；服务器部署必要构建/启动可做。SSH 仅项目 wrapper + Windows 显式 Git bash。
- 不读取/输出 .env、Cookie、密码、验证码；保留真实文件/版本/来源。用户已授权代为科研审核和公开发布，但不能放行已知科学错误。
- 视频生成、批量冷启动暂停；当前重点一张合格核心图及公开阅读流程。
- 新UI方向已批准，直接实施；不以文档或Skill强加额外审批、门禁或测试。

## Implemented / deployed
- 媒体画廊优先，详细指令与来源手动工具折叠；同工作台 Hermes，用户和助手共享内容。
- 发布客户端许可证解包和 POST review 空 JSON 修复；保存许可→审核→推进→发布，失败保留真实原因。
- 当前 Claim/Evidence/许可证重建最终 public record，版本许可证同事务且已公开不可修改；High 定向静态复核。
- 空 commit 阻止但附件单独变更允许；模糊失败冻结完整请求与幂等键，切版本不误发。
- 329ad2e8：图片 visualAction 4000，视频新生成 100 / 旧读取 1000；用户短文案预算不变；初始加载不显示假版本。必要服务器构建/启动已完成。
- 公开页已改居中阅读栏、主图与凝练字段、按需来源/许可等；用户仍不满意，不能说设计完成。

## Actual paper / science state
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；v6 47e82df5-7694-42e6-9c61-3675d0c2963a 未发布，无合格图片。Draft revision 7 是工作草稿，非 v7。
- 原 PDF artifact 7bb96cc1-bb6f-4d3b-b0bf-352f41971faf，advanced extraction 1e324308-fd26-4cc1-8612-8a1c269909a9；六字段/54来源已有结果，勿重跑。
- 旧 v3 图 fd719902 实际服务器网页生成回传，但 FWHM_s 横向缝宽标注错误；不能挪到 v6 或发布。
- 742c8351 曾因1398>1000失败，已修预算。最新 8fcbe321-9e48-407f-a507-bc801de30422 结构成功但 draft：光/电子均沿 z 又称正交、重复非零电场面积；不批准、不生成。
- 其他 v6 方案 4017673f 状态 approved 且 canGenerateSceneImage=true，但根代理未批准且内容有误，不能因状态直接生图。157a3951、904809e2 也仍 draft；旧 chart 71c0c79c rejected。
- 科学要求：空间宽度指功率密度幅值 S(z) 沿电子路径的 FWHM，不是几何缝宽、场振幅或向量 z 分量；区别传播/偏振/电子轴；不混19as/99as算例，保留异号旁瓣、有限束团和低光子限制。
- 原 PDF p22 Eq25 为 cr，不是 OCR 的 cτ；p23 Eq26 归一化疑义原文已有；Fig S7 有异号旁瓣；不能把有争议公式解释为已核实性质。

## Evidence review / receipts
- Chat6Pro 审58项+13旧对照：46接受、8修正、4页脚无效；产品 API已完成46确认+4无效Evidence删除+10修正并verify（含2旧项）。原件不动，before/审计保留。
- 本轮实际 GET evidence：104条 succeeded 且104条有 verifiedByUserId；没有新提交 publication review。发布页旧 evidence_unverified 提示不能当成刷新后结果。
- 私有服务器 jobs：publication-review-v6-{20260911.json,chat-result-20260911.txt,confirmation-receipt-20260911.json,corrections-ranged-20260911.json,correction-ranged-receipt-20260911.json,original-20260911.pdf}，另 before/correction receipt 均保留。
- 精确 quote 截短必须同步原 charRange，否则 LOCATOR_MISMATCH；已通过普通 API 成功修正，不能直接 DB 绕过。

## Design discussion / next
- Chat URL https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581。
- 当前 media/publish/public 三张服务器截图已交第4条用户消息；实际标签6 Pro，完整答复已收取。建议成果主屏、Hermes协作、公开独立动作；否定只删控件的旧方案。无需重发/重读旧评审。
- 截图 /opt/openscience-chatgpt-browser/jobs/layout-discussion-{media,publish,public}-20260911.png；API/页面状态 layout-discussion-live-state-20260911.json；完整答复已存 layout-discussion-chat-reply-20260911.txt。
- 当前问题：保存/版本/阶段/Hermes入口堆叠、版本名混淆、结果/下一步不突出、当前视口右侧截断；公开页仍是旧 E2E 占位数据。
- OSR-2026-000020/v/2 仅旧布局观察对象，不是新精选。
- 已确认：成稿/图片主屏、Hermes侧栏；公开贡献与核心图视频同显、凝练正文及重要限制。开始制作和公开发布为两个主要确认节点；上传后自动填草稿，中间自动推进、普通修改自动保存可撤销。正确新图与发布闭环仍未完成。
- 灰度线框 docs/proposals/2026-09-11-ro-workbench-wireframe.html 的布局已获用户认可，保留为结构参考；非生产UI。
- 样稿路由Terra medium实现、根静态修正。只修复该样稿上传为root600导致浏览器EACCES：chown到容器实际uid/gid并保留600；勿改浏览器策略/网络。截图 /jobs/ro-workbench-wireframe-{desktop,public}-20260911.png。
- 最新视觉稿 docs/proposals/2026-09-11-ro-product-preview.html 已在服务器 Chrome file:///jobs/ro-product-preview-20260911.html 打开，原noVNC可见。Chat6Pro视觉建议保存在 /jobs/ro-product-visual-guidance-20260911.txt；Sol medium制作、根修正首屏输入可达/确认卡默认精简/折叠调整项。
- 已观察最新服务器桌面对话和公开预览，截图 /jobs/ro-product-preview-{chat,public}-20260911.png；未观察手机或验证过渡时序。仅样稿预设短句与内存状态，不连接生产、未生图或发布；无测试/预检/生产部署。
- 当前候选：正文连续编辑/媒体同屏、六栏目20px强调、公开图视频直显；Hermes真实模型解析修改/制作/发布预览意图，服务端取同会话已完成对话，前端确认卡/固定输入/历史回显。制作/发布仍需现有明确确认，不等于科学错误已解决或完整生成已验收。
- 路由：复用Chat6Pro已批准建议；Terra medium公开页、Sol medium工作台、主代理Hermes及集成，Sol high定向静态复核状态/权限。候选完成后既有 --no-tests 构建部署；无模型提取重跑、视频或新测试工程。
