# CURRENT Progress Window

## 2026-09-17 — figure-audit → 出图链路端到端打通（`01381bdf`）
- **实测通过**：真实 MiniMax-M3 一次调用成功（`in=4934 out=354`、无重试），`presentationDraft.figurePlan` 返回**对象** `{"figures":[{"id":"Fig. 1","decision":"re-render","styleId":"editorial"}]}`，条目逐字复制自审计结果。验证用**自然用户口吻**的 goal（刻意不描述 JSON 形状），只由修好的 system prompt 引导。
- **根因（此前查了多轮没找到）**：prompt 原文写 "copy `figureAuditPlan.figures` into `presentationDraft.figurePlan`"，而 `figureAuditPlan.figures` 本身是数组 → 模型把**裸数组**赋给 `figurePlan`。但 guard 与下游 `packages/domain/src/assets/storyboard.ts`（`keys(fp,['figures'])` + `Array.isArray(fp.figures)`）都要求对象，故被拒。**放宽 guard 只会把失败推后**，正确修法是修 prompt。已改四处（中/英 system prompt、figureAuditPlan 段、重试校验反馈）。
- **附带修掉一个诊断盲区**：`validationDiagnostic` 原先**完全没有 figurePlan 形状检查**，导致失败只显示空泛的 `guide:guard_rejected`（我据此绕了很多弯路）。现已补上，会精确报 `presentation_figureplan_is_array_expected_object_with_figures`，且该文本会作为重试反馈给模型。
- 前序两处修复仍有效：`07574e4e`（`task.result` 套层）、`e0e0aafa`（instruction ≤1000 字符）。生产 active=`01381bdf`、rollback=`c1b895ca`，11 容器 healthy、`/__release` 200、无残留事务标记，验证用合成会话/任务已清理。
- **停止继续投入前的重要发现：`figurePlan` 是只写字段，没有任何消费者。** 全树检索（34 处匹配）显示它只走「审计产出 → LLM 写入 → guard → HTTP schema → domain 解析 → 持久化」；`apps/agent-worker/src/presentation/illustration-planner.ts` 与 `storyboard.ts` **零引用**，`storyboard.ts:8` 把 `settings` 整体传入后，planner 只用 `upstream`/`instruction`/`locale`/`style` 构建消息，**image 路径下模型连这个字段都看不到**。`skills/figure-auditor.ts:110` 的 `toStoryboardFigurePlan` 全仓仅定义、零调用（死代码）。**后果**：判 `skip` 的图仍会出图、逐图 `styleId` 不生效，只有整请求级 `settings.style` 生效——**故"跑一次真实出图"无法验证 figure 路由**，据此未消耗出图额度。已按 AGENTS「未消费能力写回台账」记入 [能力台账](runbooks/hermes-capability-registry.md)（含位置/后果/下一步），下一步需先定科学语义再接线。

