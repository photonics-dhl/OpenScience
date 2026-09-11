# Hermes / Workbench CURRENT Handoff

## Objective / approved direction
- 用户2026-09-11再次纠偏：保持批准的冷白/墨色/青绿、正文成果主屏+Hermes完整形象侧栏；主界面不再出现保存/提交/步骤/选主张/选风格等旧表单。普通选择、制作/审核/公开通过对话处置，详细指令按需展开。
- 六个研究栏目标题突出；正文可直接编辑也可让Hermes改写。实际费用与公开范围仍明确说明，输入“确认制作”/“确认公开发布”承接当前动作，不能放行科学错误。
- 基线 docs/OpenScience_Kimi_Development_Spec.md；设计 docs/specs/2026-09-05-integrated-research-product-design.md；服务器先读 docs/runbooks/server-capabilities.md。

## Version / environment
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release；根目录他人脏文件不碰。
- 应用 code/release 1cdd4602e39c253630678785fc90cfaf886c837a；rollback 17ebc7f7004b8920531fb39c6ce30c0365311d35。服务器无测试构建/启动/切换已完成，deploy exit0；后续docs-only HEAD不等于应用release。
- browser provider f48324870f25b50c3a21eaad898beea87fb0aa1d；provider rollback 48d9fa65db134575f53cf2a30724aa47a14eeea4。
- 服务器Chrome/CDP127.0.0.1:9233及现有playwright-core复用；第二账号已登录，普通Chat实际6Pro。noVNC http://127.0.0.1:6081/vnc.html?autoconnect=true&resize=scale。
- file:///jobs/ro-product-preview-20260911.html 是历史交互样稿，非生产；不要把它的占位/预设对话当成生产能力。真实edit页和Chat在另两个已开标签。

## Constraints
- 不测试、不预检、不CI、本机不运行应用；服务器必要构建/启动允许；SSH仅项目wrapper+Windows显式Git bash。
- 不输出.env、Cookie、密码或验证码；不重启/重新安装浏览器、不轮换账号绕限额。保护原论文/附件/版本与已公开标识。
- 暂停视频生成和批量冷启动；2–3篇真实论文质量优先。成功提交/生成/页面改版不等于科学质量或全部链路通过。

## This correction
- 已部署：移除工作台多层表单/流程按钮，嵌入媒体仅真实成果/状态；保留折叠附件/证据/历史和必要错误恢复。
- Hermes普通指令仍服务端MiniMax语义理解；style进入实际任务参数；制作/公开改为同对话确认。onPrepareVersion自动完成准确版本提交，发布仍调用原权限/审核/许可证/公开API。
- 素材/方案审核在对话中显示真实待审内容，采用N/拒绝N调用原权限与updatedAt条件更新；结果按RO/version刷新左侧。只有明确沿用已审方案时允许空instruction直达生图/视频，非空改动先修订方案。
- 主会话负责集成；Sol medium负责工作台；Sol high静态复核。本轮不运行测试、不重新提取、不生成新图/视频、不公开错误论文。
- High指出准备A期间手改B/移除附件可能错误确认A，已改为准备闭包捕获core/artifacts并在返回/确认/公开前核对；没有新hash/数据库合同。主prompt与style协议矛盾已修正。
- Chat6Pro同会话 https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581 已回复本次纠偏：迁移执行入口而非藏按钮；必须连接草稿自动保存/内部版本，以及确认执行/真实回执。不得将其产品逻辑建议称作视觉通过。
- 本轮实现服务端updateSdf自动保存与prepareVersion共用串行写入；模糊失败保留草稿、不循环重试。High最终定向复核无剩余P1/P2。
- 新版实际页面加载：初始可见button仅收起/发送；六栏目/正文和折叠资料已出现。DOM宽1151、页面scrollWidth1139、侧栏x839–1119、输入y489–636，无横向溢出；截图依旧受DPR1.25裁切，停止扩展截图诊断。未触发新模型、收费生成或公开操作，不声称全流程通过。
- Chat本次纠偏答复保存 /jobs/hermes-conversation-correction-chat-20260911.txt；部署日志本机Temp/xgs-dialogue-ui-deploy-20260911.log；图仅截图工具异常记录 /jobs/hermes-conversation-live{-css}-20260911.jpg。
- 上轮真实DOM1151×653窗口输入区y489–636可见；后续截图缩放异常已停止反复截图并恢复原视口，不据此判断产品/Chat不可用。

## Actual paper state — reuse, do not restart extraction
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；v6 47e82df5-7694-42e6-9c61-3675d0c2963a 未发布、无合格图片；Draft revision7不是v7。
- PDF artifact7bb96cc1-bb6f-4d3b-b0bf-352f41971faf；advanced extraction1e324308-fd26-4cc1-8612-8a1c269909a9已有六字段/54来源；104 Evidence succeeded且verified已实际读取，勿重跑OCR。
- 旧v3图fd719902真实服务器网页生成回传，但FWHM_s误为横向缝宽；不能挪至v6/发布。
- 方案8fcbe321-9e48-407f-a507-bc801de30422仍draft：光与电子同沿z却称正交、非零电场面积表达有误。4017673f虽approved但科学有误，不能因状态直接生成。157a3951/904809e2亦draft；71c0c79c旧chart rejected。
- 正确解释：S(z)是沿电子路径的功率密度幅值；空间FWHM不是几何缝宽、场振幅或向量z分量。区分传播/偏振/电子轴；不混19as/99as算例；保留异号旁瓣、有限束团、平均光子数≪1；理论/数值不能冒充实验。
- OSR-2026-000020/v/2仅旧E2E页面布局观察，不是新精选展示。

## Next
- 本轮对话收口已部署并打开真实edit页；不再回到样稿或重复访谈。
- 随后修正当前科学图方案并在既有服务器网页生图链路执行、审核/发布正确成果。不得称本次界面交付已完成科学闭环。
