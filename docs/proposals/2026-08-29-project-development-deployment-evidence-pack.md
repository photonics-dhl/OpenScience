# OpenScience 项目开发、部署与 suggested / confirmed 证据包

> 整理日期：2026-08-29（Asia/Shanghai）。本文用于阶段汇报和材料提交，事实范围为 Git、项目部署记录及本次 ECS 只读核验。它不是完整审计报告，也不包含账号、密钥、业务正文或用户级数据。

## 1. 结论摘要

- 当前开发分支为 `codex/hermes-wanko-live2d`，文档 HEAD 为 `2add415853570c4cd3cacbca13dfeb0f1e3825d4`；该 worktree 正保留尚未提交的 Task 8 开发改动。
- 当前生产 application / immutable release 均为 `5e5ae36a08ae314d0c35ee2b976e306aec73d219`，rollback 为 `6cabe422a8459dfa358786c9f5aae84558949f6b`。
- ECS 基础服务于 2026-07-31 上线；域名 Nginx/API 入口于 2026-08-03 部署并签发证书；Landing 网站于 2026-08-07 部署；公网入口于 2026-08-12 切换为 ECS 常驻 Cloudflare Tunnel。四个日期含义不同，不能合并成一个“上线时间”。
- 当前生产库确实存在“建议 → 人工确认”流程，但数据库没有名为 `suggested` 的枚举。建议态由 `agent_tasks.result` 非空并关联 `ingestion_tasks.state = needs_review` 表示；用户确认后，状态变为字面值 `confirmed`。
- 2026-08-29 ECS 只读聚合：关联 ingestion 任务共 21 条，其中待确认建议 14 条、`confirmed` 7 条。只统计状态，不导出研究内容或用户信息。

## 2. Git 仓库记录

### 2.1 分支快照

以下为 2026-08-29 `git branch --sort=-committerdate` 与 `git worktree list --porcelain` 的结果摘要，按最近提交时间排序。

| 分支 | 分支 HEAD | 最近提交时间（+08:00） | 最近提交 | 分类 |
|---|---|---|---|---|
| `codex/hermes-wanko-live2d` | `2add41585357` | 2026-08-29 19:22:39 | `docs: close Task 7 production acceptance` | 当前开发分支；远端同 SHA；含未提交 Task 8 改动 |
| `main` | `b9616cb92dc8` | 2026-08-26 20:01:04 | `docs: record motion preference gate precondition` | 本地 main；不是生产现状来源 |
| `codex/readable-hermes-guidance` | `c88c78003957` | 2026-08-19 09:47:15 | `docs: record Hermes blank RO release` | 历史可读工作区分支 |
| `codex/hermes-2d-pet` | `b9db36e6cf0f` | 2026-08-18 16:38:22 | `fix(web): restore living Hermes motion` | 历史 Hermes 2D 分支 |
| `codex/cache-versioned-assets` | `9adcb9498c92` | 2026-08-16 09:50:25 | `docs: record optical cache deployment` | 历史缓存版本化分支 |
| `codex/hermes-constellation-dragon-prototype` | `bae8facda303` | 2026-08-15 23:33:37 | `docs: record Hermes 3D prototype no-go` | 已拒绝原型证据 |
| `codex/hermes-3d-scholar` | `e0102ad35997` | 2026-08-15 20:00:33 | `feat(web): add Hermes 3D scholar agent` | 历史 3D 原型分支 |
| `codex/optical-native-prototype` | `0368e4510662` | 2026-08-12 19:22:08 | `docs: hand off native optical task 6` | 历史视觉原型分支 |
| `codex/researcher-ingestion` | `cbcb60cc7fde` | 2026-08-10 04:09:31 | `docs(ops): close OCR and restore evidence` | 历史 ingestion 分支 |
| `codex/product-web-task1` | `19a4e6931655` | 2026-08-09 14:19:10 | `fix(auth): reconcile signup routing and legacy accounts` | 历史产品 Web 分支 |

另有三个 detached worktree，分别停在 `b8e4697a83eb`（两个 worktree）和 `4fa5e05963a6`。它们没有分支引用，不应列为活动 branch，也不代表生产版本。

