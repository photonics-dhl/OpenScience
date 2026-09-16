# OpenScience (XGS) 项目

OpenScience 是科研基础设施平台：Research Object / SDF / 公开出版与协作。MVP 已完成；旧阶段清单不是当前任务。

## 开发入口与事实归属

- 开始工作先读适用说明、Git worktree/branch/HEAD/status 与 manifest；定向检索 project_index.md，进入唯一 CURRENT handoff。根目录 dirty main 与其他工作树不得当作当前交付基线。
- 用户最新纠正优先；需求基线为 docs/OpenScience_Kimi_Development_Spec.md，具体设计按索引选相关章节。设计要求、候选实现、线上版本、产物质量分别判断。
- CURRENT只能记录执行状态，不能改写用户目标。决定下一步前对照需求条款与仍未完成的交付项；局部返工或暂停不取消其他目标，移除交付项必须有明确用户范围变更。各项已有任务/资产和反馈只在CURRENT短表汇总，progress/index引用它。
- CURRENT handoff 保存任务、branch/HEAD/release/rollback、证据和未决项；以 Git 和必要的只读服务器元数据定锚。其他文档中的旧 release、测试结果和 next action 是历史，不能自动续跑。
- 现有Taskmaster使用当前交付树为projectRoot；启动读取currentTag的稳定验收清单，与CURRENT的对应任务ID对齐。工具保存验收条件，CURRENT保存执行证据；要求用户认可的交付不得因模型/部署成功置done。根main不维护第二份活动任务。
- docs/progress.md 是短状态摘要；project_index.md 是定位索引；ADR 记录长期决策。Memory 只保存 XGS- 决策/纠错，不复制操作日志或维护另一份任务库。
- 修改能力前定向读 docs/runbooks/hermes-capability-registry.md，核对入口、调用方、上游产物和真实效果，再决定复用、补接或替换。安装、本机读取、Hermes 注入、结果合格是不同事实。
- Backstage 定位职责/依赖；Serena 定位指定源版本的符号/引用；dependency-cruiser 定位跨包影响；Langfuse 查既有模型调用；Portainer/Netdata 查资源。按问题选工具，不每轮全跑；生产快照不能证明候选代码。
- 发现重复规则、未消费能力或状态冲突，先修当前改动依赖的断点；不再叠模板、模型步骤、任务库或门禁。未解决债务写回现有能力台账，附位置、后果、下一步。

## 产品落地与执行约束

- 用户当前明确禁止过度测试、全套预检及 CI 测试；仅在存在直接风险或已知故障时，执行与改动直接相关的最小必要验证，并说明范围。必要服务器安装、编译、构建、启动属于交付，不扩展为测试项目。
- 本机默认仅静态阅读、编辑、Git 与传输；如存在直接风险或已知故障，可执行与改动直接相关的最小定向验证，不运行全套测试、构建、Docker、迁移或运行检查。复用未变实现的有效证据，未知保持未知。
- 非常必要的运行检查仅针对具体重大风险或已知阻塞故障，在服务器执行；先简短说明风险和最小范围。没有这一理由不自动执行 checkup、探针或全套验收。
- 有部署目标的功能完成已授权服务器构建/启动与真实产品观察；文档治理不自动部署科研应用。不得用工具建设、检查数量或安装成功代替产品交付和科学质量。
- 用户可操作功能交付须从站内可见入口实际点击到目标页；角色、登录跳转和数据加载均纳入这条最小真实路径。只有接口、直达 URL 或角色字段成功，不得声称前端已可使用。
- 关键写操作在按钮附近显示处理中、成功或失败反馈并防止重复提交；校验阻断须明确指出字段及下一步。实际观察已获授权的最小路径，不为验证擅自审批或修改真实业务资料。
- 先完成 2–3 篇真实论文的上传、Hermes 全文凝练、用户确认、配图审核与公开展示；用户确认质量前暂停批量冷启动。保护真实论文、已认可图片和公开标识；旧演示优先可恢复归档。
- Hermes 先理解全文再按六维凝练；方法可能在推导、图注或附录，不按固定章节判断缺失。解析/预算失败是系统问题，不冒称论文未报告；未审草稿与正式内容分开。
- 复用服务器 PDF/OCR、BGE、MiniMax、科学 Skill 和媒体能力；科学认识来自上游解析/审核，下游艺术表达不能重新发明科学关系。不得以 Codex 手工内容冒充 Hermes 自动能力。
- Chat 生图优先，Codex CLI 备用，不自动切换消耗额度。直接 Chat 会话与本机浏览器桥分别判断；桥故障不等于 Chat 不可用，服务器网页生图由服务器执行器负责。
- UI 按 .agents/skills/frontend-design/SKILL.md 与现有设计：贡献、核心媒体、正文优先，证据/内部资料折叠；Hermes 是主要操作入口。复用已有授权，不重复询问。
- 连续失败先定位根因，保留产物/任务；不盲重生成、不放行已知错误。日常保存是私有草稿，公开内容修改通过新公开版本或明确勘误。

