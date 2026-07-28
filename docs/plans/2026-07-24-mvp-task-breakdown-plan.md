# MVP 任务拆解与工具配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 Baseline v1.0 重新生成 Phase 0–1E 详细执行任务库（task-master tasks.json + docs/plans 人读计划），并落地配套工具（8 个项目级 skills + 阿里云服务器脚本/runbook 框架）。

**Architecture:** 主 agent 先做机械性落地（skills、脚本框架），再 AgentSwarm 并行起草 6 个 Phase 的任务 fragment（JSON），合并为 tasks.json 后由 2 个只读审查 agent 并行审查、迭代修订（≤3 轮），最终双通道验证并渲染人读计划。

**Tech Stack:** task-master（tasks.json schema）、bash/python 一次性脚本、Markdown skills、Git Bash 环境。

## Global Constraints

- 唯一需求依据：`docs/OpenScience_Kimi_Development_Spec.md`（Baseline v1.0）；设计依据：`docs/specs/2026-07-24-mvp-task-breakdown-design.md`（已批准）。
- 禁止读取/打印 `.env` 内容；脚本运行时从 `.env` 读取凭据属正常，键名可查、值不可打印。
- 不删除任何文件（用户已批准的除外）；覆盖 `.taskmaster/tasks/tasks.json` 前必须确认其已被 git 跟踪或可恢复。
- 文档一律中文；代码注释/提交信息英文；新文件创建后必须登记 `project_index.md`。
- Phase 2 功能（Spec §19）不得进入任务库。
- Spec §24 待确认项不允许猜测写死，只能记录为待确认。

## Fragment 契约（T3 输出 / T4 输入）

每个起草 agent 输出一个 JSON 文件 `.taskmaster/drafts/phase-<P>.json`，格式：

```json
{
  "phase": "0",
  "topTask": {
    "localId": "P0",
    "title": "Phase 0: 现有系统审计",
    "description": "...（引用 Spec §22/§25）",
    "priority": "high",
    "subtasks": [
      {
        "localId": "P0-1",
        "title": "动宾结构标题，≤60字",
        "description": "做什么、为什么，含 Spec 章节引用",
        "details": "实现要点、模块/文件、MUST/SHOULD 映射；末尾一行写 `验收: 步骤N` 或 `验收: -`",
        "testStrategy": "最小测试 + 阶段验收点（对应 Spec §21 测试层）",
        "dependencies": ["P0-0-localId"],
        "priority": "high"
      }
    ]
  }
}
```

规则：`localId` 仅在本文件内唯一；`dependencies` 只能引用本文件内的 localId 或先前 Phase 的顶层 localId（如 `"P0"`）；跨 Phase 依赖只允许指向先前 Phase 的顶层任务；每个 Phase 6–10 个 subtasks。

---

### Task 1: 创建 8 个项目级 Skills

**Files:**
- Create: `.agents/skills/repo-map/SKILL.md`
- Create: `.agents/skills/architecture-guard/SKILL.md`
- Create: `.agents/skills/api-contract/SKILL.md`
- Create: `.agents/skills/database-migration/SKILL.md`
- Create: `.agents/skills/frontend-design/SKILL.md`
- Create: `.agents/skills/infra-runbook/SKILL.md`
- Create: `.agents/skills/security-review/SKILL.md`
- Create: `.agents/skills/test-gate/SKILL.md`

**Interfaces:**
- Consumes: 设计文档 §4.1 的 8 行职责表
- Produces: 每个 SKILL.md 遵循统一模板（见 Step 1），正文中文、带 frontmatter

- [ ] **Step 1: 统一模板**

每个 SKILL.md 结构：

```markdown
---
name: <skill-name>
description: <一句话触发说明，含何时使用、何时不使用>
---

# <标题>

## 何时使用 / 何时不使用
## 检查清单（或流程）
<该 skill 的规则条目，每条可机械核对，标注 Spec 章节来源>
```

- [ ] **Step 2: 逐 skill 写入核心规则**（内容来源，执行时展开为完整文件）

