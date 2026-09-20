# 2026-09-18 交接：Fig. 3 出图卡在 chatgpt-web 桥 + 本轮调试产物清理

> 上游上下文：[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md)（滚动状态与交付差额）、[docs/progress.md](../progress.md)（2026-09-18 各条目）、[能力台账](../runbooks/hermes-capability-registry.md)。本文件只记录本次会话实际发生的事、留存的证据、未结债务和下一步，不复制它们的表格。

## 2026-09-20 仓库完整调用链审读：桌面委派遗漏与压缩环境恢复是两处缺口

- 用户要求仔细阅读 `miuuyy/codex-chatgpt-web` 仓库检查原因。只读获取 tag `v5.0.8`（commit `00aab23eb78a0d35ab575ff14044e29c0f80e711`）、main `eaf4f09ae92d4dc4429fa597b0861663138f08f8` 与两个未合并 PR；最新发布仍 5.0.8。源码快照在 ignored `tmp/bridge-source-audit-20260920/`，仅供静态复核/后续修复；未安装依赖、执行仓库代码/测试、重启桥或新增模型请求。沿 README/TROUBLESHOOTING、安全模型、parser → server → revision/environment → native rollout → compaction checkpoint 及相关测试源码核对，独立 High 复核新增结论。
- **11:29 的 turn_id 冲突已取得对应生产者形状证据**：原目标任务的 native rollout 在 `11:29:11.228Z` 保存当前 turn `01a0be93…` 的 `function_call_output`，name=`send_message_to_thread`、有 ID、output 为完整 `<codex_delegation><source_thread_id>…</source_thread_id><input>…</input></codex_delegation>`。仅读取类型/身份/标签布尔，不输出指令正文；收据 `tmp/bridge-continuation-20260920/desktop-delegation-shapes.json`。v5.0.8 `environment.ts:171–185,246–255` 只接受普通 user 或直接父 agent_message，忽略该工具结果；随后选旧指令，`:219–234` 与新 turn 比较失败，`server.ts:584–591` 返回终止型400。因此不是没有发送新指令，而是桥接器漏认桌面实际传递形式；未捕获原 HTTP body，仍区分 native 生产记录与 wire 实跑。
- 上游 [PR #593](https://github.com/miuuyy/codex-chatgpt-web/pull/593)，head `507b84fdb2420252a88e993727dfe34aa2d406d7`，本轮 open/unmerged，正修上述 follow-up 形态。它严格限定当前 turn、工具名、item ID 与完整 delegation，修订历史/执行键可随之读到真实指令；**没有改环境配对判定**。其新增 server 用例为 browser-only，不能证明 Full 环境关卡通过；作者报告的 Linux 实跑不是本机验证。不能把单独安装该补丁当作全部恢复。
- **初次 create_thread 也有独立遗漏**：`11:13:40.404Z` 原 rollout 为同一完整 delegation 形态但 name=`create_thread`；此前唯一 user 是 plugins/AGENTS/environment 三段前言。`:162–168` 的整段文本过滤没有将此组合前言识别为上下文，`:519–590` 环境配对又只识别 user/parent instruction；真实委派被忽略，前言被误当任务。PR #593 仅接受 `send_message_to_thread`，不覆盖 `create_thread`。这与首次 missing-cwd 一致，但保留没有完整 outbound 的证据边界。
- **11:24:58 压缩后的首次失败不能归给后来的 follow-up**。前节已记录的三项 replacement_history（developer、多段 user 前言、原始 compaction，无独立人类指令）若直接进入现解析器，前言被选为当前修订；`:280–288` 只认可旧 turn 来源，`thread-environment.ts:157–164` 因当前环境但非已接受续接而在 native rollout 读取前拒绝。`server.ts:549` 仍假设 v2 保留原来源；`compaction-continuation.ts:6–25` checkpoint 仅存摘要/来源哈希，不能凭空重建被替换的真实指令。现有 grouped-preamble 测试保留旧 turn 指令，未覆盖同轮仅前言+compaction 的形态。
- 新上游 [PR #601](https://github.com/miuuyy/codex-chatgpt-web/pull/601)，head `a50081839e9457dd106796a55a495b8f72f08f65`，本轮 open/unmerged。作者报告 Codex 0.155 的七项 outbound：环境前言 → user 文本摘要 → developer → 真实 user 指令；旧 `canonicalMetadataEnvironmentBeforeUser` 只越过 developer，被摘要挡住。补丁让有来源约束的文本摘要可跳过，保留环境元数据核对；**不处理原始 type=compaction，也不补缺失的真实指令**。本机只保存 replacement_history，不能把它直接等同作者的 outbound；该补丁是明确相关缺口，不是本机全面修复证据。
- main 的 `cea5e1c` 仅补可信同轮 steering 恢复，提交说明明确不声称解决全部续接；上述两 PR 尚未入 main/发布。推荐修复范围是统一识别经过原生身份认证的 create/follow-up 委派，令修订选择与环境恢复使用同一指令判定，再针对真实 compaction wire 形态补接；保留当前 thread/turn/roots/沙箱核对，不能删冲突检查或手写 cwd 绕过。需要运行证据的阶段仍受当前本机静态操作限制；本轮未修改 live bundle，完整 Full 链路未交付。
- 能力边界补核：[`TROUBLESHOOTING.md:192–203`](https://github.com/miuuyy/codex-chatgpt-web/blob/00aab23eb78a0d35ab575ff14044e29c0f80e711/TROUBLESHOOTING.md#L192-L203) 明确网页聊天内生图不是当前受支持 turn 类型，原生 image API 是透传 Codex 后端、不会获得 Chat 网页额外图像额度。本机桥用于 Pro 代码协作，项目服务器 image provider 的稳定性/产物交付仍独立。206 已恢复且与这些消息格式缺口分开；三类风格、真实原图 reuse 和 Fig. 2 状态不变。

## 2026-09-20 防止临时产物再次撑爆沙箱，桌面续接静态定位

- 用户要求继续解决、避免复发并及时清理不用的东西。本轮从 `570744cc` 继续，静态元数据仍为 home 顶层 353 项、原 `ultron-*.log` 0；沿用下节唯一成功的 elevated/read-only 运行证据，未重复沙箱探针、模型请求、测试、预检、CI、构建或部署。最新用户指令已重新明确本机只允许静态阅读/编辑/Git/传输，canonical AGENTS 同步该边界。
- 已把临时产物归位与收尾清理加入 `C:/Users/Mac/.codex/AGENTS.md`，并更新交付树 AGENTS：显式项目工作目录；生成物进入所属项目 ignored tmp 或私有应用数据目录；按归属、生产任务已结束和无活动使用判断，不能凭年龄删除；归档须保留原路径、权限、恢复说明并同步生产者及原有证据存在保护。全局规则修改前副本留在 ignored `tmp/bridge-continuation-20260920/global-AGENTS-before-hygiene.md`。
- 找到两个历史一次性生产者 `C:/Users/Mac/ultron-v3-continuation-acceptance-run.ps1`、`ultron-v3-test-only-acceptance-run.ps1`：原日志已归档，旧路径的“存在即停止”保护会失效。仅将各自 `$logPath` 指向私有归档中的同名原结果日志并加注释，原执行与保护逻辑保持；静态确认两目标都存在，没有执行脚本。原脚本保留于 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920/producer-scripts-before-fix/`。这是修复历史重跑保护，不代表所有生产者已改写。
- 已创建当前任务的每日 09:00（本机时区 Asia/Shanghai）heartbeat **本机临时产物维护**，id=`automation`，ACTIVE。只处理确认不用的生成物；仍需证据的完整私有归档，保留权限/原路径/恢复信息并修正生产者；保护活动日志、浏览器/会话/秘密、用户资料、独有资产和回滚副本。不运行测试/模型请求/服务探针，不重启桥，不重跑 268 日志归档；无可操作变化时保持安静。已有此任务，后续更新它，不重复创建。独立 High 对规则、脚本相对备份的差异及两目标存在性完成静态复核，未发现新增风险；heartbeat 尚无实际运行观察。
- 其余 home 顶层 `ultron-*` 仍有 186 文件（约 812 MB）和 24 目录，包含脚本与压缩包；尚未证明不用，全部保留。另一个 Ultron 用户任务仍 active；未更改其工作树、未重启共享桥、未清代理活动日志。此次没有新增删除，上一轮归档原件及完整备份仍在。
- 桌面续接新增证据仅取自目标 native rollout 的消息形状/身份字段：11:24:58.538Z 的 `replacement_history` 恰三项——同轮 developer、多段 user（插件/AGENTS/独立 environment_context）、加密 compaction；没有独立原人类指令。各 turn_context 的 cwd/roots 仍正确。未解密或输出加密正文/隐含推理，未捕获 raw outbound，所以这仍是与故障一致的静态假设，不能声称线路字段已确证。
- 对照安装版 5.0.8 的 `environment.ts`、`thread-environment.ts`、`compaction-continuation.ts`：多段环境前导可能被当成人类修订；同轮 ID 随后不满足旧轮续接分支，导致在 native rollout 环境恢复前拒绝 cwd。当前 checkpoint 只存摘要/源哈希，若原人类指令被替换则不足以恢复原修订。独立 High 静态复核认为修复必须限定同 daemon 已完成的精确 thread/turn/model/effort/摘要 checkpoint、无更晚真实指令，并以 native rollout 验证环境权限，不能全局放松 turn 冲突或接受任意摘要。
- 本轮公开版本仍为 5.0.8；未发布 `cea5e1c` 的 steering 修补不能作为剩余 compaction 已修的证据。没有热改第三方 bundle、改可信缓存或安装未发布版本。下一步须在允许的维护窗口取得精确续接请求的脱敏结构，再据此采用可审查的上游修复；当前本机运行限制与共享桥活动期间不执行该请求。短 CLI Pro 文本审查已有真实证据，完整 Full 工具/桌面压缩续接仍未交付；不以环境清理代替三类风格和真实论文图交付。

## 2026-09-20 已授权归档，Windows 沙箱 206 已恢复

- 用户对上一节精确 268 个 Ultron 历史日志清单明确回复“确认”。本轮在 `10461a02` 上执行环境恢复；应用/provider/配置/模型路由均未变，未新发 Pro/科研模型或生图请求，未运行项目测试、预检、CI、构建或部署。
- 仅清单内 `C:/Users/Mac/ultron-*.log`（268 个、1,583,990 bytes）完整归档至 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920`。全部源元数据匹配并独占读取；原 ACL 的 Allow/owner 逐项确认只含当前用户、SYSTEM、Administrators。新归档目录关闭权限继承，仅允许这三者；完整 ZIP 备份逐项 SHA-256/长度吻合后才用同一 PowerShell 的 `Move-Item -LiteralPath` 移动原件，再核对每件内容、创建/修改时间、属性与原 SDDL 完全相等。代理日志、脚本、配置、浏览器资料和秘密未动。
- 首次执行在目录 ACL 文本比较安全停下（归档空、268 源全在），原因是 Windows 读回 `D:PAI`、内存描述符为 `D:P`；实际 owner/group、protected 和三项规则完全正确。独立 High 复核后改为逐项核对身份、Allow/FullControl、继承/传播标志；再次核对精确空目录非 reparse 后仅非递归移除此空目录，再执行修正版成功。没有放宽实际权限或删除日志内容。
- 最终收据 `archive-record.json` 为 completed/moved=268，原路径剩余 0，home 顶层 621→353；目录 protected=true、恰三项 ACL、CodexSandboxUsers 规则 0。同目录保留 `approved-inventory.json`、`original-content-backup.zip`、含原路径/SDDL 的收据及 `ROLLBACK.md`；原件与备份均保留。只读核对/回滚不得输出日志正文，恢复原路径须逐项检查冲突、禁止覆盖；恢复全部日志可能重新触发 206。
- **唯一修复后运行验证**：2026-09-20T14:36:22Z，已安装 CLI 正常执行 `sandbox -P :read-only --include-managed-config -c windows.sandbox="elevated" -C <canonical>`，子命令仅读取 `HermesPresentationAction.tsx` 首行。实际输出 `'use client';`、exit0；helper `payload_len=22584`（修复前 42060），本次新增 error206=0。收据在归档目录 `sandbox-read.json`，本机副本 ignored `tmp/bridge-continuation-20260920/archived-sandbox-read.json`。这是原生 elevated 只读文件执行成功，不只是 CLI 返回文本。
- 本机 206 阻塞已解除，未改变 Codex 配置、USERPROFILE、沙箱后端或可信缓存；底层 argv 长度依赖仍是上游缺陷，不能称永久根治。桌面 cwd/turn_id 压缩续接仍未解决，本轮未重试旧 Chat 任务或实跑 Pro 工具回合，因此完整 Full 联动仍未验收。后续可沿已成功的短 CLI 协作继续原定配图任务；不得重复归档脚本或把这次成功扩展成全部链路通过。

## 2026-09-20 本机桥续接与 Windows 工具故障定向取证

- 接手 `9bc03dc4`，应用/provider 未改动；本轮不重发旧 Chat 任务、不生图、不切 provider、不改 Fig. 2。只读取非秘密配置/故障日志/目标任务元数据与公开源码，未运行项目测试、预检、CI 或构建。沿用前节已经成功的短 CLI Pro + 精确源码文本协作；完整 Full 工具联动仍未交付。
- Windows 已安装 `codex-cli 0.155.0-alpha.9.2`、既有 `windows.sandbox=elevated`。既有 helper 日志明确记录 `payload_len=42060` 后 `orchestrator_helper_launch_failed / os error 206`；单个参数已超过 Windows CreateProcessW 32,767 字符上限，目标读取命令未开始。公开 `setup.rs` 把完整 Base64 setup payload 放在一个 argv；全盘读取分支枚举 USERPROFILE 顶层项。本机按该排除规则的 615 项路径数组 Base64 长度约 40,592，强烈支持路径枚举膨胀，但没有读取真实 payload，不能声称字段组成完全确定。相关上游 [#32315](https://github.com/openai/codex/issues/32315) 在本轮读取时仍 open；缩短任务提示/cwd 不能消除这份 payload。
- 已说明范围并经独立 High 静态审阅，仅执行一次零模型的单文件只读配置候选：`codex sandbox -P xgs_bridge_read --include-managed-config`，每次命令 `-c` 指定 `:minimal` 与目标 TSX 为 read、network=false、保留 elevated；子命令只准备读取 `HermesPresentationAction.tsx` 首行。结果 exit1：`elevated Windows sandbox requires effective :root read access`，新增 helper payload 记录 0，源码未读。**配置解析受支持，但本机后端拒绝限定读取范围，不是修复成功**；未持久化配置、改 ACL/缓存、降级沙箱或扩大权限。收据 ignored `tmp/bridge-continuation-20260920/scoped-sandbox-read.json`。
- CLI 语法纠正：本机是 `codex sandbox [OPTIONS] [COMMAND]...`，没有 `windows` 子命令。先前按公共 main 的旧布局调用 `sandbox windows --help` 实际触发初始化并重现 206；没有执行目标命令/模型。后以 `codex help sandbox` 正常取得本机帮助，后续不得再用旧语法取帮助。
- 桌面目标 `01a0be85…` 的 native rollout 中，各 `turn_context` 均有正确 cwd（包括 11:24:58Z 压缩返回后）；因此不是用户未提供工作目录。原始 outbound metadata 未捕获，cwd/turn_id 冲突根因仍不能精确归于某个字段。桥上游 [cea5e1c](https://github.com/miuuyy/codex-chatgpt-web/commit/cea5e1cc472c9acf6f56b0c498bc70e0b4a5eb0c) 新增以当前 native rollout 认证同轮 steering 的环境恢复，保留 compaction 原错误；该提交明确未打包/发版，也未声称解决剩余续接问题。安装版本仍 5.0.8，未套未发布源码、重启桥或篡改可信环境。
- 独立 `review_style_chain` 请求曾从 loopback 17841 返回 502/Unable to connect；随后只读确认原 bun PID27600 仍监听，不能用进程存活证明请求可用。另一个独立 High 完成上述候选静态审阅；未以反复 Chat 请求探测连接。当前可靠范围只沿用已取得回答的源码文本审查，不把一次成功写成长期稳定。
- 用户追问沙箱可否修复后，仅盘点 home 顶层元数据：621 项（492 文件/129 目录），其中 268 个 `ultron-*.log` 共 1,583,990 bytes，最后写入均在 9/5–9/7；唯一其他 `.log` 为仍在更新的 proxy 日志，明确排除。精确清单位于 ignored `tmp/bridge-continuation-20260920/ultron-log-archive-candidates.json`，未读取日志正文/移动文件。将这批历史日志移入一个已有顶层目录下的归档，按路径数组估算可减少 19,476 Base64 字符，helper 从 42,060 降到约 22,584、顶层剩 353 项；这是待验证的环境缓解，不是底层传参修复。独立 High 认可可回滚候选，但要求跨项目授权。已向用户提出归档到 `C:/Users/Mac/AppData/Local/Ultron/Archives/sandbox-recovery-20260920`、保留精确原路径/完整性校验/回滚后只做一次无模型只读验证，答复待收；未执行。该既有 Ultron 父目录继承 CodexSandboxUsers RX，而抽样原日志仅三项 ACL，批准后应保留原文件访问边界，不能让归档额外开放读取。
- 本节归档提议及“待答复”是前一回合历史状态，用户随后已确认并成功执行，结果见顶部最新节；不得按本节再次移动或验证。桌面续接及三类风格/真实论文图 reuse/深色标准化差额仍保留，文档取证不重部署。

## 2026-09-20 Pro 协作已回收，风格链路已部署

- 用户明确允许创建兼容协作任务，并授权自行判断桥接操作。风格候选 `ba460f1e` 经下述 Pro 反馈修正为 `7a3a6a85bdbe19f9bd63009c841087ba3e06e824`，已推送并部署应用/独立 provider，精确版本以 CURRENT 为准；未新生图、审批/发布资产或改动 Fig. 2。没有运行项目测试/预检/CI。
- 已用 Codex app 创建 **Chat Pro 审查配图风格链路**，requested model=`chatgpt-web/pro`、effort=`ultra`；正式 task=`01a0be85-8abc-72c0-b073-44ace940c050`。首次创建约 8 秒即报 `missing cwd in trusted Codex environment context`，应用自动归档；经正式工具恢复同一任务，以正常后续消息继续。该任务的临时 worktree `C:/Users/Mac/.codex/worktrees/a7d5/XGS` 后已不在实际 Git worktree 列表；未在其中编辑，实际审查源始终为 canonical 精确候选。
- 路由实证：本机 loopback `17841` 监听 PID=27600，执行本地 **codex-chatgpt-web 5.0.8** 的 bun/cli.js；config 为 full/compatibility-v1/automatic、proAvailable=true，Codex 路由指向该端口。只读非秘密字段，未修改配置、profile、缓存或安全校验；不能从路由配置推定已获得 Pro 结论。
- 后续 turn=`01a0be8a-ee0e-7e22-9c8d-1512cd08f2aa` 于 11:19Z 开始；bridge trace=`ebdfd504f144` 在 11:23:36Z 记录 `submission accepted evidence=user_turn`，11:24:58Z 记录 `accepted structured compaction handoff`，随后缺可信 cwd，11:25Z failed。缓存中的 cwd 已正确，未手工改写。再以正常新消息续接，turn=`01a0be93-c806-70d0-aa58-7889c49367bb` 立即报 `current user message conflicts with native Codex turn_id metadata`；已停止桌面任务重试。**Chat 接收过压缩请求，但未返回该任务的代码审查答案**。与上游 [#561](https://github.com/miuuyy/codex-chatgpt-web/issues/561) 现象相近，未证明同根因。
- 独立 High 同意一次隔离 CLI 尝试：已安装 Codex 正常 `exec --cd <canonical> --sandbox read-only --model chatgpt-web/pro`，未改全局模型/路由/审批。新任务 `01a0be9a-a7c0-7003-9b08-ee12e130ef19` exit0 并实际返回 Pro 文本；但读取源码时 Windows sandbox helper 报 `orchestrator_helper_launch_failed / os error 206`，Pro 明确未完成代码审查。桥返回模型答案已实证，完整工具联动尚未打通。该请求使用了 Chat 额度，不是免费恢复。
- 主任务静态读取精确 11 文件 diff 和 3 个邻接定义，以文本交给同一 CLI 任务正常 resume，保持 read-only，要求零工具。turn=`01a0be9f-0450-7cc3-9acb-538317877bf1` 于 11:47:21Z completed、CLI exit0，实际返回 Pro 静态审查且没有命令执行：唯一 P2 是 paperOriginal art 草稿被前端禁止确认时误显示“先确认来源”，遮蔽真正限制。其余所给差异未见确定新增阻断；不等于运行/审美通过。证据 `tmp/bridge-pro-review-20260920/review-packet-result.md` 和 `packet-events.jsonl` 仅在 ignored tmp，未提交私密日志。
- 已按该 P2 修正聊天确认卡及独立表单：保留原提交资格条件，区分来源无效、论文原图不可直接换风格及其他不兼容艺术方案，双语提示返回重新规划绘制。独立 High 对三文件新增差异确认布尔条件等价、原请求重放未弱化，两种入口均使用对应提示。Pro 未获得的 Domain 调用顺序由主任务定向补读：`submitPresentationGeneration` 第 174 行 `requireStoryboardBase` 在第 182 行 `createAgentSession` 和第 186 行 `submitAgentTask` 前；仅为源码证据。未运行测试/预检/CI。
- 必要发布准备只读实证：服务器 release=`7bf8c5e5d2df33df21e77716aa5e7173deaffa75`、rollback=`561d738bb10a4926ac0e5c46356d90749557c5d1`；renderer=`sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f` 仍存在。image/review 两队列 deadline+1h 内无终态请求均 0，未知 metadata=0；两个 timer 原已 active/waiting。live runner/review-runner/page-lifecycle 的 Git blob 与候选完全一致（8d0906fb/c4767efd/98be025f），不会覆盖未入库的不同修补。
- 独立 High 操作审查后，干净已推送的 `7a3a6a85` 执行既有 deploy `--no-tests --skip-migrate --reuse-unchanged-capability-images --rollback-ref 7bf8c5e5…`：必要服务器 build/start exit0，未迁移，未运行功能探针；retention 不带 prune，不删除 renderer。随后同 immutable release 的 `install.sh --confirm-provider` 使用恢复后的 `4a30b091…` renderer，exit0；未重启 Chrome。收据 `tmp/bridge-pro-review-20260920/{deploy,provider-install}.log`。两个 service ExecStart 已指向新 bundle，timer 保持 active/waiting，最近 oneshot exit0；不能据此宣称新请求/异常恢复已运行成功。
- 安装前重读两队列：image requestFiles=144、review=51，deadline+1h 内无终态项均 0，未知 metadata 均 0；timer 原为 enabled/active/waiting。原三锁内备份 exit0，目录 `/opt/openscience-chatgpt-browser/provider-backup-20260920-7a3a6a85`；取锁前校验 jobs 身份及锁非链接。三 live 文件和四 unit/状态已保留，旧 config/bundle 原位不动。部分安装失败应先停两 timer 派发、等原任务释放三锁，再恢复文件/unit、daemon-reload 及原 timer 状态；本次未失败、未执行恢复，应用与 provider 回退独立。
- 最小实际产品路径：新建本轮只读观察 tab，站内点击「概览 → 图解与视频 → Hermes」，使用原 RO/version。Fig. 3 图片实际 complete、1280×720，仍 draft；Hermes 弹层能打开并加载既有规划失败和稿件入口，但没有现成风格确认卡，未输入/发送指令。因此新风格确认、草稿恢复/重放及原图提示仍只有源码/构建证据，不记为真实操作验收。收据服务器 `/jobs/style-chain-product-20260920.json`、本机 ignored `tmp/bridge-pro-review-20260920/product-observation.json`。本轮观察 tab 已关闭，原页面保留。
- 接续边界：本次实际可用的协作路径是短 CLI Pro + 精确源码文本，完整 Full 工具联动及桌面压缩续接尚未根治；不盲重发旧任务，不改信任缓存/安全校验。三类风格的新端到端请求、真实论文图 reuse、深色固定暖底标准化和 Fig. 2 五项清理仍按 CURRENT 原差额推进，不因部署或 Pro 回答置 done。

## 2026-09-20 继续：Hermes 风格与逐图计划入口补接

- 用户确认本机桥接启动器已可正常工作，要求与 Chat 6 Pro 合作继续原定三类风格/稳定性任务。接手 canonical HEAD=`a16a0546467d0d0be7dc538e2f2f87900653beca`，根 main=`acd13a71`；两树干净。生产/rollback 沿用 A 恢复记录，本轮尚未部署。
- 本机现有 `openai_base_url` 已指向 loopback `127.0.0.1:17841/v1`；只读此非秘密配置，没有修改配置或重启。实际以 `chatgpt-web/pro` / `ultra` 请求独立子审查 `chat_pro_style_review`，在跨后端任务交付时收到 `ChatGPT Web cannot read this encrypted cross-backend subagent payload`，桥要求新 Compatibility V1 任务或来自 Web 的受支持明文委派。没有取得 Chat 审查答案，未盲重发，不能写为已与 Pro 完成协作。已询问是否创建独立兼容任务，等待答复；不创建用户未明确要求的新任务。
- 新增源码断点：`HermesAssistantDrawer.resultFromTask` 不仅 DTO 旧，还运行时拒绝 scientific/editorial；接收结果及 `HermesPresentationReview` / `HermesPresentationAction` 丢失 figurePlan，原草稿类型虽有字段但没有保存/恢复/提交。因此已有 API 实跑不能证明自然语言站内链路可用。
- 本轮候选沿现有链修复：Web style 类型引用 StoryboardRequest、接收自由 style 并复用既有 figurePlan 校验；逐图计划贯穿确认/草稿恢复/不确定请求回放/最终提交；新增编辑封面选项及中英文名称，未知目录名安全显示，沿用确认及幂等。figurePlan 依赖按内容而非对象引用触发，避免父组件重渲染重置正在编辑的草稿。
- art-only 仅明确切换风格时采用新 style，调色/排版不指定 style 时保留 base.style 和原逐图风格；明确整组换风格同步覆盖生成图的 styleId。原始科学字段仍由既有 planner 保持。含 paperOriginal 的计划在 guide/Web 资格与 Domain 提交前拒绝 art-only，worker 也保留明确阻断；这是前置报告原有不支持范围，不是交付了论文原图改绘。需要另建 re-render 计划，不能把复用图悄悄变成生成图。
- 独立 High 首轮发现两处新增差异：模型可改写 art.figurePlan 的非风格字段、确认卡只显示全局风格。已按 base 映射只采纳 styleId 并保持未指定图的旧风格；沿原结构化纠错拒绝错误图 ID/decision/caption，确认卡显示每图实际风格/reuse/skip，不确定重放显示原请求。第二轮发现原 resultGuard 未验证数组元素、scene.image 的原 payload 不带 figurePlan；已补完整结构校验/对应纠错提示、从父方案与原请求 sceneIndex 解析风格。最终独立 High 定向静态复核未见新阻断；此前 a16a0546 的桥恢复/逐图 style 候选审查复用，不重审整个分支。未运行测试、预检、CI、构建、服务探针或新的科研模型/生图请求；没有服务器操作、审批/发布或 Fig. 2 清理。没有新 PNG/审美证据，不能声称三类风格全部验收或零技术债。
- 待继续：取得兼容任务选择后完成真正的 Chat Pro 协作；再按已授权范围交付代码和桥候选，必要运行观察事前说明且不自动付费生图。真实论文图 reuse、深色图标准化固定暖底的视觉边界、Fig. 2 清理及原 Taskmaster 1/2/4 的差额仍保留。
## 2026-09-20 续作：三类风格链路候选与本机 Codex Web GPT 核查

- 用户对恢复的 Fig. 3 回复「没有问题」，随后将目标明确为多风格兼容和稳定运行；选择先完善学术、编辑封面、淡彩三类。本次认可不自动审批/发布资产，不把全部风格或长期稳定性标完成。Fig. 2 五项清理仍未授权。
- 本机代码候选在本节所属提交保存，**未部署、未构建、未运行测试/预检/CI、未发模型或新生图请求**。用户随后转向检查已安装的 `miuuyy/codex-chatgpt-web`，服务器生产 release/rollback/provider 配置沿用 A 恢复后的状态。
- 已查明待修断点：逐图 style 只进 art 请求但末审/render 回到全局 style；art 场景不足时静默补 technical、多出时截断；科学标签 ASCII 转译有损；figurePlan 全 skip 或输出合计超过 6 场景会在模型调用后必败；scene 标题仅提示、不校验图 ID 对应。候选复用现有 figurePlan provenance、有限结构化纠错及既有风格加载，不新增模型阶段。
- 风格候选已补上述五点：`storyboardSceneStyles` 消费原 provenance，`illustration-styles.ts` 共用多风格参考合并，render 的所选风格摘录提前避免被 1500 字符尾部裁掉。**剩余已知债务**：Hermes 自然语言 art-only 的 `workspace-guide.ts` 仍强制 base.style、Web DTO 仍旧三值枚举；含 paperOriginal 的 art-only 仍受原 source support 限制。本轮未扩这些入口；不得宣称零技术债或整个产品换风格已完成，后续发布前先收口这些入口。八文件候选独立 High 静态复核未见新增阻断或明显编译错误；未构建/未运行，不代表线上完成。
- Broker 候选：renderer 缺失时撤销 `.ready` 且不领取新任务；downloaded 后标准化失败记 uncertain；同任务目录/完整 PNG 可复用，pending 输出验证后发布，一次额外本地标准化使用私有标记限制重复处理；收据先保存副本再原子覆盖。独立 High 指出的 receipt 缺席崩溃窗口及 execute 返回字节后 deadline 竞态已修并静态复核无新阻断；尚无运行证据，原 grace 时限/旧任务身份/沙箱保持，历史 failed 不自动恢复。
- 本机只读事实：安装并运行 **Codex Web GPT 5.0.8**；`launcher-state.json` 为 automatic、autoStart/keepRunningOnClose=true、experimentalBiggerContext/experimentalSkillAttachments=false、browserSmokePassed=false、mcpGuideStep=0。`.codex-chatgpt-web/config.json` 不存在，当前 Codex `config.toml` 未见 `openai_base_url`；当前会话没有该工具或 Web 模型入口，不能称 Full harness 已接通。
- 既有脱敏事件：16:24/16:27/16:29 为 ERR_CONNECTION_TIMED_OUT；**16:33:11 browser.authenticated** 证明启动器已记登录成功，旧超时不等于当前登录失败。未读取 Cookie/浏览器存储/Secret，未做 doctor、smoke 或 MCP 实际发送。
- 项目文档说明该软件通过 loopback Responses 路由把 ChatGPT Web 放入 Codex 模型选择器；Full harness 的 MCP 方向是 ChatGPT → 当前 Codex 工具，而非在原生 Codex 中增加普通 ask_chatgpt 工具。配置尚缺模型路由和 Full harness 引导；具体选主模型或委派方式需按用户选择接入，不能擅自切模型/改全局路由/重启当前任务。原 README 已只读保存到 ignored `tmp/codex-chatgpt-web-review/README.zh-CN.md`。
- 适用边界：上游 5.0.8 文档明确**不支持 ChatGPT 网页会话中的生图完成/回收**；原生 Image Gen 仅转发，不提供额外生图额度。因此可用于分析/审查/编码协作，不能直接取代 XGS 服务器生图桥。稳定用法优先单任务单 Web 会话、原请求续取、不双重控制同页，不因超时或限额重发/切号。多账号仍只讨论，未接入。
- 用户随后明确希望最大限度利用并询问 Full 模式：建议 **Full harness + Automatic**，原生/Web 混合委派先沿上游 Compatibility V1；初始只保留一个活跃 Web 工作单元，Bigger Context 保持关闭，不改现行 Codex 主模型或审批。接入顺序为启动器模型安装 → 私密配置同账号 Tunnel → ChatGPT Developer Mode 中新建精确 `Codex Native2` → 完成接通 → 在合适检查点重启 Codex加载目录。尚未执行这些配置、下载或模型验证。
- 参考真实使用反馈：[#599](https://github.com/miuuyy/codex-chatgpt-web/issues/599) 的 Windows 用户报告显式 provider 兼容方案有效，但仍是候选分支、不能自动套到本机；[#561](https://github.com/miuuyy/codex-chatgpt-web/issues/561) 报告 Windows 5.0.8 压缩后续接失败；[#594](https://github.com/miuuyy/codex-chatgpt-web/issues/594) 报告选定与实际解析模型不符。三者均为用户报告、未在本机复现，不把安装成功/登录成功称为长期稳定。
- 参考：[README](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/README.md)、[架构](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/docs/architecture.md)、[故障排除](https://github.com/miuuyy/codex-chatgpt-web/blob/v5.0.8/TROUBLESHOOTING.md)。启动器/配置修改须按实际接入方式继续；不按上游默认清单触发本项目已禁止的测试。

## 2026-09-20 A 恢复已完成（此前执行状态）

- 用户选择 A：恢复已有图，不新增生图、不清 Fig. 2。独立 High 静态审阅恢复脚本与原任务重试链路 GO；未运行测试/预检/CI。
- 标准化依赖已恢复：原 `apps/media-demo/Dockerfile`、生产源 `7bf8c5e5`、已有 Node/scansci 基础镜像；Debian 源下载缓慢后中止本次 build container，仅将临时构建文件源主机替换为项目既有 Aliyun mirror，保留 apt 签名验证。新 renderer=`sha256:4a30b091d4bdeb7dd7670a01521d30d7b32694e1f3b34977a2aa26e91669559f`，tag `openscience-media-demo:recovery-20260920`。image broker 的原 config-6a65dc7b 只更新 rendererImage，provider/bundle/浏览器会话不变；应用 release/rollback 仍为下节值，没有发布科研应用代码。
- 锁内恢复：`/opt/openscience-chatgpt-browser/recovery-20260920-9f7ff671/recover.mjs` 校验唯一 task/hash/request/source/submitted/downloaded/原图，沿原无网络、非root、readonly、512MiB ffmpeg 参数输出 **1280×720 / 486,042 bytes**。原 spool failure 硬链保留为 `spool/results/9f7ff671-bf9e-4062-a3df-8236f7431975/result.failed-before-recovery-20260920.json`；原 request/deadline/PNG 不变。Gateway 原 `resumeFromCompletedResult` 已读回对应 PNG/hash，才发原 API retry。
- 产品实际结果：原 task `9f7ff671` **succeeded / 100 / retryCount=1 / executionAttempt=2**；同 ID image 资产 **draft**，generator=`OpenScience Hermes scene image / chatgpt-web`，parent=`8141b5fd` scene0，contentHash=`9b4984df523714a5c1ed690566ef2fd4aa6682d446a3f9f0f76cb3c39f260611`，promptHash 保持 `c5329a4b…`。completedProviderRecovery 跳过 prompt planning/generateImage，新增模型请求 0。未审批/公开。
- 实际产品路径：已登录页面「研究详情 → 图解与视频」，恢复后再次「概览 → 图解与视频」，当前私有 version=`e77dc3c7`，目标卡片题为「Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子」、待审阅，目标 img complete=true / naturalWidth=1280 / naturalHeight=720。截图 `/jobs/fig3-recovered-product-20260920.png`，原 API 操作收据 `/jobs/fig3-product-recovery-20260920.json`；本机图/截图均在 ignored tmp。已看图只证明可显示，不代表科学或审美通过。
- 前置与顺序：此为**已执行一次性操作，不重跑**。源/收据完整、现有 image-runner flock 排他 → 隔离标准化 → 先写 PNG 后原子写 succeeded → 原 provider 读完成结果 → 原用户 API retry → 实际站内查看。恢复脚本/构建日志/镜像源变体/receipt/config.before.json 均保留在上述 recovery 目录；没有创建新模型请求、修改 deadline 或重开 Chat。
- 回退边界：原始 PNG 和 failed 收据保留；不要把成功收据改回 failed 或重置 retryCount。配置备份只用于审计/有依赖的回退，旧 renderer 已缺失，不能盲目恢复旧配置。若图质量不合格，仍按既有待审/拒绝流程处理，不自动重画。按需 renderer 没有常驻容器，须保留新镜像。
- 剩余：用户本轮已认可此图；Fig. 2 五项周期清理仍待明确同意，真实论文图 reuse 尚无真数据交付，多风格/批量差额保持 CURRENT。下节只读取证为恢复前历史，不再代表当前任务状态。

## 2026-09-20 只读取证更正（优先于下文 9/18 历史结论）

- Git：接手 HEAD `02c19579`，与 origin 跟踪引用相同；相对生产只有五份文档差异。服务器读回 release `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` / rollback `561d738bb10a4926ac0e5c46356d90749557c5d1`；本轮不部署。
- **“Fig. 3 从未生成真实 PNG”已被新证据否定，产品交付仍未完成。** DB task `9f7ff671-bf9e-4062-a3df-8236f7431975` 的 payload 绑定 plan `8141b5fd-fd47-4c8e-b9f3-4b6558009095` scene0。桥根目录 `/opt/openscience-chatgpt-browser/` 下 `jobs/<task>/submitted.json` 记录 9/18 **12:30:03.050Z** 提交；`jobs/<task>/result.json` 在 **12:31:07.080Z** 记录 downloaded、1448×1086、1,071,490 bytes、scientificReview=pending。`jobs/<task>/output/image.png` 与 `private/<task>/browser-result.png` 字节相同且 PNG 头/尺寸匹配；未进行科学或审美审图。
- `private/<task>/normalized/` 为空；`spool/results/<task>/result.json` 于 **12:31:07.145Z** 写 failed/EXECUTION_FAILED，DB task failed、同 ID 图资产 0 行。故最后一次失败在**浏览器下载之后、标准化输出之前**，不是提交前失败，也不是完全没有原始图。对外 result 与内部 downloaded 必须分开判断。
- 运行桥 bundle `6a65dc7be5a83258887d9b193630dc1a2a3698f1` 的 `finalizeWebImage` 在保存 browser-result.png 后创建 normalized 并调用隔离 ffmpeg。当前配置 rendererImage=`sha256:1c47a579ceb608f244878b41888eee50bda1135ff325cb7b49de3a275ee2013d`，`docker image inspect` 返回 No such image。这是当前恢复阻塞/历史故障候选；历史 journal 仅保存 failed，未保留 Docker/ffmpeg 错误，不能证明 9/18 当时镜像就缺失，亦未运行容器复现。
- 容器日志在 12:30:02.307Z、12:30:03.973Z 有 WebGL1 blocklisted，12:31:07.071Z 有 dbus 错误；其后同任务下载收据与 PNG 已存在。只能确认时间相近，不能把它们判为阻断出图的根因。此次证据只覆盖末次任务，不替前两次失败下结论；历史 39% 是 spool 失败比例，不能解释为模型未出图率或纯偶发抖动。
- Fig. 2 五项 `6439150a`/`ee9bcfb6`(draft)、`6043bebb`/`75b34c88`(approved)、`d5087b03`(draft image) 都未软删除，属于私有 draft `e77dc3c7`。每项 1 条 Claim 关联、0 条 Hermes research step 外键引用、1 份私有 research_record 快照引用、0 份公开 publication 快照引用。前三个 plan hash 同为 `9b43357558e2`，第四为 `449ce484fa7d`，不能说四个逐字相同。copy 的 parent 为 `75b34c88`，paperOriginal.sourceAssetId=`929bd95d` 已无资产行。
- 产品影响依据 DB + 静态代码：listPresentationAssets 包含该版本未删除资产；ResearchPresentation 消费该列表，HermesMediaReview 筛出 draft，故私有素材列表包含五项、待审列表包含三项；未实际点击 UI，不声称已观察屏幕展示。建议用户同意后通过现有可恢复清理机制处理整个周期，并处理私有快照/Claim/父子依赖，不直接硬删五行。未改资产或任务。
- 待用户选择：**优先恢复已有原始图**（不重发模型，先处理标准化依赖，导入后仍需审图）；或显式指定 fallback 新生成（新增额度且不保证质量）；或真实论文图上传 reuse（无生图额度，需真实原图，不能替代 editorial 重绘交付）。不建议原样第四次重发。已超过自动恢复宽限，不能直接重跑旧恢复/清理脚本。
- 本轮只有只读服务器日志/收据/SQL/镜像元数据与文档同步；未测试、预检、CI、构建、启动、安装、重试生图或切 provider。下文三连失败及“没有 PNG”保留为历史记录，以本节纠正为准。

## 0. 30 秒结论

- **plan 段真的跑通了**：`8141b5fd-…`（interactive_html）**approved**，figurePlan `{"figures":[{"id":"Fig. 3","styleId":"editorial","decision":"re-render"}]}`，scene0 标题 `Fig. 3: 圆孔横截面上的 Bethe 等效偶极源与角谱形状因子`（真 MiniMax 输出 + chat-review 通过）。这是「figurePlan → 逐图规划」在当前生产 release 上的真实证据。
- **image 段第三次失败**：把该 plan 的 scene0 交给 chatgpt-web 桥出图，任务 `9f7ff671-…` `failed / image generation failed`（桥返回 `EXECUTION_FAILED`）。**至今没有任何一次真实的 chatgpt-web PNG 产出**对应这个 plan；最后一次真实桥出图成功是 2026-09-17 02:28 的 `ac455b2f-…`（spool `result.png` 590,049 字节）。
- **本轮清理留下了两处必须处理的后果**：①`docs/progress.md`（2026-09-18 paper-original 条目）与能力台账第 128 行**仍引用三个已被我删除的占位资产**（`929bd95d` / `6088f11b` / `03a160aa`）；②`d5087b03-…`（paper-original copy，draft）的 provenance 指向的源资产 `929bd95d` 已被删除 → **悬空引用**。文档漂移已在本轮原处加注更正，DB 残留留给下一轮决定（见 §4）。
- 生产 release = **`7bf8c5e5`**，rollback = **`561d738b`**；canonical HEAD = **`2a174fc6`**（**纯文档提交，未部署**）。

## 1. Git / 部署锚点（本轮实测读回）

| 项 | 值 | 证据 |
|---|---|---|
| 交付树 | `E:/Miscellaneous/XGS/.worktrees/onchip-video-release`，branch `release/onchip-production-line` | `git status --porcelain` 空、`HEAD == origin` |
| 交付 HEAD | 本交接首次提交 `6126dd06c867f50a1149a86932781ed6918379f1`（其后仅锚点小修正，用 `git log -- docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md` 看最终提交）；接手时上一个提交 `2a174fc6a1e9a44eb57f25de3125859e8b0655cd` | `git log --oneline -1`、`git status --porcelain` 空 |
| 生产 release | `7bf8c5e5d2df33df21e77716aa5e7173deaffa75` | `cat /opt/openscience/.release-id` |
| 生产 rollback | `561d738bb10a4926ac0e5c46356d90749557c5d1` | `cat /opt/openscience/.rollback-id` |
| 故障标记/事务 | `.release-failed` absent、`.deploy-transaction.json` absent | 同次 ssh 读回 |
| 容器 | web/agent-worker/api/scansci-mcp/document-parser/embedding-worker 均 Up 45h（healthy 除 web）；dev 栈 + `openscience-chatgpt-browser` Up 4 天 | `docker ps` |
| 根 main | `acd13a71` 干净；worktree 仅「根 + 交付树」 | `git worktree list` |

> 注意：HEAD 比生产多一个**纯文档**提交，属正常；`2a174fc6` 不需要部署，也不要把「HEAD 已推进」误读成「生产已更新」。

## 2. 本轮时间线（生产 DB 实测，2026-09-18，均为我的调试提交）

| 时间 (UTC) | 对象 | 结果 |
|---|---|---|
| 06:42 | task `27dff586` `presentation.figure-audit` | succeeded（`Fig. 1 → re-render` 真决策，session `4eaa4e8d`） |
| 06:57 | `5f6d391b` plan | succeeded → approved，hash `fd310137`，scene0 `Fig. 1: 屏—孔偶极源…`（**保留**） |
| 08:13 | `77b3f559` image | `paper_original_figure`、approved、hash `a1299ed3`、**69 字节占位 PNG**（**保留**，但是占位） |
| 08:14–08:17 | task `b9095526` / `5afaf7f6` / `bcc516bc` / `e2599002` | failed，错误 `结构化输出超过重试上限`（**修 `MAX_STRUCTURED_RETRIES` 之前的复现记录**，行仍在） |
| 09:58–10:13 | `6439150a`(draft) `ee9bcfb6`(draft) `6043bebb`(approved) `75b34c88`(approved) plan + `d5087b03` copy image + task `03a160aa` | 全部 succeeded；figurePlan `{"figures":[{"id":"Fig. 2","decision":"reuse"}]}`；`d5087b03` = `paper-original figure copy`、draft、hash `8952318f`（**占位链路演练**） |
| 12:14 | `8141b5fd` plan（task 12:14:37 succeeded） | approved，hash `9395f576`，Fig. 3 / editorial / re-render（**保留，真证据**） |
| 12:29 | task `9f7ff671` scene image | **failed** `image generation failed`（桥 `EXECUTION_FAILED`），仅剩这一行作为第 3 次尝试的收据 |

**本轮清理（用户授权：只清我自己造的废物）**：删除资产/任务 `929bd95d`（paper-original 源占位）、`6088f11b`（占位 plan）、`03a160aa`（占位 copy 图）+ 失败任务 `6088f11b`/`627e7b48`/`7c654505` + 其 `presentation_asset_claims` 与 spool 残留。**读回验证：`929bd95d%`/`6088f11b%`/`03a160aa%` 现存 0 行。**

## 3. 真实证据 vs 占位证据（务必区分）

- **真实**：`8141b5fd`（Fig. 3 plan，approved、真 LLM + chat-review 通过）、`5f6d391b`（Fig. 1 plan，approved）、`27dff586`（真 figure-audit 决策）、`ac455b2f`（**最后一次真实 chatgpt-web 出图**，2026-09-17 02:28，approved、590,049 字节）。
- **占位**：`77b3f559`（69 字节 PNG）、`d5087b03`（68 字节源图的拷贝）。**paper-original 链路从未流过一张真实论文图**——只验证了管道，不构成科学或审美交付。
- **已删除因而失效的引用**：`progress.md` 2026-09-18「paper-original reuse 链路全链路端到端打通」一节原先以 `929bd95d`/`6088f11b`/`03a160aa` 为证据，这三行现已不存在；能力台账第 128 行同样引用它们。两处已加注更正（见 §5 已完成项），**但没有替代的实测行**——重跑或改用真实论文图才能补回这条证据。

## 4. 未结事项（按优先级；每条含位置 / 后果 / 下一步）

1. **Fig. 3 没有真图**：plan `8141b5fd` approved 但三次桥尝试全 `EXECUTION_FAILED`。后果：原目标「生成描述文献的图片」在本篇上仍为 0 交付。下一步（择一，须用户定）：(a) 只读取证再判断（见 2）；(b) 用户同意后再发**一次**；或 (c) 换路径（显式 fallback provider / Codex CLI 备用 / 真实论文图上传）。
2. **桥失败根因未定，且有重复模式**：`progress.md` 2026-09-18 记过另一次 figurePlan-aware prompt 三连败（promptHash `1c221dc86e…`），本轮 Fig. 3 又是三连败；能力台账记的桥累计失败率约 39%（69 个 `result.json`：35 成功/27 失败/7 不确定，**本轮未重测**），容器日志此前出现 `WebGL1 blocklist` 与 dbus 报错。后果：把「偶发抖动」当结论会掩盖可能的确定性诱因。下一步：**只读取证**——拉 `openscience-chatgpt-browser` 在 12:2x 前后的日志与对应 spool 收件箱，确认失败发生在「提交 prompt 前」还是「导出图片阶段」，并看是否与 WebGL 报错时间相关；不要先花钱重试。
3. **真实论文图没进过 paper-original 路径**：栈内**没有** PDF 取图工具（`xgs-pdf-tools.sh` / `xgs-extract-fig*.sh` / `xgs-install-pymupdf*.sh` 的结论：worker/parser 内无 `pdftoppm`/`pymupdf`/`pdfimages`，apt/pip 装不上）。下一步：(a) 用已实现的 `POST /research-objects/:id/versions/:vid/paper-figures` 由用户上传真实 Fig. 3 图，走完一条**真数据**的 reuse 链（便宜、不烧桥额度）；或 (b) 另立需求做 PDF 取图。**不要**用手绘/截图冒充自动能力。
4. **DB 残留（本轮清理的尾巴，需用户拍板）**：`d5087b03` draft copy（源资产已删 → 悬空）+ Fig. 2 reuse 周期的 `6439150a`/`ee9bcfb6`（draft）与 `6043bebb`/`75b34c88`（**approved**）。后果：同一内容（hash `9b43357558e2`/`449ce484fa7d`）重复成对存在，产品面上可能显示无意义草稿。下一步：**整周期一起处置**（要删就删干净并同步文档；要留就写明它是占位演练证据）。`6043bebb`/`75b34c88` 是 approved 资产，删除会改变产品可见状态 → 必须用户明确同意。
5. **8:14–8:17 四条失败 task**（`结构化输出超过重试上限`）：它们是 `561d738b` 修 `MAX_STRUCTURED_RETRIES` 的复现证据；若要求「板上不留调试行」，可删，但请先确认不需要该证据。
6. **`transliterateMathToAscii` 从未被成功出图验证**（`f03bd97c` 引入，本轮桥全败）。后果：不能声称 Unicode 数学字符问题已解决。下一步：与 2 的取证结论一起判断。
7. **原目标的交付差额仍在**：多风格配图中只有淡彩 `aa41a018` 获用户认可；学术机制图、编辑封面仍在 [CURRENT 产品目标与交付差额](2026-09-10-hermes-web-image-handoff.md#illustration-delivery) 表中未完成。

## 5. 本轮已完成的文档同步

- 新文件即本交接（提交 `6126dd06`）；[CURRENT handoff](2026-09-10-hermes-web-image-handoff.md) 顶部与 Git 段已把生产 release/rollback 从 `fa66e89e`/`d3a0da3f` 更正为 `7bf8c5e5`/`561d738b`，并加了指向本文件的入口。
- `docs/progress.md` 2026-09-18 paper-original 条目加注「所引三个资产已作为占位调试产物清除，链路证据需用真实论文图重建」；能力台账第 128 行同步加注。
- 新增只读取证脚本（`tmp/verify-scripts/`，已被忽略）：`xgs-handoff-inventory.sql`、`xgs-handoff-provenance.sql`。

## 6. 禁止 / 注意

- **不要**重跑一次性恢复/清理脚本（`tmp/goal-*.ps1`、`xgs-cleanup-my-waste.cjs`、`xgs-spool-clean-*.sh` 等）；不要盲重发付费出图。
- **不要**删除他人资产、公开 v1、已认可淡彩图、真实论文与证据；删除前先确认归属并同步文档。
- 用户当前**禁止测试/预检/CI 与全套验收**；只允许针对已知故障的最小必要定向验证，并在做之前说明范围与风险。
- 本机不跑构建/Docker/迁移；服务器只读元数据、必要时最小定向操作。
- 不读取/打印 secret；ssh 只走 `infra/scripts/ssh-run.sh`（Windows 用 `C:/Program Files/Git/bin/bash.exe`）。
- 文档提交不需要部署；生产当前 release `7bf8c5e5` 与本轮代码无关。

## 7. 新会话启动 prompt（可直接复制）

```text
接手 OpenScience（XGS）「论文配图」交付。工作树：E:/Miscellaneous/XGS/.worktrees/onchip-video-release（branch release/onchip-production-line）。
启动顺序：读 AGENTS.md（根 + 交付树）→ project_index.md → docs/progress.md 顶部条目 → docs/handoff/2026-09-10-hermes-web-image-handoff.md（CURRENT）→ 本次交接 docs/handoff/2026-09-18-figure3-image-and-cleanup-handoff.md（含未结事项与禁止动作）。
先核对 git worktree list / HEAD / git status，确认交付树干净（生产 release=7bf8c5e5、rollback=561d738b；HEAD 只比生产多出文档提交，不需要部署）。

现状（已实测，不要重新调查）：Fig. 3 的分镜 plan 8141b5fd（figurePlan=Fig.3/editorial/re-render）已 approved；把它的 scene0 交给 chatgpt-web 桥出图已连续三次 EXECUTION_FAILED（最后一次 task 9f7ff671，2026-09-18 12:29），至今没有该 plan 的真实 PNG；最后一次真实桥出图成功是 2026-09-17 的 ac455b2f。paper-original reuse 链路只跑过占位图，真实论文图从未进过该链路。

本轮任务（按此顺序，先做只读取证再决定是否花钱）：
1. 只读取证 chatgpt-web 桥：拉 openscience-chatgpt-browser 在 2026-09-18 12:2x 前后的日志与对应 spool inbox/result，确认 EXECUTION_FAILED 发生在提交 prompt 前还是图片导出阶段，并核对是否与日志中的 WebGL1 blocklist / dbus 报错时间相关。不要先重试付费请求。
2. 基于取证结论给我 2–3 个可选处置（例如：再发一次、启用显式 fallback provider、改走真实论文图上传路径），标明各自的额度/风险成本，由我选择——不要自动切换 provider 或消耗额度。
3. 顺带处理未结事项 4（Fig. 2 reuse 周期的重复 plan + 悬空 d5087b03 draft 拷贝）：先只读列出它们的影响面（是否出现在产品面），给处置建议，等我同意再动。

约束：禁止测试/预检/CI/全套验收（用户已明确纠正）；只允许针对上述已知故障的最小必要定向验证，做前说明范围；不删除他人资产与已认可图片；不打印任何 secret；文档提交不需要部署；每轮收尾交付树与根 main 的 git status --porcelain 必须为空，有改动就提交并推送。
先只读汇报第 1 步结论和你的建议，再问我选哪条路。
```
