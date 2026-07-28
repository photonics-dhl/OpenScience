---
name: infra-runbook
description: "Use when writing deployment/backup/restore runbooks, changing Docker/compose/network topology, or preparing a production operation. Do NOT use for local dev-only one-off commands."
---

# Infra Runbook — 基础设施与运维手册规范

单 ECS 阶段的拓扑、网络、备份与部署操作规范。每个 runbook 必须可照着机械执行。

## 何时使用 / 何时不使用

- **使用**：写或更新部署/备份/恢复/扩容 runbook；改 compose、Nginx、Docker Network；准备任何生产操作。
- **不使用**：本地开发一次性命令、与服务器无关的脚本。

## 检查清单

### 拓扑与网络（Spec §14.2）

1. **单 ECS 组件齐全**：Nginx/Caddy（TLS、静态、反代）、Web、API、Agent Worker、PostgreSQL、Redis、对象存储、Sandbox Controller、临时 Python Sandbox——变更拓扑时逐件核对影响面。
2. **网络分段**：`public_net`（代理→Web/API）、`app_net`（API、Agent Worker）、`data_net`（API/Worker→PostgreSQL/Redis）、`sandbox_control_net`（Controller 调度）；**运行中的 Python 沙箱容器不得加入 `data_net`，默认无外网**。
3. **暴露面**：数据库不得绑定公网地址；安全组只开放 80/443 和受限运维入口。

### 备份与恢复（Spec §17）

4. **每日备份**：数据库每日备份；备份脚本与备份位置写入 runbook。
5. **定期恢复演练**：恢复流程必须有演练记录；恢复测试属 §21.1 测试层（数据库恢复、对象存储校验、任务重试）。

### 部署纪律（Spec §20.5）

6. **部署走脚本**：部署通过仓库脚本（`infra/scripts/`）+ CI/CD 完成；不给 Agent 通用服务器写权限；部署属"询问"级操作，执行前需用户确认。

### Runbook 格式（强制）

7. 每个 runbook 必须包含四段，缺一不可：
   - **前置检查**（前置条件、依赖服务状态、备份确认）；
   - **执行步骤**（编号命令，逐条可复制）；
   - **回滚步骤**（失败时如何回到操作前状态）；
   - **验证命令**（操作完成后跑什么命令、预期输出是什么）。
8. Runbook 文件放 `docs/runbooks/`（Spec §14.1 目录规划；本项目实际入 `docs/` 下相应分类目录并登记 project_index.md）。
