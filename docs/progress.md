# CURRENT Progress Window

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
