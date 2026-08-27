# Runbook: 备份与恢复（Backup & Restore）

> 状态：CURRENT（双库原子备份集合）。备份文件与真实用户数据不得进入本地 Agent 上下文。
> 所有命令仅在 ECS 上通过项目 `ssh-run.sh` 执行；恢复演练使用隔离临时库，不触碰生产库。

## 1. 前置检查

- 读取 `/opt/openscience/.release-id`，核对对应不可变 release 目录与 `.release-source` 一致。
- 检查生产 Compose 服务健康、`/var/backups` 空间和 cron：`0 3 * * * /usr/local/bin/backup.sh --confirm --db`。
- `/var/backups/openscience` 必须为 `0700`；备份文件为 `0600`。脚本设置 `umask 077` 并用 `flock` 拒绝并发运行。
- 不读取、回显或复制 `.env.prod`；数据库身份由 API 容器解析并仅返回已校验的用户名和库名。

## 2. 执行步骤

```bash
# 每日双库备份；脚本自行绑定 active release。
/usr/local/bin/backup.sh --confirm --db

# 可选对象存储快照。
/usr/local/bin/backup.sh --confirm --objects
```

每次数据库备份先写入私有 staging 目录，两个 `pg_dump`、非空校验、SHA-256 和 manifest 全部成功后，才以同文件系统目录 rename 原子发布：

```text
/var/backups/openscience/db-set-<UTC>-<PID>/
├── core.sql
├── core.sql.sha256
├── search.sql
├── search.sql.sha256
└── manifest
```

- `core.sql` 与 `search.sql` 分别对应核心库和搜索库；两库身份必须物理隔离。
- `manifest` 记录 schema、时间、精确 release、保留轮数和两个固定文件名，不含 URL、密码或业务内容。
- `KEEP_BACKUPS=7` 默认保留 7 个完整目录；只有 `--confirm` 才会轮转完整旧集合。失败 staging 由受限路径 trap 清理，不会发布半套备份。
- 成功输出只含两个大小与集合计数：`BACKUP_OK core_size=... search_size=... sets=N/7`。

## 3. 回滚步骤

- 备份阶段只读生产数据库；失败时生产无需回滚，且旧的已发布集合不变。
- 恢复演练只写两个显式命名的临时库。演练失败时保留临时库和日志供排障，未经批准不删除。
- 生产恢复属于单独高风险操作：先冻结 API/worker 写入，校验集合与 release，按“核心库 → 搜索库”顺序恢复并验证迁移状态，再恢复服务。不得直接拿演练命令覆盖生产库。

## 4. 验证与双库恢复演练

```bash
SET=/var/backups/openscience/db-set-<UTC>-<PID>
test -d "$SET" && test -s "$SET/manifest" \
  && test -s "$SET/core.sql" && test -s "$SET/search.sql"
cd "$SET"
sha256sum -c core.sql.sha256
sha256sum -c search.sql.sha256
test "$(stat -c '%a' "$SET")" = 700
test "$(stat -c '%a' core.sql)" = 600

# 从 manifest 读取 release 后，核对不可变源码身份；不得输出 dump 内容。
set_release="$(sed -n 's/^release=//p' manifest)"
test "$set_release" = "$(cat /opt/openscience/.release-id)"
test "$(cat "/opt/openscience-releases/$set_release/.release-source")" = "$set_release"

# 在现有 PostgreSQL 容器中建立两个唯一、隔离的临时库（名称示例需替换）。
CORE_RESTORE=openscience_core_restore_<SHA>
SEARCH_RESTORE=openscience_search_restore_<SHA>
release_root="/opt/openscience-releases/$set_release"
export XGS_RELEASE_ROOT="$release_root" XGS_RELEASE_IMAGE_TAG="$set_release"
COMPOSE=(docker compose --env-file /opt/openscience/.env.prod \
  -f "$release_root/infra/compose/docker-compose.prod.yml")
"${COMPOSE[@]}" exec -T postgres createdb -U openscience "$CORE_RESTORE"
"${COMPOSE[@]}" exec -T postgres createdb -U openscience "$SEARCH_RESTORE"
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U openscience -d "$CORE_RESTORE" < core.sql
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U openscience -d "$SEARCH_RESTORE" < search.sql

# 验收：核心库与搜索库分别核对迁移账本和 schema；禁止只验一个库。
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U openscience -d "$CORE_RESTORE" \
  -tAc 'SELECT count(*) FROM schema_migrations;'
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U openscience -d "$SEARCH_RESTORE" \
  -tAc 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
```

还需比对生产与临时库的关键表计数或 schema 指纹，但只记录计数/哈希，不读取行内容。演练完成后保留临时库，直到阶段验收明确批准清理。

## 5. 演练日志

| 日期 | 集合 / release | 核心库 | 搜索库 | 结果 |
|---|---|---|---|---|
| 2026-08-27 | 旧格式 `20260827T123813Z` / `f9659668…` | dump 校验并恢复 | dump 校验并恢复；迁移 1/1 | 通过；临时库保留 |
