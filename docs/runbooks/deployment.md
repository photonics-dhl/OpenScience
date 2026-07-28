# Runbook: 部署（Deployment）

> 状态：骨架，内容 Phase 1A 填充。格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 部署属 Spec §20.5"询问"级操作：执行前需用户确认，必须走 `infra/scripts/deploy.sh` + CI/CD，禁止手工改服务器代码。

## 1. 前置检查

- [ ] Phase 1A 填充（备份确认、目标 release ref、CI 绿灯、巡检基线 `infra/scripts/checkup.sh`）

## 2. 执行步骤

- Phase 1A 填充（编号命令，逐条可复制；入口为 `infra/scripts/deploy.sh --confirm <release-ref>`）

## 3. 回滚步骤

- Phase 1A 填充（回到操作前状态的具体命令与判定标准）

## 4. 验证命令

- Phase 1A 填充（健康检查端点、`checkup.sh` 复跑、预期输出）