## 仓库与边界

- pnpm workspace：apps/ 服务、packages/ 共享包、infra/ 部署；实际包和脚本查根 package.json / pnpm-workspace.yaml，不维护易过期的服务、端点、迁移数量。
- 使用 npx pnpm@9.15.0，不全局安装 pnpm、不另建锁文件。dist/、.next/、*.tsbuildinfo 不入库；服务器必要构建按依赖范围避免旧 dist。
- Provider 调用收口 packages/ai-gateway；主模型 MiniMax-M3，回退由 Gateway 配置管理。业务代码不持有 Provider Key，不绕过权限、配额或任务状态。
- 迁移使用 infra/migrations/ 与既有 CLI node packages/database/dist/migrate-cli.js deploy|status；不手工重跑旧 packages/database/migrations/，生产禁用 reset-dev。core/search 凭据和迁移账本独立。
- Parser 保持无网络/Secret、非 root、只读、512 MiB，经任务卷交换文件；science-worker 沙箱与数据库隔离，不为省量放宽权限。
- 架构、安全、并发、迁移、不可逆操作和重大未决歧义使用独立 high 审查；供给精确范围/证据，仅复核新增差异，不重做已完成审查。

## 服务器与工具

- 服务器工作先定向查 docs/runbooks/server-capabilities.md，复用已有服务、镜像和缓存；安装/下载只补真实缺口并说明原因。
- SSH 仅走 infra/scripts/ssh-run.sh；Windows 显式用 C:/Program Files/Git/bin/bash.exe，禁止裸 bash/WSL。项目密钥 ~/.ssh/id_ed25519_xgs；shell 错误不得误报认证失败。
- 部署查 docs/runbooks/deployment.md，备份查 backup-restore.md，监控查 monitoring.md。先核当前执行约束，旧命令清单不自动授权测试或重部署。
- 生产入口 /opt/openscience；DB/Redis/对象存储仅内部网络。invite/migrate/seed 在容器内继承受控环境，不展开连接串到 CLI/日志。
- 公网入站复用 Cloudflare Tunnel，出网复用现有代理，具体拓扑见 runbook。勿安装 Tailscale，其路由曾破坏阿里云 VPC DNS。
- 工具默认项目级安装/配置；第三方 Skill、MCP、插件、二进制只在明确授权范围安装。独立开发服务遵循 ADR-002，不自动给科研用户 Hermes 运维权限。
- 不读取/打印 .env、Secret、密码，不放进上下文、日志、Git 或模型请求。Langfuse 账号独立于 OpenScience，凭据走私密交接。
- 不删除文件、历史产物、分支或工作树，除非有明确适用授权。保护他人 dirty/untracked 改动，不自动 reset/clean/stash。

## 文档同步

- 创建前查 project_index.md，同主题原地迭代。方案 docs/proposals/，设计 docs/specs/，计划 docs/plans/，决策 docs/decisions/ADR-NNN-*.md，交接 docs/handoff/，安全 docs/security/。
- docs/OpenScience_Kimi_Development_Spec.md 是路径例外，原地保留；外部 docx/zip 等原件只读，移动或改名需授权。
- 按 .agents/skills/docs-sync/SKILL.md 同步实际改动；历史状态明确降级，需求有效性与完成情况分开，不按日期抹掉未完成需求。
- 有项目状态变化的回合在最终回复前主动执行 docs-sync；长任务在决策、修改或阻塞节点先保存。无变化问答不重写；意外中断后从实际 Git/运行事实恢复，Skill 不冒充后台自动回调。
- 提交/交接前核对差异和 Git 状态，分别报告候选、部署、已观察、未确认；只在规则允许时执行检查，不恢复默认预检。AGENTS/Skill 修改要进入交付分支，不能只留在旧 main。
- 其他工作树只保留交付入口导航，不复制 release/next action；未提交独立工作保留并说明归属，不混入当前提交。
- AGENTS ≤100 行、CURRENT handoff ≤80 行、progress ≤120 行。长证据留原记录/Git，启动只读相关短段；不新增重复治理平台。
