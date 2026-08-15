# OpenScience AI Research Infrastructure

> 产品需求、技术架构与 Kimi Code 执行规范  
> 文档状态：Baseline v1.0  
> 决策日期：2026-07-24  
> 适用阶段：现有代码审计、MVP 重构、阿里云邀请测试、第二阶段规划

## 0. 文档用途

本文档是 OpenScience 项目的当前单一需求基线（source of truth），面向产品负责人、Kimi Code、开发子 Agent 和未来协作者。实现者必须先阅读本文档及根目录 `AGENTS.md`，再检查现有代码；不得仅根据零散聊天、旧方案或文件名猜测需求。

本文档中的词义：

- **MUST**：MVP 不满足即不得验收。
- **SHOULD**：原则上实现，若暂缓必须记录原因和替代方案。
- **MAY**：可选或后续阶段能力。
- **Research Object（RO）**：可理解、可复现、可讨论、可迭代、可连接的科研对象。
- **SDF**：Structured Document Format，RO 的机器可读表达与可导出文件包。
- **Hermes**：用户可见的统一大 Agent、科研助手与任务编排入口。
- **Worker/Sub-Agent**：由 Hermes 或 Kimi Code 主 Agent 委派的受限专业执行单元。

实现顺序必须遵循：先审计现有代码和数据，再建立架构决策记录，最后分阶段修改。禁止在没有迁移计划时重写全部系统。

## 1. 产品定位

OpenScience 是面向 AI 时代的科研基础设施，目标是把一次性 PDF 转化为持续演化的科研对象，并将科研生产、传播、评价和协作纳入同一条可追踪链路。

核心表达：

> Science is no longer published. It evolves.  
> Beyond papers. Toward living research.

产品愿景是“科学研究领域的 GitHub + AI Research OS”，但首版不是：

- 传统论文数据库的替代品；
- 只允许上传 PDF 的另一个 arXiv；
- 自动生成论文的单功能工具；
- 以帖子和群聊为核心的普通科研社交网站；
- 对科研正确性作最终裁决的 AI 审稿机构；
- 提供专利优先权或法律效力保证的存证机构。

## 2. 已确认的产品决策

### 2.1 总体边界

1. 保留现有 Scholars Tea / AI Research Workshop 中可复用模块，但重新设计整体架构。
2. 首个 MVP 的核心闭环是：
   `SDF 创建 → AI 结构化 → 人工确认 → 版本保存 → 公开展示 → 评论/协作`。
3. 公众可浏览；注册采用邮箱验证码申请与确认流程，不要求邀请码。使用平台即确认平台服务条款与适用许可声明。
4. 当前使用邮箱验证；正式上线后，公开发布前可按合规需要接入第三方实名认证。
5. 平台最终支持私有、邀请可见、公开三种 RO 可见性。
6. 作者确认公开后生成平台时间戳、RO unique ID 和版本 ID。
7. 平台只声明“记录平台接收时间和版本哈希”，不承诺专利、著作权或司法存证效力。
8. 长期目标包括正式预印本平台、DOI、ORCID 和 Crossref 等基础设施接入。

### 2.2 数据与版本

1. SDF 同时具有数据库表达和可导出标准文件包。
2. MVP 支持六字段表单与普通编辑器 + AI 自动结构化；PDF、Word、LaTeX 导入在后续迭代。
3. 已公开版本永久不可原地修改；任何修改必须产生新版本或勘误。
4. 版本存储必须增量化：未变化的内容不得重复存储。
5. 内部使用 UUID/ULID；外部使用永久可读编号、版本号和稳定 URL。
6. 作者公开时分别选择文字、代码和数据许可。

### 2.3 协作、审核与身份

1. MVP 建立完整的 Branch、Commit、Fork、Pull Request、Review、Merge、Issue 数据模型和基础交互。
2. 作者组决定署名；系统独立记录所有事实贡献者及 CRediT 角色。
3. 分支继承所属 RO 的可见性。
4. AI 审核通过后可发布；审核未通过时禁止发布，但允许申诉并由人工处理申诉。
5. AI 仅对安全、完整性、恶意文件、隐私泄露和明显违规进行硬阻断；科学质量问题以警告形式呈现。

### 2.4 技术与运行

1. 初期所有服务部署于一台阿里云 ECS；后续迁移到 Web/API ECS + RDS + OSS + 独立 Python 执行节点。
2. Python 可视化执行与数据库必须隔离，单机时期也不得共享凭据或数据网络。
3. 主要开发环境在服务器；服务器购买前，Windows 本地仅承担轻量任务，后续可能迁移到 macOS。
4. 技术栈：Next.js/TypeScript、Node.js API、Python Worker、PostgreSQL、Redis、S3 兼容存储、Docker。
5. MVP 搜索采用 PostgreSQL 全文检索 + pgvector。
6. 首版 AI 路由使用 MiniMax-M3 为主模型；回退/兜底策略由 AI Gateway 配置管理，具体模型与触发条件见 ADR/运行配置，不在业务代码写死。
7. 用户按月获得固定 AI Credit，管理员可追加。