## 2026-09-17 — 服务器磁盘治理（用户授权：80% 占用判为不健康）
- **测量口径**：必须用 `du -shx`。netdata 容器把宿主 `/` bind 到 `/host/root`，未加 `-x` 的 `du` 会递归进整个宿主文件系统，把 `/var/lib/docker` 从真实 38G 虚报为 67G、overlay2 从 31G 虚报为 60G（我据此曾误判"35G 孤儿层"，实为测量假象）。`docker system df` 的 Images/BuildCache 字段同样不可信（`builder prune -af` 实际回收 9.4G 而该字段只报 1.35G）。
- 主因与修复：历史 release 累积的直接原因是**开发工具把不可变 release 目录当配置源挂载**，release 转为 inactive 后被钉住，永不回收。已把 catalog 挂载源解耦到稳定路径 `/opt/openscience-development/catalog/source/`，重建后 `query.mjs` 读回正常、restart=0。
- 清理执行：FD9 锁内复用官方 API 做受控事务（`journal-start(prepared)` → `journal-update(published)` → `retention prepare --prune-unused 1` → `journal-clear` → `retention complete`；顺序不可换）。计划并删除 81 release/56 capability；另清 19 个陈旧镜像 tag、`/opt/openscience/{node_modules,apps}` 过期构建树（3.05G）、1.09G 未完成模型下载（`.part`）、154 个 private-cleanup 陈旧副本、923M Playwright 宿主缓存。**回滚镜像不可删**（事务第 595 行回滚路径 `docker image inspect $PREVIOUS_RELEASE_SHA`，缺则 `rollback_ok=0`）；qwen3-tts 模型 4.3G 有引用，保留。
- 开发栈根因：ClickHouse 卷 6.0G 中 `system.trace_log` 独占 4.74G/3.04 亿行，而 Langfuse 自身数据仅 208KiB；已 TRUNCATE 并设表级 TTL（trace/text 3 天，metric/part/query/error/asynchronous 7 天），卷降至 76M。注意 `query_profiler_*` 属 user-level 设置，写入 config.d 会使容器启动失败（`Code: 137 UNKNOWN_ELEMENT_IN_CONFIG`），须置于 users.xml 的 profiles；该实验配置已按备份逐字节还原。
- **运维软件为何没拦住（三套工具三条独立断链）**：①Netdata 运行 6 周且内置 `disk_space_usage` 告警存在（warn >80%、crit >90% 且 avail<5G），但 `health_alarm_notify.conf` **不存在**——镜像默认 `SEND_EMAIL="AUTO"` 需容器内有 MTA（官方镜像没有），其余渠道默认 `YES` 却无 token，全为 no-op；`/var/lib/netdata/health/` 为空，**告警被求值后送往空处**。②Portainer 是手动面板，无自动化、无人查看。③`openscience-private-cleanup.timer` 每 60 秒运行，但单元描述即"Erase authorized private host job copies"，只处理经授权的一次性作业副本（共 4 条），对 release/镜像/日志/卷无管辖范围。另 journald 无 size 上限（自增至 1.4G）。已补 `SystemMaxUse=500M`（1.4G→481M）；**告警渠道需凭据，待用户选定**。
- **告警已补接并实发验证**：传输走 `msmtprc`（由服务器端脚本从 `.env.prod` 的 SMTP 键生成，0600，不入 git），经 monitor compose 挂入 netdata 容器；路由写 `health_alarm_notify.conf` 的 `SEND_EMAIL=YES` 与 `role_recipients_email[sysadmin]`。`alarm-notify.sh test` 已实发 WARNING/CRITICAL/CLEAR 三封并 exit 0（收件人只在服务器端配置，不写入公开仓库）。另把 netdata 保留期从镜像默认 3 层×1024MiB 收到 1 层/512MiB/7d（dbengine 逐步回收，不立即缩容）。
- **定期缓存维护已部署**：`infra/scripts/disk-cache-maintenance.sh` ＋ `infra/systemd/openscience-disk-cache-maintenance.{service,timer}`，每日回收 docker build cache / dangling 镜像 / 超限 journal，并只读报告历史 release 数量与体积。**刻意不自动回收历史 release**——`project_index.md` 记载 retention 模块"不作独立清理入口"，历史清理保持"用户授权 + 留收据"（流程见 deployment runbook）。
- **已知限制（实测，勿重复投入）**：`netdata/netdata:stable` **不读取用户 `/etc/netdata/health.d`**。四次尝试（写入+重启、最小化告警去标签与 calc、`-W reload-health`（该选项不存在，重载 health 是 USR2）、显式 `[health]`/`[directories]`）均 0 条注册；而 stock 侧 131 个配置正常、日志只出现 `file=/usr/lib/netdata/conf.d/health.d/...`、error.log 为空。故只能用 stock 阈值（warn >80%；crit >90% 且可用<5G，在 148G 盘上不可达）。实验文件已删、`netdata.conf` 已恢复。
- 结果：磁盘 112G/80% → **54G/38%**（可用 30G → 88G）；11 个生产容器 healthy、公网 `/__release` 200。同批再清 Serena `code-intelligence/build` 1.1G（可再生，容器未受影响）与 `/opt/openscience-evals` 454M（目录保留）。**保留**：`/var/backups` 333M（7 套已校验数据库备份）、`chatgpt-browser/jobs` 166M（受授权流程管辖）、qwen3-tts 模型 4.3G（有引用）、回滚镜像 6.24G（事务第 595 行回滚路径依赖）。详见 [deployment](runbooks/deployment.md) 与 [monitoring](runbooks/monitoring.md) runbook。

