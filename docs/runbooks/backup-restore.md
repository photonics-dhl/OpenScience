# Runbook: 备份与恢复（Backup & Restore）

> 状态：骨架，内容 Phase 1A 填充。格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 安全红线（Spec §20.1-9）：备份文件与真实用户数据**不得拉入本地 Kimi/Agent 上下文**。
> 恢复演练属 Spec §21.1 测试层，每次演练需留记录。

## 1. 前置检查

- [ ] Phase 1A 填充（磁盘余量、上一次备份时间、对象存储可达性）

## 2. 执行步骤

- Phase 1A 填充（入口为 `infra/scripts/backup.sh`；备份位置与保留策略写在此处）

## 3. 回滚步骤

- Phase 1A 填充（恢复失败/备份损坏时如何回到操作前状态）

## 4. 验证命令

- Phase 1A 填充（备份完整性校验、恢复演练验证、预期输出）