### 2.5 UI 与交互

1. 登录后默认进入综合 Dashboard。
2. SDF 编辑器采用左侧大纲、中间编辑区、右侧 SDF/AI 面板。
3. 知识图谱首版自动生成、只读展示。
4. MVP 社区范围限于 RO 评论、Issue、PR 和 Review；学科社区、普通帖子、群聊等记录在第二阶段。
5. 中文优先，首日起采用中英文国际化架构；桌面和移动端功能一致。
6. 工作台采用现代产品式 UI，公开 RO 页面采用严肃学术出版风格，协作区域采用 GitHub 式交互。
7. Hermes 默认可读取当前页面；写入、删除、Merge、发布和权限变更需要审批，但审批必须支持批量预览、作用域授权和撤销，避免频繁打断。

## 3. 用户、Workspace 与权限模型

### 3.1 账户状态

- `invited`：已获得邀请码，尚未完成邮箱验证。
- `email_verified`：已验证邮箱，可创建私有内容。
- `identity_verified`：正式上线后已通过第三方实名认证。
- `suspended`：因违规或安全原因暂停。
- `deleted`：逻辑删除，保留必要审计信息。

测试阶段，`email_verified` 用户可申请发布；正式上线后，公开发布必须达到 `identity_verified`。

### 3.2 Workspace

所有内容统一由 Workspace 持有：

- 每个用户自动拥有一个 Personal Workspace；
- 用户可以创建或加入 Team/Lab Workspace；
- RO 创建时选择个人或团队 Workspace；
- 所有权、存储额度、成员权限、计费和审计均以 Workspace 为边界；
- 个人 Workspace 与团队 Workspace 使用同一套数据模型，避免维护两套逻辑。

### 3.3 角色

| 角色 | 核心权限 |
|---|---|
| Owner | 转移所有权、管理成员、管理作者、删除/撤回、修改关键安全设置 |
| Maintainer | 管理内容、分支、PR、Issue、版本和发布候选 |
| Author | 编辑内容、确认署名和版本声明 |
| Contributor | 创建分支、Commit、PR 和 Issue |
| Reviewer | 审阅指定 PR、版本或稿件 |
| Viewer | 查看邀请可见内容 |
| Moderator | 处理举报、申诉和违规内容 |
| Platform Admin | 平台级运维、配额和治理 |

权限采用 RBAC + 资源归属检查。禁止仅在前端隐藏按钮；API 必须进行同样的授权检查。

### 3.4 作者与贡献

- 创建者不自动获得永久第一作者或通讯作者地位。
- 作者组确认作者名单、作者顺序和通讯作者。
- 系统不可依据字数、Commit 数或 AI 估计自动决定署名。
- 所有贡献记录不可被作者名单变化抹除。
- 贡献使用 CRediT 分类，例如 Conceptualization、Methodology、Software、Validation、Data Curation、Visualization、Writing、Supervision。
- Merge PR 时若新增作者或改变作者顺序，必须触发高风险审批。

## 4. 核心对象：Research Object

### 4.1 状态机

建议状态：

`draft → under_review → approved → published → revised`

补充状态：

- `withdrawn`：公开内容被作者撤回，但历史和撤回原因仍可见；
- `restricted`：因投诉或安全原因限制展示；
- `rejected`：发布审核失败；
- `archived`：项目结束但仍可访问。

### 4.2 可见性

- `private`：仅 Workspace 授权成员可见；
- `invite_only`：持有效邀请或被指定账户可见；
- `public`：公众可见并可被搜索引擎索引。

Branch、Issue、PR 默认继承 RO 可见性。任何扩大可见范围的操作必须显式审批。

### 4.3 公共页面

一级页面/标签：

1. Overview
2. Manuscript
3. Methods & Experiments
4. Data & Code
5. Figures & Visualization
6. Versions & Diff
7. Issues
8. Pull Requests
9. Reviews & Discussions
10. Citations & Related Work

公开页必须显示：标题、作者与身份状态、机构声明、摘要、许可、unique ID、版本 ID、发布时间、版本哈希、引用格式、AI 审核摘要及平台法律免责声明。

## 5. SDF 规范

### 5.1 六个必填字段

1. `problem`：具体科学或技术问题；
2. `insight`：核心思想、创新点或关键发现；
3. `method`：研究方法、实验设计和技术路线；
4. `results`：主要结果与结论；
5. `limitations`：局限、假设和未解决问题；
6. `reproducibility`：数据、代码、材料和环境获取方式。

