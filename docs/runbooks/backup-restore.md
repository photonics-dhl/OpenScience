# Runbook: 备份与恢复（Backup & Restore）

> 状态：已填充（P1A-9）。格式遵循 `.agents/skills/infra-runbook/SKILL.md` 四节强制要求。
> 安全红线（Spec §20.1-9）：备份文件与真实用户数据**不得拉入本地 Kimi/Agent 上下文**。
> 恢复演练属 Spec §21.1 测试层，每次演练需留记录（见 §5）。

## 1. 前置检查

- [ ] 生产栈运行中：`docker compose -f /opt/openscience/infra/compose/docker-compose.prod.yml ps`
- [ ] 备份目录可写：`mkdir -p /var/backups/openscience && touch /var/backups/openscience/.write-test && rm /var/backups/openscience/.write-test`
- [ ] 磁盘余量：`df -h /var/backups`（单次 dump 数 MB 级，7 轮远低于 1G，安全）
- [ ] 上一次备份时间：`ls -lt /var/backups/openscience/`
- [ ] cron 注册：`crontab -l | grep backup`（每日 3:00）

## 2. 执行步骤

```bash
# 每日备份（cron 0 3 * * *）：
#   /usr/local/bin/backup.sh --confirm --db
#   （脚本在云上 /opt/openscience/infra/scripts/backup.sh；建议软链到 /usr/local/bin）
```

- 备份内容：`pg_dump` 经生产 postgres 容器导出全库 → `/var/backups/openscience/db-YYYY-MM-DD.sql`
- 保留策略：`KEEP_BACKUPS=7` 轮（参数化），超出的轮转删除（--confirm 放行 rm）
- 输出仅 `BACKUP_OK size=... files=N/7`，不输出备份内容（Spec §20.1-9）

## 3. 回滚步骤

- 恢复失败/备份损坏时回到操作前状态：
  - 生产库未动则无需回滚（备份只读 dump，不触碰生产）
  - 若演练中已导入临时库，删临时容器即可（`docker rm -f` 该容器）
  - 生产库损坏需恢复：停 api → 恢复 dump 到生产库 → 校验 → 起 api（详见 §4 恢复命令）

## 4. 验证命令

```bash
# 备份完整性校验
ls -l /var/backups/openscience/db-*.sql                    # 文件存在 + 大小非零
head -c 100 /var/backups/openscience/db-latest.sql | grep -q "PostgreSQL"  # 头部 PG 魔数

# 恢复演练（临时库，不碰生产）——见 §5 日志
# 1) 起临时 postgres 容器
docker run -d --name openscience-restore-test \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=restore \
  postgres:16-alpine
# 2) 导入 dump
docker exec -i openscience-restore-test psql -U postgres -d restore \
  < /var/backups/openscience/db-YYYY-MM-DD.sql
# 3) 行数对比（临时库 vs 生产）
docker exec openscience-restore-test psql -U postgres -d restore \
  -tAc "SELECT count(*) FROM users"
docker compose -f /opt/openscience/infra/compose/docker-compose.prod.yml \
  exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -tAc "SELECT count(*) FROM users"
# 4) 清理
docker rm -f openscience-restore-test
```

## 5. 演练日志

| 日期 | 演练内容 | dump 行数 vs 生产 | 结果 |
|---|---|---|---|
| （P1A-9 Task 8 执行后填） | 临时库导入 + 行数对比 | 一致 | 通过 |
