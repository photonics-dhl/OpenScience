# OpenScience (XGS) 项目

OpenScience 是科研基础设施平台：Research Object / SDF / 公开出版与协作。MVP 已完成；旧阶段清单不是当前任务。

## 开发入口与事实归属

- 开始工作先读适用说明、Git worktree/branch/HEAD/status 与 manifest；先用 `rg` 定向查 CURRENT，再由 project_index.md 进入唯一 CURRENT handoff。根目录 dirty main 与其他工作树不得当作当前交付基线。
- 用户最新纠正优先；需求基线为 docs/OpenScience_Kimi_Development_Spec.md，具体设计按索引选相关章节。设计要求、候选实现、线上版本、产物质量分别判断。
- CURRENT只能记录执行状态，不能改写用户目标。决定下一步前对照需求条款与仍未完成的交付项；局部返工或暂停不取消其他目标，移除交付项必须有明确用户范围变更。各项已有任务/资产和反馈只在CURRENT短表汇总，progress/index引用它。
- CURRENT handoff 保存任务、branch/HEAD/release/rollback、证据和未决项；以 Git 和必要的只读服务器元数据定锚。其他文档中的旧 release、测试结果和 next action 是历史，不能自动续跑。
- 现有Taskmaster使用当前交付树为projectRoot；启动读取currentTag的稳定验收清单，与CURRENT的对应任务ID对齐。工具保存验收条件，CURRENT保存执行证据；要求用户认可的交付不得因模型/部署成功置done。根main不维护第二份活动任务。
- docs/progress.md 是短状态摘要；project_index.md 是定位索引；ADR 记录长期决策。Memory 只保存 XGS- 决策/纠错，不复制操作日志或维护另一份任务库。
- 修改能力前定向读 docs/runbooks/hermes-capability-registry.md，核对入口、调用方、上游产物和真实效果，再决定复用、补接或替换。安装、本机读取、Hermes 注入、结果合格是不同事实。
- Backstage 定位职责/依赖；Serena 定位指定源版本的符号/引用；dependency-cruiser 定位跨包影响；Langfuse 查既有模型调用；Portainer/Netdata 查资源。按问题选工具，不每轮全跑；生产快照不能证明候选代码。
- 发现重复规则、未消费能力或状态冲突，先修当前改动依赖的断点；不再叠模板、模型步骤、任务库或门禁。未解决债务写回现有能力台账，附位置、后果、下一步。

## 产品落地与执行约束

- 用户澄清：禁止的是与改动无关的过度测试、反复预检和全套演练，不是必要测试。代码、Skill 加载/路由及共享合同变更要运行能验证该行为的定向测试；发布关键路径或仓库规定的 CI 要运行并处理失败。真实模型/图片效果须用有来源的真实任务与产物评价，不能以单元测试、构建或服务 healthy 替代。复用未变实现的有效证据，不无故重跑全仓套件。
- 本机可做与当前改动直接相关的测试、构建和静态检查；临时产物写项目 ignored `tmp/`。生产验证仅限有授权、可恢复且必要的真实路径；迁移、Docker、服务重启和模型请求仍按各自风险与既有边界执行，不因测试许可扩大范围。
- 测试前说明验证对象、为何现有证据不足和最小范围；失败先定位再修复。CI 按触发的实际工作流和变更影响执行，不用 `[skip ci]` 规避应跑的检查；不自动扩大为无关的 checkup、探针或整站回归。
- 有部署目标的功能完成已授权服务器构建/启动与真实产品观察；文档治理不自动部署科研应用。不得用工具建设、检查数量或安装成功代替产品交付和科学质量。
- 用户可操作功能交付须从站内可见入口实际点击到目标页；角色、登录跳转和数据加载均纳入这条最小真实路径。只有接口、直达 URL 或角色字段成功，不得声称前端已可使用。
- 关键写操作在按钮附近显示处理中、成功或失败反馈并防止重复提交；校验阻断须明确指出字段及下一步。实际观察已获授权的最小路径，不为验证擅自审批或修改真实业务资料。
- 先完成 2–3 篇真实论文的上传、Hermes 全文凝练、用户确认、配图审核与公开展示；用户确认质量前暂停批量冷启动。保护真实论文、已认可图片和公开标识；旧演示优先可恢复归档。
- Hermes 先理解全文再按六维凝练；方法可能在推导、图注或附录，不按固定章节判断缺失。解析/预算失败是系统问题，不冒称论文未报告；未审草稿与正式内容分开。
- 配图先确定未读论文者需要理解的核心关系与阅读路径，再按叙事需要选择原图、重绘或生图及艺术风格。学术、编辑、淡彩只是已验证样本，不是固定类别、验收配额或默认审美；风格库和构图参考不能改变已审科学含义。
- 复用服务器 PDF/OCR、BGE、MiniMax、科学 Skill 和媒体能力；科学认识来自上游解析/审核，下游艺术表达不能重新发明科学关系。不得以 Codex 手工内容冒充 Hermes 自动能力。
- Chat 生图优先，Codex CLI 备用，不自动切换消耗额度。直接 Chat 会话与本机浏览器桥分别判断；桥故障不等于 Chat 不可用，服务器网页生图由服务器执行器负责。
- UI 按 .agents/skills/frontend-design/SKILL.md 与现有设计：贡献、核心媒体、正文优先，证据/内部资料折叠；Hermes 是主要操作入口。复用已有授权，不重复询问。
- 连续失败先定位根因，保留产物/任务；不盲重生成、不放行已知错误。日常保存是私有草稿，公开内容修改通过新公开版本或明确勘误。