可选字段包括：实验、数据集、图表、应用场景、相关工作、争议、失败实验、作者贡献和伦理声明。

### 5.2 推荐导出结构

```text
open-science-object/
├── manifest.json
├── manuscript/
│   ├── paper.md
│   ├── abstract.md
│   └── references.json
├── sdf/
│   ├── core.json
│   ├── relations.json
│   └── validation.json
├── experiments/
│   └── experiment-001/
│       ├── protocol.yaml
│       ├── data.csv
│       ├── notebook.ipynb
│       └── result.png
├── code/
│   ├── src/
│   └── environment.yml
├── figures/
├── discussions/
├── provenance/
│   ├── contributors.json
│   ├── licenses.json
│   └── audit.json
└── versions/
    └── index.json
```

### 5.3 `manifest.json` 最小结构

```json
{
  "schema": "openscience-sdf",
  "schemaVersion": "0.1.0",
  "objectId": "OSR-2026-000001",
  "versionId": "OSR-2026-000001-v1",
  "version": 1,
  "title": "Example research object",
  "visibility": "public",
  "publishedAt": "2026-07-24T00:00:00Z",
  "contentHash": "sha256:...",
  "authors": [],
  "licenses": {
    "text": "CC-BY-4.0",
    "code": "MIT",
    "data": "CC-BY-4.0"
  },
  "artifacts": [],
  "parentVersion": null,
  "forkedFrom": null
}
```

字段必须有 JSON Schema；Schema 变更遵循语义化版本。导出包不得依赖平台私有数据库才能读取。

### 5.4 编辑器

桌面端：

- 左：章节大纲、实验、图表、数据、代码和版本导航；
- 中：Markdown/富文本正文与附件编辑；
- 右：六字段提取结果、AI 建议、引用、审核与关系图入口。

移动端保留全部功能，但通过抽屉和分步页面呈现三栏内容，不要求三栏同时显示。

AI 提取结果必须以建议/差异形式展示，用户确认后才能写入 SDF。

## 6. 标识、发布时间与许可

### 6.1 标识层

- 内部主键：UUID v7 或 ULID；
- 公开 RO ID：建议 `OSR-YYYY-NNNNNN`；
- 版本 ID：`OSR-YYYY-NNNNNN-vN`；
- URL：`/research/OSR-YYYY-NNNNNN/v/N`；
- DOI：后续映射到公开版本，不替代内部主键。

公开 ID 永不复用。撤回、删除或合并后，ID 仍指向状态说明页。

### 6.2 时间戳

MVP 时间戳由 UTC 数据库事务时间、版本 manifest 和 SHA-256 内容哈希构成。发布记录写入只追加审计日志。

页面必须声明：

> 此时间戳仅证明平台在相应时间接收并记录了该版本及其内容哈希，不构成专利优先权、著作权归属、科研正确性或司法存证保证。

后续可增加 RFC 3161 可信时间戳、第三方存证或 DOI 注册，但必须经过法律与运营评估。

### 6.3 许可

发布前分别选择：

- 文字：CC BY 4.0、CC BY-NC 4.0、All Rights Reserved；
- 代码：MIT、Apache-2.0、GPL-3.0、不开源；
- 数据：CC0、CC BY 4.0、自定义限制、不可下载。

Fork 和再利用必须继承并验证来源许可。许可变更不得追溯覆盖已公开版本。

## 7. 增量版本与内容寻址

### 7.1 原则

- 公开版本不可变；
- 未变化的文件只存储一次；
- 版本必须可完整重建；
- 任意版本必须可校验；
- 差异展示必须区分文字、结构化字段、代码、数据、图表和结论变化。

### 7.2 存储模型

1. 每个 Blob 以 SHA-256 为键保存。
2. Artifact 记录逻辑路径、MIME、大小和 Blob hash。
3. Version Manifest 保存某版本对 Artifact 的引用。
4. 未改变 Artifact 继续引用原 Blob。
5. SDF JSON 的结构化变化使用 RFC 6902 JSON Patch。
6. 大型二进制文件不生成行级 diff，只显示哈希、大小、元数据和替换关系。
7. 可定期生成小型逻辑检查点以加速重建，但相同 Blob 不重复保存。

### 7.3 Diff 类型

- 文本 diff；
- SDF 字段 diff；
- 结论变化摘要；
- 作者/贡献者变化；
- 引用变化；
- 文件增删与哈希变化；
- 表格数据摘要变化；
- 代码 diff；
- 许可证和可见性变化。

AI 可生成自然语言变更摘要，但底层确定性 diff 才是事实来源。

## 8. GitHub 式科研协作

