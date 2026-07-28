# Runbook: 故障响应（Incident）

> 状态：骨架，内容 Phase 1A 填充。格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 排障默认只读：先跑 `infra/scripts/checkup.sh` 拿基线；任何写操作（重启/停服）属"询问"级，需用户确认并走 `ssh-run.sh --confirm`。

## 1. 前置检查

- [ ] Phase 1A 填充（故障现象记录、影响面初判、`checkup.sh` 巡检基线）

## 2. 执行步骤

- Phase 1A 填充（按症状分类的排查命令，逐条可复制；常见场景：服务 down、磁盘满、证书过期、数据库连接耗尽）

## 3. 回滚步骤

- Phase 1A 填充（处置动作如何撤销，恢复到故障处理前状态）

## 4. 验证命令

- Phase 1A 填充（恢复判定标准、`checkup.sh` 复跑、预期输出）