- `repo-map`：只读扫描产出目录/依赖/服务/数据地图；文件查找顺序 = project_index → Glob 文件名 → Grep 内容；禁大范围递归读取（Spec §20.2/§25）
- `architecture-guard`：改代码前核对 Monorepo 边界（§14.1）；Provider SDK 不得散落业务代码、必须经 AI Gateway（§9.3）；不为匹配目录示例搬动稳定代码（§14.1 末段）
- `api-contract`：模块化 REST/JSON、长任务任务 ID + SSE/WebSocket（§16）；幂等键与乐观锁；前后端 Schema 合同测试（§21.1）
- `database-migration`：迁移向前可部署、可回滚或有补偿步骤；生产禁自动破坏性迁移（§15）；数据库只存元数据不存大二进制（§13.1）
- `frontend-design`：三套视觉系统（工作台现代/公开页学术/协作区 GitHub 式，§18.2）；桌面移动功能一致、三栏改分步抽屉（§2.5/§18.2）；WCAG AA、键盘导航、语义化 HTML（§18.3）；i18n 从首版（§2.5）
- `infra-runbook`：单 ECS 拓扑与网络分段（§14.2）；每日备份+定期恢复演练（§17）；部署走脚本+确认；runbook 必须含前置检查/执行步骤/回滚步骤/验证命令
- `security-review`：密钥只来自服务器环境变量（§17）；越权检查在 API 层（§3.3）；上传扫描与限流（§17）；沙箱威胁模型单独维护（§17）、沙箱限制逐条核对（§10.3）；日志不落敏感信息（§17）
- `test-gate`：改后先跑最小相关测试再跑阶段验收（§20.1-6）；禁止隐藏失败测试或声称未验证功能完成（§20.1-7）；验收证据对应 §21 测试层

- [ ] **Step 3: 验证**

Run: `ls .agents/skills/*/SKILL.md | wc -l` → 预期 ≥ 12（原有 12 个 + 新增 8 个 = 20；若原有数量不同，验证 8 个新文件各自存在且首行 frontmatter 为 `---`）
Run: `head -3 .agents/skills/repo-map/SKILL.md` → 预期输出 frontmatter 头

- [ ] **Step 4: 登记 project_index.md（新增 8 行）**

---

### Task 2: infra 脚本 + runbook 框架

**Files:**
- Create: `infra/README.md`
- Create: `infra/scripts/ssh-run.sh`
- Create: `infra/scripts/checkup.sh`
- Create: `infra/scripts/backup.sh`
- Create: `infra/scripts/deploy.sh`
- Create: `docs/runbooks/deployment.md`
- Create: `docs/runbooks/backup-restore.md`
- Create: `docs/runbooks/incident.md`

**Interfaces:**
- Consumes: `.env` 中服务器键名（执行时 `grep -oE '^[^=]+' .env | grep -iE 'server|host|ip|ssh'` 确认，只用键名）
- Produces: `ssh-run.sh "<remote command>"` 供其他脚本和人工调用

- [ ] **Step 1: 探测 .env 服务器键名（只看键名）**

Run: `grep -oE '^[A-Za-z_一-鿿]+=' .env | grep -iE 'ip|host|ssh|server|用户|端口|主机' | tr -d '='`
预期：拿到 host/user/port 的实际键名（可能是中文键）。脚本中以此为准。

- [ ] **Step 2: 写 ssh-run.sh**

要点：从 .env 按 Step 1 确认的键名提取 host/user/port；`ssh -o BatchMode=yes -o ConnectTimeout=10`；无密钥登录时明确报错"请配置 SSH 密钥，本脚本不处理密码"；绝不 echo 任何凭据；支持 `--confirm` 才允许执行非只读命令（黑名单：`rm|mv|dd|mkfs|shutdown|reboot|systemctl (stop|disable)` 需 --confirm）。

- [ ] **Step 3: 写 checkup.sh（只读巡检）**

远程执行并汇总：`df -h`、`free -h`、`uptime`、`docker ps --format table`、`systemctl is-active nginx docker postgresql redis`（不存在的服务报 N/A 不报错）、`openssl x509 -enddate -noout` 证书检查（若存在 /etc/letsencrypt）。

- [ ] **Step 4: 写 backup.sh / deploy.sh 骨架**

骨架内容：用法注释 + `echo "NOT IMPLEMENTED: 将在 Phase 1A 填充（见 tasks P1A-*）" >&2; exit 64`。含明确的安全约束注释（备份不得拉入本地 Kimi 上下文，Spec §20.1-9）。

- [ ] **Step 5: 写 infra/README.md + 3 个 runbook 骨架**

README：用途、迁移路径（产品 Monorepo 建成后迁至其 infra/）、安全约束。runbook 骨架统一四节：前置检查 / 执行步骤 / 回滚步骤 / 验证命令（内容标"Phase 1A 填充"）。

- [ ] **Step 6: 验证**

Run: `bash -n infra/scripts/*.sh && echo SYNTAX_OK`
Run: `bash infra/scripts/backup.sh; echo "exit=$?"` → 预期输出 NOT IMPLEMENTED 且 exit=64
Run: `bash infra/scripts/checkup.sh` → 若 SSH 密钥已配通则输出巡检报告（实测记录结果）；未配通则报"请配置 SSH 密钥"——两种结果都接受，记录实际结果到 progress.md