| 概念 | 科研语义 |
|---|---|
| Repository | Research Object |
| Commit | 一次有说明、贡献者和时间的变更 |
| Branch | 尚未进入主版本的研究方向或修改路线 |
| Issue | 科学问题、方法质疑、复现失败、错误报告或改进建议 |
| Fork | 从特定公开版本建立独立衍生 RO |
| Pull Request | 向原 RO 提交实验、数据、分析、修正或正文变更 |
| Review | 对 PR 或版本的逐项科学审查 |
| Merge | 接受贡献并写入主分支 |
| Release | 生成不可变公开版本 |

### 8.1 Fork

- Fork 产生新的 RO 和 unique ID；
- 永久保留来源对象、来源版本和内容哈希；
- 原作者不会自动成为新成果作者；
- 来源许可、引用与归属要求继续生效；
- Fork 作者不能移除来源关系；
- Fork 可通过 PR 向原 RO 贡献。

### 8.2 Pull Request

PR 必须声明：

- 变更的 SDF 字段和文件；
- 是否改变方法、数据或核心结论；
- 新增贡献者及 CRediT 角色；
- 数据/代码许可；
- 利益冲突；
- 自动检查结果；
- 是否要求发布新版本。

### 8.3 Merge

- 仅 Owner/Maintainer 可发起 Merge 审批；
- Merge 不修改历史公开版本；
- Merge 进入主分支后形成新的草稿状态；
- 发布新版本需要作者确认；
- 改变作者、许可、核心结论或可见性的 Merge 必须进行高风险确认；
- 冲突由人类选择或重新编辑，不能让 AI 静默决定科学含义。

## 9. Hermes Agent 系统

### 9.1 定位

Hermes 是常驻页面的统一大 Agent，负责理解当前页面、用户意图、科研上下文和任务进度。Hermes 可以委派子 Agent，但不能以“自主”为由绕过权限、发布确认或资源配额。

### 9.2 推荐子 Agent

| 子 Agent | 责任 | 禁止事项 |
|---|---|---|
| SDF Extractor | 从正文提取六字段和关系草案 | 不直接覆盖用户正文 |
| Research Reviewer | 完整性、逻辑、统计和可复现性提示 | 不裁定研究一定正确/错误 |
| Citation Checker | 引用格式、缺失引用和可解析性检查 | 不伪造来源 |
| Visualization Planner | 把概念转成可视化方案和代码规格 | 不直接执行系统命令 |
| Python Policy Checker | AST、依赖、资源和输出检查 | 不拥有数据库凭据 |
| Sandbox Runner | 在隔离环境执行通过检查的脚本 | 不访问网络、数据库或其他用户文件 |
| Safety Reviewer | 识别隐私、恶意文件、违规内容 | 不替代申诉人工 |
| Community Manager | 第二阶段内容健康与治理分析 | 普通用户不可调用管理工具 |

### 9.3 AI 路由

- 主模型：MiniMax-M3；
- 回退：由 AI Gateway 配置管理，具体策略见 ADR/运行配置，不在业务代码写死；
- 所有模型调用经统一 AI Gateway；
- Gateway 记录模型、版本、token、费用、延迟、错误和回退原因；
- Provider SDK 不能散落在业务代码中；
- 长任务异步执行；
- 流式响应与结构化输出使用独立通道；
- JSON 输出必须经 Schema 校验，失败时有限重试。

### 9.4 审批分级

为了兼顾“所有写操作需确认”和交互速度：

| 等级 | 示例 | 交互 |
|---|---|---|
| R0 读取 | 读取当前页面、搜索、解释 | 自动执行 |
| R1 可撤销草稿 | 批量生成 SDF 建议、修改草稿 | 展示统一 diff，一次批准整个批次 |
| R2 协作写入 | 新建 Issue、Commit、PR、评论 | 可批准当前任务内同类操作 |
| R3 高影响 | Merge、发布、作者/许可/可见性变化 | 最终摘要 + 明确确认 |
| R4 危险操作 | 删除、转移所有权、密钥、安全设置 | 重新验证 + 逐项确认 |

每次确认必须说明：将改变什么、作用范围、能否撤销、预计费用和预计耗时。对已经批准的同一批任务不得重复弹窗。

## 10. Agent 生成的 Python 可视化

### 10.1 用户场景

用户在阅读笔记或研究资料时，对某个概念（如电磁场传播、近场衰减、干涉、偏振）不清楚。Hermes 分析问题，生成解释、模型假设和临时 Python 脚本，在沙箱中运行，并返回可视化图片。

### 10.2 输出

- 自然语言解释；
- 数学模型与假设；
- Python 脚本；
- 参数表；
- PNG/SVG；
- 示意图/定量仿真标签；
- 运行环境和依赖版本；
- 保存到本设备或保存到个人笔记的动作。

### 10.3 沙箱限制

