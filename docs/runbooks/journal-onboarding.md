# 期刊入驻与 AI 解读运行手册

## 范围与入口

实现依据：[期刊入驻 PRD](../specs/2026-09-15-journal-onboarding-design.md)。首期代码与生产兼容整合已部署，期刊迁移及入口实际观察已完成；上线版本、观察边界及真实试点后续统一见 [CURRENT handoff](../handoff/2026-09-15-journal-onboarding-handoff.md)。

| 用户 | 页面 | 用途 |
|---|---|---|
| 读者 | `/journals`、`/journals/{slug}` | 已公开期刊与论文目录 |
| 编辑部 | `/journals/apply` | 保存申请、提交身份及代表资格证明 |
| 申请人 | `/journals/apply/{applicationId}` | 私有提交回执、真实编号、当前审核状态及说明 |
| 编辑部 | `/journals/manage` | 已加入期刊和申请状态 |
| 刊内成员 | `/journals/manage/{journalId}` | 论文、成员、额度、服务申请 |
| 编辑部 | `/journals/manage/{journalId}/processing` | 全刊加工优先级、重点标记、延后与显式入队 |
| 编辑部 | `/journals/manage/{journalId}/services` | 实际可用额度、预占、到期和人工服务申请 |
| 编辑与获指派审核员 | `/journals/manage/{journalId}/articles/{articleId}` | 来源、授权、解读草稿、人工审核 |
| 编辑与获指派审核员 | `/journals/manage/{journalId}/articles/{articleId}/sources` | 逐项来源与版权矩阵、可生成/公开范围及变更记录 |
| 平台管理员 | `/admin/journals` | 期刊核验、运行状态、服务处理和额度开通 |
| 读者与工具 | `/research/{publicId}/v/{versionNo}` | 固定版本解读，优先引用原文 DOI |

期刊负责人、管理员、编辑、审核员分别复用工作空间角色 owner、maintainer、author、reviewer。平台管理员核验权限独立于刊内成员权限。审核员仅能访问指派给自己的论文。

新申请除中文刊名选填外，文字元数据使用英语；英文刊名必填、管理与公开显示优先用英文。旧草稿补齐后可重新提交，已提交申请保留原记录并由平台管理员处理。申请人账号不会因提交申请自动获得平台管理员权限。服务选项已取消“专业审核”；论文公开前的编辑确认仍然必需。

管理员在首页/研究桌面顶部或期刊目录点击“期刊审核”，进入 `/admin/journals`。入口仅对当前账号角色为 `platform_admin` 时显示。依照用户于 2026-09-16 明确批准的 ADR-003 例外，此页面及 `/api/admin/journals` 精确路径和子路径使用网站会话；Nginx `auth_request` 实时检查会话/数据库角色，API 再执行原权限、CSRF 与审计检查。匿名页面跳转网站登录后返回审核页，匿名 API 拒绝访问，非管理员拒绝访问；其他管理后台仍保留独立 Basic Auth。发布验证须从站内入口实际进入并显示申请列表，不能仅凭直达 URL 或角色字段判定完成。

审核前，旧申请缺少英语资料时逐项提示；“通过入驻”的英文前置校验仅辅助说明，服务器仍执行完整验证。退回原因可一键填入，须管理员另点“退回修改”才提交。每条申请独立显示提交中、成功或失败反馈并防止重复点击；请求结果不明时先“刷新申请状态”，不要自动重复审核。审核成功后的列表刷新失败应保留已确认结果。

申请人从“我的申请”或回执点击“继续修改”，直接编辑原资料；“保存修改”保持待修改，“重新提交”进入待平台审核，沿用原编号。拒绝入驻须填写原因并确认不可直接修改的后果。误拒时管理员填写更正原因并点击“更正为退回修改”，原审核意见与历史保留；新接口 `POST /api/admin/journals/applications/{id}/reopen` 要求 `expectedRevision` 和非空 `reason`，仅管理员、仅当前 rejected 且未入驻的申请可执行。权限复核、状态更新和 `journal.application.reopened` 审计在同一 Serializable 事务中，无迁移。

## 首次启用