### 2.2 按时间整理的关键提交

下表不是全仓所有提交，而是从 `git log --all` 中抽取的上线、部署和 Research Intelligence 主线记录。完整记录仍以 Git object database 为准。

| 时间（+08:00） | Commit | 记录 |
|---|---|---|
| 2026-07-31 19:16 | `418e4c91e46d` | 云上集成测试修复，ECS 基础能力开始形成可验证记录 |
| 2026-07-31 20:06 | `91f3ba71dca0` | 云服务器章节与阶段 handoff 收口 |
| 2026-08-03 18:34 | `7b3d8d031b19` | Nginx 反代配置与安全基线 |
| 2026-08-03 19:26 | `5cba26136ed0` | 生产 Compose、部署/备份脚本与 CI 工作流 |
| 2026-08-07 10:13 | `d78fe18bd3a4` | Landing 首页部署 |
| 2026-08-12 16:14 | `869b09205a1f` | 公网入口切换到 Cloudflare Tunnel |
| 2026-08-26 21:30 | `72ec36ee0318` | Research Intelligence 核心模型 |
| 2026-08-27 01:40 | `db6c4f76d811` | DocumentSourceMap 任务收口 |
| 2026-08-27 23:08 | `8163f8b4218e` | BGE-M3 可部署模型身份锁定 |
| 2026-08-28 00:29 | `337d93467a0e` | 语义检索生产任务收口 |
| 2026-08-29 15:57 | `277507676a22` | 最终 Parser 生产部署记录 |
| 2026-08-29 17:08 | `7024fed67dd0` | 生产 release retention 收口 |
| 2026-08-29 19:22 | `2add41585357` | Task 7 生产验收文档收口 |

### 2.3 可复核命令

```text
git worktree list --porcelain
git branch --sort=-committerdate --format="%(refname:short)|%(objectname)|%(committerdate:iso-strict)|%(subject)"
git log --all --date=iso-strict --pretty=format:"%H|%ad|%D|%s"
```

若需要提交给外部机构的图片，可从本节 Markdown 表格导出 PDF 或截图；当前先保留文本记录，因为文本可搜索、可比对 SHA，也比终端截图更容易复核。

## 3. 网站部署、域名与版本记录

### 3.1 上线时间口径

| 日期 | 事件 | 证据 | 可以证明什么 |
|---|---|---|---|
| 2026-07-31 | 阿里云 ECS 基础服务上线 | `AGENTS.md` 云服务器章节；commits `418e4c9`、`91f3ba7` | 服务器与云上集成环境已经运行 |
| 2026-08-03 | `OpenScience.428312321.xyz` 的 Nginx/API 反代部署；证书签发 | `AGENTS.md`；`docs/runbooks/deployment.md` §2.5；commit `7b3d8d0`；证书 `notBefore` | 域名 HTTPS/反代具备上线条件；证书起始时间为 2026-08-03 20:10:34 +08:00 |
| 2026-08-07 | Landing 网站部署 | commit `d78fe18` | 用户可见 Landing 已部署，不等同于 ECS 初次上线 |
| 2026-08-12 | 公网入口切换为 ECS 常驻 Cloudflare Tunnel | commit `869b092`；`docs/runbooks/cloudflare-tunnel.md` | 当前公网入站拓扑上线，并经移动网络实机验证 |
| 2026-08-29 | 当前 Research Intelligence release 上线 | ECS `.release-id` mtime；public/loopback `/__release` | 当前运行版本已切到 `5e5ae36…` |

证书只能证明 HTTPS 证书自该时刻有效，不能单独证明第一位访客访问时间。`cloudflared` 当前进程的 `ActiveEnterTimestamp=2026-08-27 23:03:54 +08:00` 是最近一次服务进入 active 的时间，也不是 Tunnel 第一次上线时间。

### 3.2 当前服务器状态（2026-08-29 只读核验）