- 30 秒；
- 单核；
- 1 GB 内存；
- 禁止公网、内网、云元数据访问；
- 非 root；
- 只读根文件系统；
- 临时目录；
- 进程数、文件数、输出大小受限；
- 禁止宿主目录、Docker Socket 和数据库凭据；
- 白名单包：NumPy、SciPy、SymPy、Matplotlib、Pillow 等；
- 禁止 `os`、`subprocess`、`socket`、`ctypes`、动态安装和任意二进制；
- 执行完成立即销毁运行容器。

单 ECS 阶段必须使用独立 Docker Network。Sandbox 容器不加入 Data Network；生产开放前迁移到独立 ECS/沙箱平台。

### 10.4 自然语言修改

用户可用自然语言要求修改脚本或参数。每次修改都重新生成代码、展示 diff、重新进行策略检查并在新容器中执行。禁止复用可能已污染的容器。

## 11. AI 发布审核

### 11.1 硬阻断

- 必填字段缺失；
- 文件感染恶意代码或包含危险可执行内容；
- 公开内容泄露身份证、密钥、访问令牌等高风险隐私；
- 明显违法或平台禁止内容；
- 无法确认发布者权限；
- 未选择许可证；
- 版本哈希或 manifest 校验失败。

### 11.2 警告但不替代作者判断

- 方法逻辑疑点；
- 统计合理性；
- 图表规范；
- 数据一致性；
- 可复现性不足；
- 潜在引用缺失；
- AI 认为结论可能过度外推。

AI 报告必须提供证据位置和不确定性，不得只输出单一分数。

### 11.3 申诉

审核失败后生成稳定审核记录；用户可修改重审或提交申诉。申诉进入 Moderator 队列，人工结果和理由写入审计日志。

## 12. 搜索与知识关联

### 12.1 MVP

PostgreSQL 全文检索 + pgvector：

- 关键词字段：标题、作者、机构、unique ID、术语、参考文献；
- 语义字段：摘要、Problem、Insight、Method、Results；
- 过滤字段：学科、年份、作者、机构、版本、许可、状态；
- 中文由应用层分词和术语归一化；
- 排序示例：关键词 45% + 语义 40% + 质量/时效 15%。

### 12.2 演进

- 搜索交互和拼写纠错需求增长：引入 Meilisearch；
- 大规模聚合与日志分析：评估 OpenSearch；
- 向量规模与吞吐超过 pgvector 能力：评估 Qdrant；
- 业务数据库始终是权限和实体关系的事实来源，搜索索引仅为派生数据。

## 13. 文件、浏览器缓存与配额

### 13.1 存储层

使用 Storage Adapter：

- 单机期：本地 S3 兼容存储/MinIO 或受控本地对象目录；
- 迁移期：阿里云 OSS；
- 数据库只保存元数据和对象键，不保存大型二进制；
- 上传使用分片、校验和、MIME 检测与病毒扫描。

### 13.2 浏览器保存

临时可视化、脚本和阅读笔记可保存到 IndexedDB：

- 默认临时结果保存 24 小时；
- “保存到本设备”不占服务端长期存储；
- “保存到我的笔记”上传并支持跨设备；
- UI 明确提示浏览器清理、无痕模式或配额回收可能造成丢失；
- 提供一键导出和清理。

### 13.3 配额

按用户等级、Workspace 和文件类型配置：

- 单文件大小；
- Workspace 总容量；
- 单 RO 容量；
- 月上传流量；
- AI Credit；
- Python 任务次数和运行时间；
- 并发任务数。

所有限制必须是后台可配置项，不写死在前端。

## 14. 系统架构

### 14.1 推荐 Monorepo

```text
openscience/
├── apps/
│   ├── web/                 # Next.js
│   ├── api/                 # Node.js/Fastify
│   ├── agent-worker/        # Hermes 异步任务
│   ├── science-worker/      # Python 科学处理服务
│   └── sandbox-controller/  # 临时执行容器控制器
├── packages/
│   ├── domain/
│   ├── database/
│   ├── auth/
│   ├── sdf-schema/
│   ├── versioning/
│   ├── storage/
│   ├── ai-gateway/
│   ├── search/
│   ├── ui/
│   ├── config/
│   └── observability/
├── infra/
│   ├── compose/
│   ├── nginx/
│   ├── sandbox/
│   ├── scripts/
│   └── migrations/
├── docs/
│   ├── adr/
│   ├── api/
│   ├── runbooks/
│   └── threat-model/
├── .kimi-code/
├── .agents/
├── AGENTS.md
└── pnpm-workspace.yaml
```

具体目录必须在现有代码审计后调整；禁止为了匹配此示例而无理由搬动稳定代码。

### 14.2 单 ECS 拓扑

- Nginx/Caddy：TLS、静态资源、反向代理；
- Web；
- API；
- Agent Worker；
- PostgreSQL；
- Redis；
- 对象存储；
- Sandbox Controller；
- 临时 Python Sandbox。