1. 按现有发布流程备份核心数据库，检查部署源版本；先生成核心与 Search 数据库客户端，再并行构建 API、Web、Agent Worker 及依赖。
2. 使用既有迁移 CLI 应用核心迁移 `20260915000000_journals`。生产基线已经包含其他后续迁移，不能按旧分支“迁移 37”判断线上状态；当前集成源树共 44 个核心迁移。独立 Search 数据库无期刊新增迁移。
3. 确认存储、文件扫描、文档解析组件和现有 AI Gateway 均已按站点配置运行。新增模块不引入独立模型密钥。
4. 先用平台管理员核验一家有真实代表授权的试点期刊。每家首次核验发放 5 篇试用额度，有效期 90 天。
5. 核对来源许可后上传一份获准材料，验证扫描、解析、AI 草稿、人工审核、固定版本公开与撤回的完整真实流程。

`JOURNALS_ENABLED=false` 暂停新期刊业务写入和新作业领取。数据库恢复/额度到期对账仍运行，既有公开读入口和通用接口的权限保护仍保留。默认启用；灰度环境可先关闭再开放。

## 来源和加工规则

- DOI 导入只向固定 Crossref 端点读取书目，拒绝任意 URL 抓取。每批最多 50 条，4 个并行请求；先预览，确认后再次核对来源再导入。
- 已发表论文的原作者、DOI 与出版日期保持独立。一个 DOI 只对应一个中立 Work；刊内解读新建于期刊工作空间，不获取个人研究对象的控制权。
- 仅书目不能生成解读。摘要来源只能产生明确标为“基于摘要”的解读，不能产生图卡。
- 内部加工、外部 AI 处理、衍生说明生成、原文公开、衍生说明公开分别授权，未勾选即未授权。
- PDF、DOCX、UTF-8 TXT/Markdown 单文件不超过 50 MB；默认期刊来源容量 2 GB。上传原件保留在私有材料库，扫描和解析成功后才用于生成。
- 上传先登记私有材料并计入容量，再写入存储；成功后更新论文来源，停留在等待授权的 `staging` 状态。编辑须在来源矩阵确认新文件的许可、依据和内部加工权限，才会进入免费解析队列；新文件不继承旧文件的授权。存储失败的材料仍计入容量，过期的 staging 作业由恢复流程结算，避免重复上传绕过容量或覆盖共享原件。失败或取消后可使用新请求键重新上传。
- AI 输出包含一句话摘要、六字段、带证据的主张、图卡和 FAQ。引文必须出现在来源中；数值预测不能仅改标签作为实验结果。
- 规则校验辅助人工审核，不能证明所有科学内容正确。稿件中的指令只作为待分析文本，不产生平台操作权限。

## 作业、额度与冲突

### 增强版来源与加工入口

来源矩阵在现有逐篇来源文本和许可之上登记材料；登记链接不触发远程下载，也不表示已解析该材料。先通过原有编辑/上传流程提供实际摘要或全文，再核对作为加工依据的来源记录。辅助材料不能代替主要来源获得权限；公开可访问、许可名称和“编辑声明”均不自动授予处理或公开权。

主要来源的处理权限、衍生公开权限和原文件/图像公开权限分别核对。修改授权继续使用论文修订号，审核须针对修改后的版本。发生冲突时重新加载后比较，不覆盖其他编辑的修订。优先级分数不改变这些权限，点击入队仍须通过服务端和后台执行阶段的复核。

加工页按来源、授权、近期性、展示价值、学术中心性、解析、编辑权重和主题匹配展示分数。没有依据的维度列为待补充；分数不是科学质量评价。编辑可标记重点或延后，也可确认预计额度后逐篇入队；浏览页面及修改优先级不自动调用 AI。

### 额度口径与服务方案

服务页中的“可用”是尚未到期批次的 `remaining - reserved` 总和。账本中的 `remaining` 包含未结算预占，不能直接作为新增作业余额。到期批次的预占仍可完成结算；失败或取消后不恢复为可用额度。到期判定在读取时生效，不依赖后台对账恰好已运行。

Free、Starter、Pro、Premium、Custom 是人工服务方案。申请或报价不自动开通权限或额度；实际发放仍由平台按订单依据处理。价格与周期配额未经确认时不展示数值承诺。第一批继续保持一次成功交付草稿消耗 1 篇的现有规则；小数计费、多计量账本、在线支付与自动续费不在本轮范围。

### 既有队列与结算

作业持久化于 PostgreSQL，使用租约领取，单刊默认最多 2 个运行作业、100 个排队/运行作业。服务重启后继续处理已入队作业。

```text
生成请求 → 原子预占 1 篇额度 → 领取并复核权限 → 模型生成与来源检查
  ├─ 有效草稿原子保存 → 消耗 1 篇 → 等待人工审核
  └─ 失败 / 取消 / 权限失效 / 修订冲突 → 释放预占
```