| 项目 | 核验结果 |
|---|---|
| 公网域名 | `https://openscience.428312321.xyz` |
| Production application / release | `5e5ae36a08ae314d0c35ee2b976e306aec73d219` |
| Rollback | `6cabe422a8459dfa358786c9f5aae84558949f6b` |
| Release marker 写入时间 | 2026-08-29 19:03:27 +08:00 |
| Public `/__release` | `5e5ae36a08ae314d0c35ee2b976e306aec73d219` |
| Loopback `/__release` | `5e5ae36a08ae314d0c35ee2b976e306aec73d219` |
| TLS subject | `CN=openscience.428312321.xyz` |
| TLS issuer | Let's Encrypt `YE1` |
| TLS validity | 2026-08-03 20:10:34 至 2026-11-01 20:10:33（+08:00） |
| Production containers | Web/API/Agent Worker/Document Parser/Embedding Worker 与数据服务均运行；API、Worker、Parser、Embedding、PostgreSQL、Redis、对象存储、恶意文件扫描均 healthy |
| Core / search migrations | `30/30` / `2/2` |

### 3.3 最近生产版本链

| 日期 | Application / release | Rollback | 主要能力 |
|---|---|---|---|
| 2026-08-26 | `e0828a6118c9` | `29344767b350` | Research Intelligence core/search foundation |
| 2026-08-27 | `ef043ebb8e51` | `e0828a6118c9` | DocumentSourceMap contract |
| 2026-08-27 | `f9659668b237` | `ef043ebb8e51` | AI Gateway LLM OCR routing，Vision 默认关闭 |
| 2026-08-28 | `8163f8b4218e` | `f9659668b237` | BGE-M3 CPU 混合检索与双数据库备份边界 |
| 2026-08-28 | `e2c0eaf3b13a` | `8163f8b4218e` | 仓库卫生与真实 DOCX canary |
| 2026-08-29 | `c5817121bddb` | `e2c0eaf3b13a` | CPU parser cascade |
| 2026-08-29 | `6cabe422a845` | `28a3d5c…` | Parser 14/2 最终验收 |
| 2026-08-29 | `5e5ae36a08ae` | `6cabe422a845` | 身份/兴趣静默路由与真实 MiniMax 旅程；当前生产 |

更早的逐次部署与回滚证据见 `docs/runbooks/deployment.md` §5.1–§5.42。历史 release 目录已按批准的 retention 规则清理，但 Git SHA、runbook 与 CI 记录仍保留。

## 4. suggested / confirmed 数据库与 API 证据

### 4.1 字段与状态的准确映射

| 产品语义 | 数据库存储 | 代码入口 |
|---|---|---|
| Hermes 生成“建议” | `agent_tasks.result JSONB` 保存 `core`、`evidence`、`needsMoreInformation`；关联 `ingestion_tasks.state = needs_review` | `apps/agent-worker/src/extractor.ts`；`packages/domain/src/ingestion/ingestion-service.ts` |
| 用户读取建议 | `GET /ingestion/tasks/:taskId` 返回 task result；内部 `sourceMapRef` 不对客户端公开，只返回 `sourceMapAvailable` | `apps/api/src/routes/ingestion.ts` |
| 用户确认 | `POST /ingestion/:taskId/confirm` 接收当前 `version` 与人工审阅后的 `core` | `apps/api/src/routes/ingestion.ts` |
| 确认后状态 | 先写入新的 SDF version，再以 compare-and-set 将 `needs_review` 更新为 `confirmed` | `packages/domain/src/ingestion/ingestion-service.ts` |

因此，对外材料可写“系统支持 suggested / confirmed 两阶段工作流”，但数据库字段应准确写成：建议内容位于 `agent_tasks.result`，建议状态为 `needs_review`，确认状态为 `confirmed`。不能声称数据库存在一个实际名为 `suggested` 的枚举值。

### 4.2 生产数据库只读证明

本次 ECS 查询得到的字段类型：

```text
agent_tasks.result                  jsonb
ingestion_tasks.state              IngestionTaskState
claim_nodes.extraction_status      ExtractionStatus
evidence_records.extraction_status ExtractionStatus
evidence_records.verified_by_user_id uuid
```

生产 `IngestionTaskState` 枚举为：

```text
queued, uploading, stored, parsing, needs_review, confirmed,
written, failed_retryable, failed_blocked
```

2026-08-29 状态聚合结果：