网络：

- `public_net`：代理到 Web/API；
- `app_net`：API、Agent Worker；
- `data_net`：API/Worker 到 PostgreSQL、Redis；
- `sandbox_control_net`：Controller 调度；
- 运行中的 Python 容器不加入 `data_net`，默认无外网。

数据库不得绑定公网地址；安全组只开放 80/443 和受限运维入口。

### 14.3 后续拆分

1. PostgreSQL → RDS；
2. 文件 → OSS；
3. Redis → 独立/托管 Redis；
4. Sandbox → 独立 ECS；
5. Worker 按队列横向扩展；
6. CDN 加速公开资源；
7. 搜索服务按需求拆分。

## 15. 核心数据实体

必须至少覆盖：

- User、IdentityVerification；
- Workspace、Membership、Invitation；
- ResearchObject、SDFDocument、SDFNode；
- Blob、Artifact；
- Branch、Commit、ChangeSet；
- Version、VersionManifest、Publication、Identifier；
- ForkRelation；
- Issue、PullRequest、Review、Comment；
- Author、Authorship、Contribution；
- LicenseAssignment；
- AIReview、Appeal；
- AgentSession、AgentTask、ToolApproval；
- SandboxJob、SandboxArtifact；
- UsageLedger、QuotaPolicy；
- Notification、AuditLog。

数据库迁移必须向前可部署、可回滚或有明确补偿步骤。生产环境禁止自动执行破坏性迁移。

## 16. API 与事件

API 以模块化 REST/JSON 为主，长任务使用任务 ID + SSE/WebSocket 进度。关键资源必须有幂等键和乐观锁。

核心模块：

- `/auth`
- `/workspaces`
- `/research-objects`
- `/sdf`
- `/branches`
- `/commits`
- `/versions`
- `/issues`
- `/pull-requests`
- `/reviews`
- `/publications`
- `/search`
- `/agent`
- `/sandbox-jobs`
- `/usage`
- `/admin`

关键事件：

- `research_object.created`
- `sdf.updated`
- `commit.created`
- `pull_request.opened`
- `pull_request.merged`
- `version.published`
- `ai_review.completed`
- `appeal.created`
- `sandbox_job.completed`
- `quota.threshold_reached`

事件必须可重试；消费者必须幂等。

## 17. 安全与隐私

MUST：

- 密钥仅来自服务器 Secret/环境变量，不进入仓库；
- 全部写操作记录审计日志；
- 登录、发布、上传、AI、搜索和沙箱接口限流；
- 上传文件进行类型检测、大小限制和恶意内容扫描；
- 防止跨 Workspace 越权；
- 公开前进行敏感信息扫描；
- Session、Cookie、CSRF、CORS 和 CSP 正确配置；
- 数据库每日备份并定期恢复演练；
- 管理后台启用更强认证；
- Sandbox 威胁模型单独维护；
- 生产日志不得记录完整论文、密钥、身份证信息或模型 Prompt 中的敏感附件。

实名认证应由第三方服务处理；平台原则上只保留结果、时间和必要的提供商引用。

## 18. UI/UX

### 18.1 Dashboard

- 最近 RO；
- 待处理 PR/Review；
- 阅读笔记；
- Hermes 进行中任务；
- AI Credit 与存储使用；
- 通知与社区动态。

### 18.2 视觉系统

- 工作台：现代、克制、信息密度适中；
- 公开成果：严肃学术排版；
- 协作区域：熟悉的 GitHub 式状态、diff、review；
- 中文与英文内容混排良好；
- 深色模式可后续，但颜色 token 从首版预留；
- 所有主要流程在移动端可完成，复杂三栏界面改为分步/抽屉，而非删除功能。

### 18.3 可访问性与性能

- 键盘导航；
- 明确焦点状态；
- 语义化 HTML；
- 图片 alt；
- WCAG AA 级对比度目标；
- 公开页面优先 SSR/缓存；
- 大文件列表虚拟化；
- AI/上传任务显示可恢复进度；
- 错误提示包含重试、保存草稿和问题定位。

## 19. 第二阶段功能

必须记录但不进入 MVP 阻断范围：

- 学科社区与普通帖子；
- 点赞、收藏、关注；
- Tea Party/实时群聊；
- 课题组和实验室公共主页增强；
- Top Questions 与投票；
- Community Manager；
- 文献批量解析、个人知识图谱和文献地图；
- PDF/Word/LaTeX 全量导入；
- 可编辑知识图谱；
- DOI、ORCID、Crossref；
- 高级同行评审和开放审稿；
- PII、C Factor、探索贡献指数；
- Negative Result Layer 增强；
- 独立搜索与向量服务；
- 高级计算队列和更多科学运行环境。