## 2026-09-16 — 交付线对齐、v6 配图与图片链路隐患收口
- 唯一交付入口定为 `.worktrees/onchip-video-release` 的 `release/onchip-production-line`（＝生产线 `311c980f` ＋我方修复；旧 `codex/onchip-video-release` 缺 journals/学术身份，降级历史线不得发版）。根 `main` 重定位到 `origin/main` 并只作导航；worktree 40→2；AGENTS 增「工作区与发布卫生」（每轮 `git status --porcelain` 必须为空、release 身份须为已推送可解析 SHA、证据放仓库外或已忽略目录）。
- 部署链修复：服务器无源码 git 仓库，生产 release 目录重建为 `311c980f`；真正阻塞是我方分支带旧版 `deploy.sh`（生产线版本接受裸 40 位 `--rollback-ref`）。剔除违反发布守卫的 `packages/search/generated` 21 个误提交文件后 `4099078b` 部署成功，journals/学术身份保留；后续按正常流程迭代至 `d3a0da3f`→`fa66e89e`。
- 配图链路三项修复并部署：结构化输出触顶（`escalateMaxTokens` 8192→16384，只在截断时升级一次、不占 schema 重试预算）、字段长度压线（illustration 三阶段 `maxRetries` 2 ＋请求内明确 ≤100 字符）、设计 skill 构图规则到不了 render（v6：`SKILL.md` 新增 `## Visual craft` 并注入 plan/render/review，`art-directions.md` 增「Ground, frame and hierarchy laws」：单一底色、分隔线须承载真实科学边界）。真实链路 `b182c1c5`（上游修订）→ 图 `a7488c14`（单一底色、无装饰分隔线、`m₀`/`p₀` 入可见标签）经用户认可「还可以」。
- 隐患收口（详见能力台账「当前技术债与处理」）：#2 设计段按语义边界截断；#3 `generateImage` 有界回退只在"确定未提交"前进、带参考图绝不回退、付款方独占"未提交"见证（两轮独立 High，第二轮不 GO 后修回）；F2 API 侧恢复判定池化但**付款方严格等于主 provider 的 spool**，备 spool 只能回答 `completed`，主 provider 无 spool 时完全不注入（第三轮定向 High **GO（代码层）**，H1 类型契约与 M1 付款方按位置认定均已关闭）；Hermes 对话内审批 409 补"重读资产列表"。
- 验证范围：未跑测试、预检或 CI；仅针对审查指出的编译期风险做过一次 API 依赖闭包的最小定向构建（`pnpm --filter @openscience/api build` exit 0），部署由服务器全量 build 与容器内 dist/source 读回证实。旧图、公开 v1、认可淡彩与真实论文均保留；审美差额与下一步只在[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。

## 2026-09-15 — 修复能力接线并追查真实空结果
- `ba184541` 已部署（rollback `6684e448`），仅跳过全套验收；按原资格恢复两篇 confirmed 来源任务，真实完成 deep 58/58 dense、Quantization 42/42 dense，当前 generation 均 active。Weyl UI POST 200、hybrid，实际召回两篇论文，页面无横向溢出。任务4索引闭环已实证；不等同科学或审美质量完成。

## 2026-09-15 — 历史取证：模型路由、联动边界与授权清理
- 代码确认：MiniMax主模型及默认来源审校已消费科学Skill；显式web复核/配图末审另走固定6Pro，并非Skill切换模型。配图审核无MiniMax回退，本轮未改路由。自动任务/来源/方案/结果和Langfuse审计已接，Taskmaster/Backstage/Serena/docs-sync仍需开发者执行；原地纠正能力台账，不另造平台。
- 用户授权后清理36个无现行引用、停止且只读的实验容器，保留私有日志与元数据；27个运行/回滚容器、65处挂载及发布标记读回不变，剩33容器。镜像、卷、release、论文和产物保留。精确范围/收据及未完成主任务只见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。

## 2026-09-15 — 共享内存峰值根因与技能实证
- 实际页面加载时/dev/shm瞬时用满512MiB，同步173次错误；事后df余量曾漏掉峰值。用户“你来判断”后私有备份并完成1GiB容器切换；相同六页首次加载峰值882MiB、资源错误0。六URL/登录/草稿正文恢复，Chat段落显示格式不同，原样备份保留；旧容器停止保留。证据、原图任务过期及剩余边界仅见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md)。
- 真实资产与遥测确认Hermes消费科学/设计Skill，6Pro是配图末审后端，默认论文审校仍为MiniMax。盘点发现历史发布与实验容器积累，盘点时磁盘有61G可用；后续清理见上条。既有多风格和论文端到端交付差额保持。
- 后来输入草稿可能被终态自动清理误关的代码缺陷已收窄：仅回收有任务归属的about:blank，正常runner收尾不变。独立High GO后复用原patch机制安装单文件，保留前后副本、读回字节/权限，无新浏览器重启或模型调用。