- [ ] **Step 7: 登记 project_index.md（新增 infra/ 与 docs/runbooks/ 条目）**

---

### Task 3: AgentSwarm 并行起草 6 个 Phase 任务 fragment

**Files:**
- Create: `.taskmaster/drafts/phase-0.json` … `.taskmaster/drafts/phase-1E.json`

**Interfaces:**
- Consumes: Spec 原文、设计文档 §2.3 Phase 大纲、Fragment 契约（本计划头部）
- Produces: 6 个符合 Fragment 契约的 JSON 文件

- [ ] **Step 1: AgentSwarm 发起 6 个 coder 子 agent**

prompt_template（`{{item}}` 为 Phase 标识：0 / 1A / 1B / 1C / 1D / 1E）：

```text
你是 OpenScience (XGS) 项目的任务起草 agent，负责 Phase {{item}} 的详细任务起草。

必读（按序）：
1. E:/Miscellaneous/XGS/docs/OpenScience_Kimi_Development_Spec.md —— 需求基线，重点读与你 Phase 相关的章节
2. E:/Miscellaneous/XGS/docs/specs/2026-07-24-mvp-task-breakdown-design.md §2.2/§2.3 —— 任务字段要求与你的 Phase 边界
3. 本 prompt 附带的 Fragment 契约 —— 输出格式

Phase {{item}} 边界（见设计文档 §2.3 对应小节，不得越界起草其他 Phase 的任务）。

要求：
- 6–10 个 subtasks，每个粒度 1–3 天工作量，title 动宾结构 ≤60 字
- description 必须引用 Spec 章节号（如 Spec §7.2）
- details 末尾必须一行 `验收: 步骤N`（Spec §21.2 的 1–16 步）或 `验收: -`
- 每条 MUST（Spec §2/§17 与你 Phase 相关者）必须有对应 subtask 或在 details 显式映射
- 禁止 Phase 2 功能（Spec §19）；Spec §24 待确认项只能记录为待确认，禁止猜测写死
- dependencies 只允许引用本文件 localId 或先前 Phase 顶层 localId
- 输出：写入 E:/Miscellaneous/XGS/.taskmaster/drafts/phase-{{item}}.json，严格符合 Fragment 契约，不写其他文件
- 完成后返回：subtask 数量、覆盖的 Spec 章节清单、验收步骤映射清单、你标记的待确认项
```

- [ ] **Step 2: 逐个验证 fragment 可解析**

Run:

```bash
python - <<'EOF'
import json, glob
for f in sorted(glob.glob('.taskmaster/drafts/phase-*.json')):
    d = json.load(open(f, encoding='utf-8'))
    subs = d['topTask']['subtasks']
    ids = [s['localId'] for s in subs]
    assert len(ids) == len(set(ids)), f"{f}: duplicate localId"
    for s in subs:
        for dep in s.get('dependencies', []):
            assert dep in ids or dep in ('P0','P1A','P1B','P1C','P1D','P1E'), f"{f}: dangling dep {dep}"
        assert '验收:' in s['details'], f"{f}: {s['localId']} missing acceptance ref"
    print(f, len(subs), 'subtasks OK')
EOF
```

预期：6 行 OK。失败则修复对应 fragment（resume 该起草 agent）。

---

### Task 4: 合并构建 tasks.json

**Files:**
- Create: `.taskmaster/drafts/build_tasks.py`
- Modify: `.taskmaster/tasks/tasks.json`（覆盖）

**Interfaces:**
- Consumes: 6 个 phase fragment；现有 tasks.json 的 schema 样板
- Produces: 合法 tasks.json（master tag，顶层任务 id 1–6，subtasks 以 `父id.序号` 编号）

- [ ] **Step 1: 确认旧 tasks.json 可恢复**

Run: `git ls-files .taskmaster/tasks/tasks.json`
已跟踪 → 继续；未跟踪 → `git add .taskmaster/tasks/tasks.json && git commit -m "chore: snapshot tasks.json before MVP rebuild"`（提交前向用户确认）

- [ ] **Step 2: 写 build_tasks.py**

逻辑：读 6 个 fragment → 顶层任务 id 按 Phase 顺序 1–6（Phase 0=1, 1A=2, 1B=3, 1C=4, 1D=5, 1E=6）→ subtask 编号 `<父id>.<序>` → localId 映射表（P0→"1", P0-1→"1.1"…）→ 重写 dependencies → 顶层任务 dependencies = 前一 Phase 顶层 id（Phase 0 无依赖）→ status 全部 `pending` → 保留现有 tasks.json 的 metadata 结构 → 写出。含自检：依赖无环（拓扑排序验证）、无悬空引用。