第二阶段功能不得提前侵入 MVP 核心模块，但数据模型应避免明显封死扩展路径。

## 20. Kimi Code 开发工作流

### 20.1 原则

1. 每个任务先读 `AGENTS.md` 和相关 Skill。
2. 首次进入仓库必须执行代码审计，不得立即重构。
3. 每个阶段使用明确 Goal，说明完成条件和验证证据。
4. 主 Agent 负责计划、边界和整合；Sub-Agent 只承担独立、有限任务。
5. 修改前列出受影响文件和风险。
6. 修改后运行最小相关测试，再运行阶段验收测试。
7. 不得隐藏失败测试、跳过迁移检查或声称未验证的功能已完成。
8. 每个重大架构决定写入 `docs/adr/`。
9. 不得把生产 Secret、真实用户数据或数据库备份拉入 Kimi 上下文。

### 20.2 推荐开发子 Agent

- `codebase-explorer`：只读扫描和架构地图；
- `solution-architect`：模块边界、ADR、迁移路线；
- `frontend-engineer`：Next.js、响应式、可访问性；
- `backend-engineer`：API、权限、事件、幂等；
- `data-engineer`：PostgreSQL、迁移、版本模型、检索；
- `infra-engineer`：Docker、网络、备份、发布；
- `security-reviewer`：越权、密钥、沙箱和依赖风险；
- `qa-engineer`：单元、集成、E2E 和验收证据。

### 20.3 推荐 Skills

- `repo-map`
- `architecture-guard`
- `api-contract`
- `database-migration`
- `frontend-design`
- `infra-runbook`
- `security-review`
- `test-gate`

每个 Skill 使用项目级 `.agents/skills/<name>/SKILL.md`，便于 Windows、macOS 和其他兼容 Agent 工具共享。

### 20.4 推荐 MCP

1. **GitHub MCP**：仓库、Issue、PR、Actions；初始采用最小权限和只读工具集，提交/合并仍需审批。
2. **Context7 MCP**：查询 Next.js、Fastify、PostgreSQL 等当前版本官方文档。
3. **Playwright MCP**：仅用于本项目测试环境的 UI 检查；限制允许访问的 origin，禁止登录生产管理后台。
4. **数据库 MCP**：不直接连接生产；如确有需要，仅连接脱敏的 staging 数据库并使用只读账号。
5. **阿里云/SSH**：首版不推荐赋予通用 MCP 写权限；部署通过仓库脚本、CI/CD 和 Kimi 权限规则完成。

Kimi Code 已内置 Read、Bash、Grep 等能力，不需要为了“有更多工具”重复安装文件系统 MCP。

### 20.5 权限

- Read/Grep/Glob：允许；
- 普通测试与格式化命令：按项目白名单允许；
- Git push、PR 创建、数据库迁移、部署：询问；
- 删除、生产数据库、Secret、权限设置：拒绝或强确认；
- Hooks 只用于辅助拦截和提示，不能作为唯一安全边界，因为 Hook 失败时可能 fail-open。

## 21. 测试与验收

### 21.1 测试层

- 单元测试：领域规则、权限、diff、ID、配额；
- 集成测试：数据库、存储、队列、AI Gateway；
- 合同测试：前后端 Schema；
- E2E：注册、创建、编辑、审核、发布、Fork、PR、Merge；
- 安全测试：越权、上传、SSRF、Prompt Injection、Sandbox Escape 基线；
- 恢复测试：数据库恢复、对象存储校验、任务重试；
- 性能测试：公开页、搜索、上传、队列并发。

### 21.2 MVP 验收主流程

一个受邀用户必须能够：

1. 注册并验证邮箱；
2. 创建个人 Workspace 中的私有 RO；
3. 用编辑器输入内容；
4. 由 AI 提取六个 SDF 字段；
5. 审核并接受 AI 建议；
6. 创建 Commit 和版本候选；
7. 通过 AI 发布审核；
8. 选择许可证并确认作者；
9. 发布 v1，获得 unique ID、版本 ID、UTC 时间戳和哈希；
10. 公众查看公开页；
11. 另一用户 Fork、创建 Branch、提交 PR；
12. 原维护者 Review 和 Merge；
13. 作者发布 v2；
14. 页面准确展示 v1-v2 diff，未变化 Blob 不重复存储；
15. 用户向 Hermes 请求概念可视化，查看并自然语言修改脚本；
16. 沙箱任务在资源限制下完成，且无法访问数据库和网络。

## 22. 里程碑

### Phase 0：现有系统审计

- 目录、依赖、服务、数据库、环境变量和部署地图；
- 可复用/重构/淘汰清单；
- 数据迁移风险；
- 安全问题；
- 基准测试；
- ADR-0001。

### Phase 1A：平台底座