```text
state=needs_review | suggestion result 非空=14
state=confirmed    | count=7
关联 ingestion tasks 总数=21
```

这组数据证明生产环境已经产生待确认建议，也已经保存确认结果。聚合查询没有读取或输出建议正文、用户标识、研究对象标题或密钥。

### 4.3 API 完整展示样例

以下 JSON 依据当前 API/Domain 合同构造，字段与内容均完整展示。内容是一组自编的超快光谱演示数据，不对应生产用户或真实数据库记录。

建议读取：

```json
{
  "task": {
    "id": "00000000-0000-4000-8000-000000000001",
    "artifactId": "00000000-0000-4000-8000-000000000002",
    "logicalPath": "ultrafast-carrier-relaxation-demo.pdf",
    "state": "needs_review",
    "retryCount": 0,
    "error": null,
    "agentTaskId": "00000000-0000-4000-8000-000000000003",
    "result": {
      "core": {
        "schemaVersion": "0.1.0",
        "problem": "现有超快光谱研究尚未解释钙钛矿薄膜中亚皮秒载流子冷却通道的微观来源。",
        "insight": "不同泵浦通量下均出现约 0.42 ps 的早期衰减组分，说明该快速弛豫通道具有稳定的时间尺度。",
        "method": "使用 400 nm、35 fs 泵浦脉冲激发薄膜，并在 450–780 nm 范围记录差分透射信号，再进行全局动力学拟合。",
        "results": "全局拟合得到 0.42 ± 0.05 ps 和 6.8 ± 0.7 ps 两个主要时间常数。",
        "limitations": "实验仅覆盖同一制备批次的三块薄膜，并且全部在室温下测量，尚不能外推到其他批次或温区。",
        "reproducibility": "Research Object 同时提供原始延迟波长矩阵、拟合 notebook 和环境锁定文件。"
      },
      "evidence": {
        "problem": {
          "quote": "The microscopic origin of the sub-picosecond carrier cooling pathway remains unresolved.",
          "locator": "chars:120-208"
        },
        "insight": {
          "quote": "Across all fluences, the early-time decay is reproduced by a 0.42 ± 0.05 ps component.",
          "locator": "chars:842-928"
        },
        "method": {
          "quote": "We excited the films at 400 nm and recorded differential transmission from 450 to 780 nm with a 35 fs instrument response.",
          "locator": "chars:1240-1362"
        },
        "results": {
          "quote": "The global fit yielded time constants of 0.42 ± 0.05 ps and 6.8 ± 0.7 ps.",
          "locator": "chars:2381-2454"
        },
        "limitations": {
          "quote": "Measurements were performed on three films from a single fabrication batch at room temperature.",
          "locator": "chars:3110-3205"
        },
        "reproducibility": {
          "quote": "Raw delay-wavelength matrices, fitting notebooks, and environment lock files are deposited with this research object.",
          "locator": "chars:3660-3777"
        }
      },
      "needsMoreInformation": [],
      "sourceMapAvailable": true
    }
  },
  "batchId": "00000000-0000-4000-8000-000000000004",
  "researchObjectId": "00000000-0000-4000-8000-000000000005",
  "version": 1
}
```

确认请求：

```json
{
  "version": 1,
  "core": {
    "schemaVersion": "0.1.0",
    "problem": "现有超快光谱研究尚未解释钙钛矿薄膜中亚皮秒载流子冷却通道的微观来源。",
    "insight": "不同泵浦通量下均出现约 0.42 ps 的早期衰减组分，说明该快速弛豫通道具有稳定的时间尺度，但尚不能单凭时间常数确定具体机制。",
    "method": "使用 400 nm、35 fs 泵浦脉冲激发薄膜，并在 450–780 nm 范围记录差分透射信号，再进行全局动力学拟合。",
    "results": "全局拟合得到 0.42 ± 0.05 ps 和 6.8 ± 0.7 ps 两个主要时间常数。",
    "limitations": "实验仅覆盖同一制备批次的三块薄膜，并且全部在室温下测量，尚不能外推到其他批次或温区。",
    "reproducibility": "Research Object 同时提供原始延迟波长矩阵、拟合 notebook 和环境锁定文件。"
  }
}
```