- [ ] **Step 3: 运行并验证**

Run: `python .taskmaster/drafts/build_tasks.py && python -c "import json; d=json.load(open('.taskmaster/tasks/tasks.json',encoding='utf-8')); print(len(d['master']['tasks']),'top tasks,', sum(len(t.get('subtasks',[])) for t in d['master']['tasks']),'subtasks')"`
预期：6 top tasks，36–60 subtasks，无断言失败

---

### Task 5: 双审查 agent 迭代（≤3 轮）

**Files:**
- Modify: `.taskmaster/drafts/phase-*.json`（修订轮）
- Modify: `.taskmaster/tasks/tasks.json`（随修订重建）

- [ ] **Step 1: 并行发起 2 个 explore（只读）审查 agent**

- 覆盖度审查 prompt 要点：读 Spec §2/§17/§19/§21/§22 + tasks.json；核对设计文档 §5.2 覆盖度 checklist 4 条；输出问题清单（每条：问题、涉及的 task id、Spec 依据、建议修法），无问题则明确说"全绿"
- 质量审查 prompt 要点：核对设计文档 §5.2 质量 checklist 5 条 + 依赖无环；同样格式输出

- [ ] **Step 2: 汇总审查意见，resume 对应起草 agent 修订 fragment，重跑 Task 4 Step 2–3 重建 tasks.json**

- [ ] **Step 3: 迭代终止条件**

两份审查报告均"全绿"，或已达 3 轮——达 3 轮仍有争议项时，主 agent 对照 Spec 原文仲裁并记录仲裁理由（写入 progress.md）

---

### Task 6: 渲染人读实施计划

**Files:**
- Create: `docs/plans/2026-07-24-mvp-implementation-plan.md`

- [ ] **Step 1: 从定稿 tasks.json 渲染**

内容：Phase 总览表、任务树、依赖图（mermaid graph TD）、验收 16 步 → 任务映射表（缺步骤的必须不存在——若有缺，返回 Task 5 处理）、Phase 2 占位清单（Spec §19 原文搬运，标"已记录、未立项"）、风险与门禁（Phase 0 审计门禁、§24 待确认清单）

- [ ] **Step 2: 登记 project_index.md**

---

### Task 7: 终验

- [ ] **Step 1: CLI 验证**

Run: `KEY=$(grep -E '^MINIMAX_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '\r"'"'"' '); OPENAI_COMPATIBLE_API_KEY="$KEY" npx -y --package=task-master-ai task-master list 2>&1 | tail -20`
预期：列出 6 个顶层任务及子任务，无解析错误

- [ ] **Step 2: MCP 验证**

调用 `mcp__task-master-ai__get_tasks`（projectRoot=E:/Miscellaneous/XGS）→ 返回 6 个顶层任务
调用 `mcp__task-master-ai__next_task` → 返回 Phase 0 首个子任务（无任何依赖的那个）

- [ ] **Step 3: 覆盖机器校验**

Run: python 脚本检查 tasks.json 中 `验收: 步骤1`…`验收: 步骤16` 全部至少出现一次；依赖图拓扑排序成功
预期：16/16 覆盖、无环

---

### Task 8: 收尾登记

- [ ] **Step 1: 更新 docs/progress.md（新条目置顶）**：完成项、迭代轮数、仲裁记录、checkup.sh 实测结果、遗留项
- [ ] **Step 2: project_index.md 最终核对**：本计划涉及的每个新文件均有条目
- [ ] **Step 3: Memory（实体 XGS项目环境配置 / 新建 XGS-MVP任务库）**：记录任务库结构、工具落地清单、待验证项（task-master MCP 字面值 key 重启后验证）
- [ ] **Step 4: 向用户汇报**：任务统计、审查迭代情况、待确认项清单、下一步建议（Phase 0 启动条件：定位现有代码仓）

## Self-Review 记录

- Spec 覆盖：设计文档 §5.2 覆盖度 checklist 已把 §2/§17/§19/§21/§22 设为审查项；§24 待确认项在 T3 prompt 与 T6 渲染中双重兜底
- 占位符扫描：T2 Step 4 的 "NOT IMPLEMENTED" 骨架是设计批准的刻意占位（设计 §4.3），其余步骤均含可执行内容
- 类型一致性：Fragment 契约的 localId/dependencies 命名在 T3/T4/T5 间一致；build_tasks.py 的编号规则（顶层 1–6、子任务 `父.序`）与 task-master 现有格式一致