技术重试最多 2 次，属于同一个作业。用户显式重试创建新请求并关联失败作业；请求键重放返回原终态。过期额度不会因取消而恢复可用。来源解析不扣 AI 篇数。

编辑在生成过程中修改草稿时，生成结果不能覆盖新修改。失败结果仅供有权限的编辑私下比较；采用后仍需通过保存校验和重新审核。

服务申请可记录报价、拒绝或取消。管理员通过关联服务申请的额度开通完成批准；同一申请不能以不同请求键重复开通。支付和发票仍由人工服务流程处理。

## 审核、发布与纠错

人工审核绑定修订号和来源/许可摘要。更改内容、来源、许可或审核指派使旧审核失效。负责人/管理员确认后，版本、发布记录、公开指针在同一事务内提交。公开编号 publicationNo 独立于内部版本号；冻结出版元数据保留真实平台作者，原论文作者与 DOI 保留在期刊解读包和原文引用中。

公开快照保留原文身份、编辑部解读、证据定位和适用许可；不包含申请资料、内部许可证明、作业提示词或私有原件下载链接。Crossref 摘要不会因进入元数据而自动公开。

固定 v1 不被后续草稿覆盖。更正需要编辑、复审、发布新版本。限制/撤回后，固定版本页面及 API 返回不可访问；期刊目录保留论文身份与状态。公开响应禁用缓存，外部独立保存的副本无法保证回收。

原文撤回/作者授权争议应先限制受影响解读，留存核验依据后处理。首期个人对象关联与复制授权由平台人工留存具体对象版本、授权人、动作范围、附件、有效条件及原对象链接，再由编辑提交获准来源；不自动迁移个人对象。

读者登录后可在固定解读页面提交纠错反馈，并查看自己的工单及处理说明。期刊负责人、管理员和编辑从工作台处理本刊反馈，注明已处理或未采纳原因；反馈及回复保持私密，不直接修改或公开论文内容。论文更正仍须走修订、复审、新版本发布流程。

## API 约定

API 服务原生路径无 `/api`；浏览器同源代理添加 `/api`。公开分页默认 20、最大 100，按 UUID 升序，使用返回的 `nextCursor`。

| 方法与同源路径 | 返回/用途 |
|---|---|
| `GET /api/journals?cursor=…&limit=20` | `items`、`nextCursor` |
| `GET /api/journals/{slugOrId}` | `journal`，含公开身份和目录计数 |
| `GET /api/journals/{journalId}/articles` | 安全书目、内容状态、允许公开的固定版本链接 |
| `GET /api/research/{publicId}` | 既有研究对象概览和最新公开版本 |
| `GET /api/research/{publicId}/v/{versionNo}` | 既有版本数据，期刊版本新增可选 `research.journalPackage` |
| `POST /api/journals/{id}/articles/preview` | 登录后 DOI 预览，逐项 `ready/duplicate/failed`，不写入 |
| `POST /api/journals/{id}/articles/import` | 确认导入，逐项 `imported/duplicate/failed` |
| `POST /api/journals/{id}/articles/{articleId}/source-file` | multipart：`revision`、`requestKey`、`file` |
| `GET /api/journals/{id}/articles/{articleId}/sources` | 材料矩阵、加工能力、论文修订与授权变更记录 |
| `POST /api/journals/{id}/articles/{articleId}/sources` | `revision`、`source`，登记来源与明确权限 |
| `PATCH /api/journals/{id}/articles/{articleId}/sources/{sourceId}/rights` | 修订校验后的逐项权限、依据与可信状态更新 |
| `POST /api/journals/{id}/articles/{articleId}/processing-capability/recalculate` | 重新评估当前来源与授权范围 |
| `GET /api/journals/{id}/processing-priorities` | 加工评分、原因、待补维度与分页 |
| `POST /api/journals/{id}/articles/{articleId}/priority-override` | 编辑重点权重、延后时间与操作原因 |
| `POST /api/journals/{id}/articles/{articleId}/processing-jobs` | 显式确认后复用原有 AI 队列、修订与幂等检查 |
| `GET /api/journals/{id}/service-plan` | 人工服务状态、有效额度、预占、过期和存储使用 |
| `POST /api/admin/journals/service-requests/{id}/review` | `status`、`expectedStatus`、`note`，记录人工服务处理 |
| `POST /api/journals/{id}/articles/{articleId}/feedback` | `versionNo`、`content`、`requestKey`，提交私密纠错 |
| `GET /api/journals/{id}/feedback?limit=20&cursor=…` | 编辑查看本刊，其他已验证用户仅查看自己提交的工单 |
| `POST /api/journals/{id}/feedback/{feedbackId}/respond` | `expectedStatus`、`status`、`response`，处理并留存说明 |

