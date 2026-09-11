# Hermes / Workbench CURRENT Handoff

## Goal and constraints
- 用户最新：成果画廊优先，详细指令默认折叠可自定义；Hermes在同一工作台处理文字/图/视频，公开先明确确认；公开页按学术阅读排版。
- 本机仅编辑/静态阅读/传输，不运行测试、预检、CI或本地构建；服务器只执行必要部署构建/启动与实际产品操作。用户授权代为审核发布，不得公开已知科学错误。
- 视频实际生成和批量冷启动暂停；复用现有PDF解析、Hermes和网页额度，不重跑OCR、不安装新能力。

## Version tuple
- worktree E:/Miscellaneous/XGS/.worktrees/onchip-video-release；branch codex/onchip-video-release。
- 本轮应用已部署b05aaeac，实际HEAD查Git；文案分组、主题/阅读栏和审核空JSON均已修。
- application production b05aaeacf810516670776f851b99794e23c8851e；rollback cec596e809a558139ea1b391a65605c104dc64ba。
- browser provider f48324870f25b50c3a21eaad898beea87fb0aa1d；provider rollback48d9fa65db134575f53cf2a30724aa47a14eeea4。
- OAuth bridge补丁独立：/opt/openscience-chatgpt-browser/scripts/host.mjs，备份host.mjs.before-google-oauth-20260911。

## Actual facts (2026-09-11)
- 服务器账号已切换成功：实际Chat账户设置匹配用户指定的第二账号，Pro。noVNC已实际显示并能操作；无需再请求登录。未复制凭据、不记录个人邮箱、不实施自动账号轮换。
- 先前noVNC连接停顿：5900一度无RFB greeting；重启画面进程后，另一次启动日志显示端口占用，现有x11vnc恢复并正常传输画面。没有证据断言XDamage/Chrome/网络根因。未新增安装或重启浏览器来修登录。
- Google OAuth只补accounts.google.com和www.gstatic.com exact:443；SolHigh独立审查通过，无通配符扩展。
- Chat6Pro已实际收到3张用户截图并完整回复：https://chatgpt.com/c/6aa3a4a4-f7a0-83ea-a0be-fc2f7eba4581 。方案：画廊+折叠制作指令、Hermes页内接续、公开760px阅读栏、保持同版来源/确认/幂等。
- 真实发布故障已定位：用户RO最新v6没有AiReview；实际点击 Review publication content，PUT版本许可证400“请求参数不合法”，POST审核未发。GET返回{licenses:{licenses,source}}，客户端误把外层对象当LicenseSet。
- RO c896802c-35dd-4b59-8db1-5f374f83a6d8；最新v6 47e82df5-7694-42e6-9c61-3675d0c2963a，draft；v5 225955a2-b985-4e81-bc4b-62bb09c85356；v4 98dbd766-6988-49f2-9ff5-b4b00eb85140；v3 e9a168a4-8314-47c8-ad9a-11e77ec9ffd2。不可把v3图片当v6图片。
- 空提交按钮一直可点击，v3→v6均draft；素材按版本隔离，v6无图片。本轮不删除旧版本、不自动搬图。
- Deep-sub-cycle高级解析task1e324308-fd26-4cc1-8612-8a1c269909a9，6字段54证据已完成，不重跑。
- v3真实图片task/asset fd719902-4288-4081-8dc4-cd7f7d166b74已成功100%；本轮首次读取已approved，非本轮批准。旧3814f844限额不能代替其成功事实。
- fd719902整图仍有科学错误：FWHMₛ标成横向y缝宽，论文对应沿电子路径z的场宽；不得凭approved状态发布。v1旧图也有已记录科学问题。
- v2一次性5Claim/50Evidence恢复已审计，冻结快照未改；不要重跑。

## Implemented changes
- API客户端正确解包许可证；公开确认一次后依次保存许可、审核、推进状态、发布；blocked保留真实原因，失败刷新状态，成功可重开公开链接。
- 发布事务用同一已审核当前Claim/Evidence和有效许可证重建最终public record，防止公开旧commit快照。版本许可证三项原子写入并与发布竞争同一Version行，已公开版本不可再改。
- 禁止无内容变化的空commit，但附件新增/替换可正常创建版本；阶段/版本URL与Hermes上下文衔接，不因普通切页造版本。
- 制作主屏为图/视频画廊；手动工具和制作指令折叠；同工作台Hermes自然语言入口、技术图风格默认、可编辑新方案。移除edit页遮挡正文的漂浮形象，保留紧凑助手栏。
- 公共实际读取组件已重排：标题/作者/摘要/主图/六字段，引用/许可/来源等按需展开；响应式与打印可访问。
- 未来ingestion确认按明确字段/producer/lineage复用新canonical Claim，保留人工/不同来源Claim；只按精确来源身份去重证据。不修改历史生产行，不按同文去重或自动验证。
- 视频保持已有服务的真实素材前置要求，不声称已生成新视频；没有可用Claim或批准方案时明确下一步。
- 请求不确定时保存原 action/sourceIds/完整指令与同一幂等键，切换版本保留原请求；已完成操作可发起独立新任务。冗余pending不再覆盖有一致已验证证据的succeeded Claim；独立High定向收尾，未运行测试。

## Latest live findings
- cec596e8服务器构建/启动完成；实际v6许可证PUT200。审核POST因空JSON请求体触发Fastify错误，候选已加{}；未绕过审核。
- 实际页面发现翻译误放public.presentation子组、工作台漏接统一主题，修正键归属和控件边框/色彩。公开页改为默认760px居中单栏，证据仅展开后占侧栏，标题36px/移动28px。
- OSR-2026-000020/v/2仍是旧E2E内容，不是最新论文凝练结果；只用于观察现有公开页，不能当作新精选。

## Active content work
- v6真实发布审核唯一阻断evidence_unverified；所有108项locator已在该审核解析，无其他block。50已验证、58待审；严格同来源+同Claim检查可继承0，不修改审核规则/不批量假通过。
- Chat6Pro已实际收到publication-review-v6-20260911.json（服务器/jobs，161042bytes，58项+13对照，隐私字段已去除），已发送逐项语义审阅要求，等待结果。原件PDF不重跑。
- 同版新Hermes方案1956a2c5-7aa1-49cf-bc69-0f645220675c已从媒体页Hermes操作栏提交，要求FWHM_s沿电子z路径、保留旁瓣和有限束团限制，已失败于storyboard:scene_0:visual_action；候选细分字段诊断并使用图片专用修正反馈，待部署后继续实际制作。
- Chat上线后复核已答复：旧六字段确认不追认为证据已核对。未来批量确认需明确涵盖主张和对应证据；本轮先实际核对，科学问题不能放行。

## Routing / next
- 网页6Pro负责截图方案；Sol medium负责媒体页和ingestion producer修复；Terra medium负责公开页与Hermes面板；Sol High独立复核发布/并发/来源与请求边界；主会话整合部署。
- 图像方案格式诊断与失败不展开手动工具已修且High静态复核完成→现有deploy.sh --no-tests部署→继续实际同版方案、生图和语义审阅后的发布。禁止恢复旧阶段预检清单。
- 当前论文科学问题/存量重复Claim仍需有来源的定向处理后才可公开；只改UI/省略测试不等于科研内容通过。