- Monorepo/模块边界；
- Auth、Invitation、Workspace、RBAC；
- PostgreSQL、Redis、Storage Adapter；
- 统一错误、日志、配置、审计；
- CI/CD 与服务器部署。

### Phase 1B：SDF 与版本

- 编辑器；
- 六字段；
- Artifact/Blob；
- Commit、Manifest、Diff；
- unique ID；
- 私有/邀请/公开。

### Phase 1C：协作

- Branch、Issue、Fork、PR、Review、Merge；
- 作者与 CRediT；
- 许可；
- 通知。

### Phase 1D：Hermes 与发布

- AI Gateway；
- SDF Extractor；
- AI Review；
- 申诉；
- 分级审批；
- 发布和公开页面。

### Phase 1E：轻量科学可视化

- Visualization Planner；
- AST 检查；
- Sandbox Controller；
- 临时图片与 IndexedDB；
- 自然语言修改；
- 威胁模型与隔离测试。

### Phase 2：社区与科研 OS 扩展

按第 19 节逐项立项，不与 MVP 并行失控开发。

## 23. 风险清单

| 风险 | 处理 |
|---|---|
| OpenScience 名称过于通用或重名 | 上线前做域名、商标和品牌调查 |
| AI 误判科研内容 | 硬阻断限于安全/完整性；科学问题仅警告；保留申诉 |
| 单 ECS 沙箱逃逸 | 邀请制、包白名单、无网、无凭据；正式开放前拆分 |
| 全套 Git 功能导致范围膨胀 | 先实现确定性领域模型和基础 UI，再增强协作体验 |
| 浏览器本地数据丢失 | 明确提示、导出、可选云保存 |
| 存储成本失控 | 内容寻址、增量 Manifest、按级别配额 |
| Agent 审批过多 | 批量 diff、任务级授权、风险分级、撤销 |
| 中英文和移动端拖慢开发 | 从底层国际化和响应式开始，内容翻译按优先级补齐 |
| 现有代码质量未知 | Phase 0 审计是强制门禁 |
| 预印本/DOI/实名合规复杂 | 不进入 MVP 法律承诺，后续单独评估 |

## 24. 尚待实测或外部确认

- 现有仓库的真实框架、依赖和数据库版本；
- 阿里云 ECS 最终规格、镜像和公网带宽；
- 服务器年度预算与模型费用边界；
- 正式实名认证供应商；
- MiniMax-M3 及回退模型的具体 API、模型 ID、结构化输出和价格；
- 中文分词在目标 PostgreSQL/RDS 环境中的实现；
- DOI/Crossref 申请主体和运营资质；
- OpenScience 品牌、域名和 unique ID 前缀；
- 用户级存储和 AI Credit 的初始具体数值；
- 公开内容的服务条款、隐私政策和许可证文案。

这些项目必须进入 ADR/运营决策，不允许 Kimi Code自行猜测后写死。

## 25. Kimi Code 首次执行指令

在现有仓库中启动时，使用：

```text
先完整阅读 AGENTS.md、docs/PROJECT_SPEC.md 和 .agents/skills/repo-map/SKILL.md。
当前目标不是立即重构，而是完成 Phase 0 只读审计。

请：
1. 建立目录、依赖、服务、数据库、环境变量、部署和测试地图；
2. 找出与 Hermes、AI Workshop、认证、上传、社区、WebSocket、模型路由有关的现有模块；
3. 按“保留 / 局部重构 / 替换 / 待确认”分类；
4. 标记安全风险、重复实现、失效功能和数据迁移风险；
5. 不修改业务代码；
6. 输出 docs/CODEBASE_AUDIT.md 和 docs/adr/0001-target-architecture.md 草案；
7. 所有结论必须引用具体文件路径或运行证据。
```

完成审计并由用户确认后，才进入 Phase 1A。

## 26. 官方工具依据

截至 2026-07-24，Kimi Code CLI 官方文档确认：

- 项目级 MCP 配置位于 `.kimi-code/mcp.json`；
- MCP 支持 stdio、HTTP 和旧式 SSE，并支持 `enabledTools`/`disabledTools`；
-项目级 Skills 可放在 `.kimi-code/skills/` 或 `.agents/skills/`；
- 项目级自定义 Agent 可放在 `.kimi-code/agents/` 或 `.agents/agents/`；
- Kimi 内置 `coder`、`explore`、`plan` 子 Agent；
- Hooks 可在工具调用前做检查，但失败时可能 fail-open，不应作为唯一安全边界；
- Goals 适合有明确完成条件和验证证据的长任务；
- Plugins 可打包 Skills、Commands、MCP 和 Hooks。

参考：

- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/guides/goals.html
- https://github.com/github/github-mcp-server
- https://github.com/microsoft/playwright-mcp
- https://github.com/upstash/context7