确认响应：

```json
{
  "task": {
    "id": "00000000-0000-4000-8000-000000000001",
    "artifactId": "00000000-0000-4000-8000-000000000002",
    "logicalPath": "ultrafast-carrier-relaxation-demo.pdf",
    "state": "confirmed",
    "retryCount": 0,
    "error": null,
    "agentTaskId": "00000000-0000-4000-8000-000000000003"
  },
  "sdf": {
    "core": {
      "schemaVersion": "0.1.0",
      "problem": "现有超快光谱研究尚未解释钙钛矿薄膜中亚皮秒载流子冷却通道的微观来源。",
      "insight": "不同泵浦通量下均出现约 0.42 ps 的早期衰减组分，说明该快速弛豫通道具有稳定的时间尺度，但尚不能单凭时间常数确定具体机制。",
      "method": "使用 400 nm、35 fs 泵浦脉冲激发薄膜，并在 450–780 nm 范围记录差分透射信号，再进行全局动力学拟合。",
      "results": "全局拟合得到 0.42 ± 0.05 ps 和 6.8 ± 0.7 ps 两个主要时间常数。",
      "limitations": "实验仅覆盖同一制备批次的三块薄膜，并且全部在室温下测量，尚不能外推到其他批次或温区。",
      "reproducibility": "Research Object 同时提供原始延迟波长矩阵、拟合 notebook 和环境锁定文件。"
    },
    "nodes": [
      { "nodeType": "problem", "content": "现有超快光谱研究尚未解释钙钛矿薄膜中亚皮秒载流子冷却通道的微观来源。" },
      { "nodeType": "insight", "content": "不同泵浦通量下均出现约 0.42 ps 的早期衰减组分，说明该快速弛豫通道具有稳定的时间尺度，但尚不能单凭时间常数确定具体机制。" },
      { "nodeType": "method", "content": "使用 400 nm、35 fs 泵浦脉冲激发薄膜，并在 450–780 nm 范围记录差分透射信号，再进行全局动力学拟合。" },
      { "nodeType": "results", "content": "全局拟合得到 0.42 ± 0.05 ps 和 6.8 ± 0.7 ps 两个主要时间常数。" },
      { "nodeType": "limitations", "content": "实验仅覆盖同一制备批次的三块薄膜，并且全部在室温下测量，尚不能外推到其他批次或温区。" },
      { "nodeType": "reproducibility", "content": "Research Object 同时提供原始延迟波长矩阵、拟合 notebook 和环境锁定文件。" }
    ]
  }
}
```

### 4.4 与 Task 8 Claim/Evidence API 的边界

`claim_nodes`、`evidence_records`、`ExtractionStatus` 已随 Research Intelligence 核心模型进入生产 schema；其中 `extraction_status` 表示机器提取是否成功/待复核/阻断/失败，`verified_by_user_id` 可标识 Evidence 的人工复验者。

新的 Claim/Evidence CRUD、locator 复验与发布阻断属于 Taskmaster Task 8。目前仅在当前 worktree 开发，尚未提交、CI、部署或生产验收。因此，本节的 suggested / confirmed 生产证明来自已经上线的 ingestion/SDF 确认链，不用未部署的 Task 8 代码充当生产证据。

## 5. 证据来源与限制

- Git：本地已 fetch 的 object database、branch/worktree refs 与 commit metadata。
- 部署历史：`docs/runbooks/deployment.md`、`docs/runbooks/cloudflare-tunnel.md`、`AGENTS.md`。
- ECS 当前事实：只读 `.release-id` / `.rollback-id`、public/loopback `/__release`、systemd、TLS certificate、container health 与 PostgreSQL schema/aggregate query。
- 数据库 schema：`infra/schema.prisma` 与 `infra/migrations/`。
- API/状态迁移：`apps/api/src/routes/ingestion.ts`、`packages/domain/src/ingestion/ingestion-service.ts`、`apps/agent-worker/src/extractor.ts`。
- 限制：没有把域名 WHOIS 注册日、证书签发日或当前进程启动日冒充产品上线日；没有把结构样例冒充真实用户响应；没有把本地 Task 8 冒充生产能力。