其他刊内写入继续使用会话、CSRF、防重放键和修订号。400 表示输入不完整，403 表示无操作权限，404 不暴露其他期刊的私有对象，409 表示状态/修订/幂等冲突。限流沿用站点公共规则。

`journalPackage` 只在可公开的期刊固定版本出现；受限/撤回的固定版本接口返回 404。示意结构如下，非真实论文数据：

```json
{
  "metadata": {"title": "原论文题名", "doi": "10.1234/example", "authors": ["Original Author"]},
  "identity": "journal-authored-interpretation-of-published-work",
  "draft": {"summary": "明确范围的解读", "core": {}, "claims": [], "figures": [], "faq": [], "scope": "abstract", "language": "zh"},
  "source": {"kind": "abstract", "label": "摘要来源", "url": "https://doi.org/10.1234/example"},
  "review": {"method": "editorial-human-review", "revision": 4},
  "license": "CC-BY-4.0",
  "versionNo": 1,
  "url": "/research/OSR-EXAMPLE/v/1"
}
```

公开 API 读取次数只反映平台调用，不能等同 AI 引用。访客统计未配置时返回 `null`，不显示为零。外部 AI 引用监测、Topic Hub、知识图谱和行业认证属于后续阶段。

公开站点地图入口为 `/journals/sitemap.xml`，按期刊列出 `/journals/{slug}/sitemap.xml`。每刊地图包含公开主页及允许访问的固定版本，从公开 API 分页读取；不包含草稿、内部材料或反馈，受限/撤回版本不再列入。地图禁用缓存，超过单份 50,000 条协议边界时返回暂不可用，需再拆分后扩容。

## 验证与回退

真实数据库测试仅接受显式的 loopback `JOURNAL_TEST_DATABASE_URL` 与 `journal_test` 测试库，不读取站点凭据。迁移演练脚本创建独立临时数据库，检查前进、回退与再次应用后个人研究对象保留。

```text
pnpm exec prisma generate --schema infra/schema.prisma
pnpm --filter @openscience/search generate
pnpm --filter @openscience/api... build
pnpm --filter @openscience/domain exec vitest run journal --testTimeout=20000
pnpm --filter @openscience/api exec vitest run journal test/research-routes.test.ts --testTimeout=20000 --no-file-parallelism
pnpm --filter @openscience/agent-worker exec vitest run test/journal-worker.test.ts
pnpm --filter @openscience/web build
pnpm --filter @openscience/web exec vitest run journal
pnpm --filter @openscience/web exec playwright install chromium
node scripts/journals/verify-migration.mjs
pnpm docs:lint
pnpm audit:docs-sync
```

浏览器验收另需设置 `JOURNAL_BROWSER_TEST=1` 和上述测试库变量，再运行 API 包的 `test/journal-browser.test.ts`。先以 `API_ORIGIN=http://127.0.0.1:3001` 构建 Web；验收默认占用本机 3001 端口启动隔离 API，Web 使用随机端口。若系统保留了该端口，可设置 `JOURNAL_BROWSER_API_PORT`（例如 43141），并先用相同端口的 `API_ORIGIN` 重新构建 Web。截图输出到已忽略的 `apps/web/test/visual/out/journals/`；实际浏览器请求启用真实会话/CSRF，后台作业通过正式入队和取消流程预占、释放额度。

生产回退优先关闭功能并回退应用版本，保留新增表。期刊迁移的 `rollback.sql` 会删除期刊表，包含期刊业务数据；仅用于空环境/隔离演练或已备份并明确批准的数据回退。不能在已运营期刊上直接执行。上方历史本地验证命令不覆盖现行生产 AGENTS 的最小定向验证与禁用 CI 政策；恢复部署按当前部署手册执行。

来源矩阵复用既有 JSON 和事件表，本轮不新增迁移。开始使用矩阵后，不能直接回退到不识别矩阵及动态授权到期的旧应用；旧版本可能忽略逐项限制。回退候选必须保留同等权限检查，或先在当前版本限制受影响解读并确认页面/API 已不可访问。`JOURNALS_ENABLED=false` 只暂停新写入，不替代公开读取的授权检查。

本地测试不替代生产扫描/解析 sidecar、真实模型、对外访问和性能验收。当前证据与尚需部署验证的项目见 [CURRENT handoff](../handoff/2026-09-15-journal-onboarding-handoff.md)。