## 仓库与边界

- pnpm workspace：apps/ 服务、packages/ 共享包、infra/ 部署；实际包和脚本查根 package.json / pnpm-workspace.yaml，不维护易过期的服务、端点清单；迁移数量仅以下述带日期账本事实记录。
- 使用 npx pnpm@9.15.0，不全局安装 pnpm、不另建锁文件。dist/、.next/、*.tsbuildinfo 不入库；服务器必要构建按依赖范围避免旧 dist。
- Provider 调用收口 packages/ai-gateway；主模型 MiniMax-M3，回退由 Gateway 配置管理。业务代码不持有 Provider Key，不绕过权限、配额或任务状态。
- 迁移使用 infra/migrations/ 与既有 CLI node packages/database/dist/migrate-cli.js deploy|status；不手工重跑旧 packages/database/migrations/，生产禁用 reset-dev。截至 2026-09-22，core 生产迁移账本与 `infra/migrations/` 均为迁移 1–49；新增迁移须按实际账本同轮更新此日期和区间。core/search 凭据和迁移账本独立。
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
- 不删除他人未提交的改动与工作树，除非有明确适用授权；但「未提交」不等于「永久保留」：交付树以外的残留按下方「工作区与发布卫生」的时限处置，处置前必须先推送或打包备份。

## 工作区与发布卫生

- 唯一交付入口是 `.worktrees/onchip-video-release`，根 `main` 只作导航、不承载开发。交付树与根 main 在每轮收尾时 `git status --porcelain` 必须为空；出现未提交改动即当轮处置（提交、移入已忽略目录或按授权删除），不得留给下一个会话。
- 部署源守卫要求「工作树完全干净且 HEAD == release ref」，所以每次部署都必须来自干净 worktree；不要为省事在脏树上直接发布。
- worktree 生命周期：一个任务一个 worktree；任务结束后按结论处置——已发布且无需回滚引用 → 删除该 worktree 与本地分支；仍需回滚引用 → 保留到下一次成功发布后删除；未合并但有独立价值 → 先推送远端分支再删除本地 worktree。禁止长期堆积 detached-HEAD 的 `*-release-*` 目录。
- 每轮收尾执行 `git worktree prune` 并核对 `git worktree list`；新增 worktree 必须说明用途与预期寿命，到期未清理视为债务。
- release 身份必须是指向已推送提交的完整 SHA，服务器 `.release-id` 必须能在本仓 `git rev-parse` 解析。遇到无法解析的 release 身份，先按 docs/runbooks/deployment.md 的故障态恢复流程核对实际容器与 release 目录，不得直接改标记或盲目重跑部署。
- 本机命令显式指定工作目录；临时脚本、图片、日志等放在本项目已忽略的 `tmp/` 或所属项目私有应用数据目录，禁止堆到用户目录顶层（会撑爆 Windows 沙箱启动参数）。收尾清理已确认不用的生成物；仍需证据/回滚的归档并同步生产者路径及“证据已存在”保护，保留权限与恢复记录。不能仅凭日期清理他人资产；只有正式交付资产入库。

## 文档同步

- 创建前查 project_index.md，同主题原地迭代。方案 docs/proposals/，设计 docs/specs/，计划 docs/plans/，决策 docs/decisions/ADR-NNN-*.md，交接 docs/handoff/，安全 docs/security/。
- docs/OpenScience_Kimi_Development_Spec.md 是路径例外，原地保留；外部 docx/zip 等原件只读，移动或改名需授权。
- 按 .agents/skills/docs-sync/SKILL.md 同步实际改动；历史状态明确降级，需求有效性与完成情况分开，不按日期抹掉未完成需求。
- 有项目状态变化的回合在最终回复前主动执行 docs-sync；长任务在决策、修改或阻塞节点先保存。无变化问答不重写；意外中断后从实际 Git/运行事实恢复，Skill 不冒充后台自动回调。
- 提交/交接前核对差异和 Git 状态，分别报告候选、部署、已观察、未确认；只在规则允许时执行检查，不恢复默认预检。AGENTS/Skill 修改要进入交付分支，不能只留在旧 main。
- 其他工作树只保留交付入口导航，不复制 release/next action；未提交独立工作保留并说明归属，不混入当前提交。
- AGENTS ≤100 行、CURRENT handoff ≤80 行、progress ≤120 行。长证据留原记录/Git，启动只读相关短段；不新增重复治理平台。