## 2026-09-15 — 多风格任务与已有工具重新对齐
- 根因：局部水彩修图被写成总任务；Backstage指向缺少现行要求的旧main；Taskmaster仍是八月已完成tag；Hermes原艺术修订入口未贯穿对话。按代码、Git历史及实际工具结果纠正，未用安装成功代替完成。
- 复用原Taskmaster三项稳定验收；CURRENT保存每项资产、用户反馈、版本和下一动作。仅用户认可可关闭审美交付，已有认可的淡彩原图保留。
- 新学术与编辑候选已实际生成并看图，前者可供评阅，后者尚未达到编辑封面目标。具体差额只见[CURRENT](handoff/2026-09-10-hermes-web-image-handoff.md#illustration-delivery)。
- 应用必要服务器构建/启动完成；原艺术模式已接入Hermes，自有Skill v5与既有末审加入明确艺术要求符合性，无新模型阶段。Backstage/遥测更新、Serena源码同步完成；已用目录和原任务ID读回真实资料及两条调用。
- 真实页面先暴露结构回复拒绝，随后暴露guide重复艺术规划、擅加科学对象；错误安排没有确认。修复后页面返回和确认请求均保留原指令，绑定原稿，769艺术方案科学字段全等；同一6Pro末审修正暗背景线条对比。最终图片和剩余审美差额见CURRENT。
- 最后封面图7cd尚未返回PNG；延迟恢复重复写一次性标记的最小修复已独立High GO并部署，Serena同步，原标记未重置。随后共享内存和误回收修复见本页最新条目；先前“静态硬资源未碰限/等待用户保存”已过时。原任务已过下载恢复期限，新Library精确结果绑定仍未收口，不能称生图链路全面稳定。

## 边界与后续
- Git HEAD、应用release、独立Chat provider、工具bundle与rollback仅在CURRENT定锚。用户认可淡彩图、两篇公开v1及论文/证据/笔记保持；无关dirty设计spec不提交。
- 未跑测试、CI或本机构建；审阅代理误跑一次只读git diff --check，已停止。服务器构建/启动与真实产品操作分别证明各自范围，不证明审美获认可。
- 新正常论文上游claimSuggestions确认、BGE hybrid query正常应用效果等既有未观察项保留在CURRENT/能力台账；不在这里复制新待办。
- Langfuse登录已完成；未知tokens/cost保持未知。SMTP/SSO/定时备份/保留期仍未配置；不为采集造模型调用。
- docs-sync按关键节点同步，不是后台结束回调。工具与规则用于暴露、追踪和纠正漂移，不能宣称绝对零技术债。
