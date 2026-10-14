# Runbook: 备份与恢复（Backup & Restore）

> 能力手册；候选、部署和真实验收见 [Hermes CURRENT](../handoff/2026-09-10-hermes-web-image-handoff.md)。备份文件与真实用户数据不得进入 Agent 上下文。
> 所有远端命令走项目 `ssh-run.sh`。下方旧同集群恢复步骤仅保留历史证据；新的演练必须用独立容器和独立数据目录。

## 1. 前置检查

- 读取 `/opt/openscience/.release-id`，核对对应不可变 release 目录与 `.release-source` 一致。
- 检查生产 Compose 服务健康、`/var/backups` 空间和 cron：`0 3 * * * /usr/local/bin/backup.sh --confirm --db`。
- `/var/backups/openscience` 必须为 `0700`；备份文件为 `0600`。脚本设置 `umask 077` 并用 `flock` 拒绝并发运行。
- 不读取、回显或复制 `.env.prod`；数据库身份由 API 容器解析并仅返回已校验的用户名和库名。
- 新候选完整模式为 `backup.sh --full`，正常沿 immutable release 选两个 helper；独立安装须一起保留 `backup-objects.mjs`、`backup-recovery-state.mjs`。现有生产 cron 仍只备 DB，未安装/调度新模式，不代表完整灾备已完成。

## 2. 执行步骤

```bash
# 每日双库备份；脚本自行绑定 active release。
/usr/local/bin/backup.sh --confirm --db

# 仅在新逻辑导出脚本已安装/发布并实测后，纳入每日备份。
# 首次验证不加 --confirm，保留全部旧备份。
/usr/local/bin/backup.sh --objects

# 日常对象备份；轮转须在恢复和异机副本验收后启用。
/usr/local/bin/backup.sh --confirm --objects

# 候选：DB + 对象 + 必需 host 恢复收据；先有维护授权与充足磁盘。
# 不接受 --confirm，完整隔离恢复及异机副本验收前不轮转这组材料。
/usr/local/bin/backup.sh --full
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

以下为历史同集群临时库演练命令，不作为本轮执行入口。新演练复用已安装 PostgreSQL 镜像，使用独立、无网络、无生产卷/凭据的容器；分别恢复双库并核验来源、迁移、约束和所需对象完整性。同机演练不等于物理故障隔离或完整测试站。

```bash
set -euo pipefail

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

# 在现有 PostgreSQL 容器中建立两个唯一、隔离的临时库；UTC ID 避免误复用旧演练库。
RESTORE_ID="$(date -u +%Y%m%d%H%M%S)"
CORE_RESTORE="openscience_core_restore_$RESTORE_ID"
SEARCH_RESTORE="openscience_search_restore_$RESTORE_ID"
[[ "$CORE_RESTORE" =~ ^openscience_core_restore_[a-z0-9]{8,40}$ ]]
[[ "$SEARCH_RESTORE" =~ ^openscience_search_restore_[a-z0-9]{8,40}$ ]]
test "$CORE_RESTORE" != "$SEARCH_RESTORE"
release_root="/opt/openscience-releases/$set_release"
export XGS_RELEASE_ROOT="$release_root" XGS_RELEASE_IMAGE_TAG="$set_release"
COMPOSE=(docker compose --env-file /opt/openscience/.env.prod \
  -f "$release_root/infra/compose/docker-compose.prod.yml")
# 若整个演练脚本本身经 stdin 送入远端 bash，所有不需要输入的
# `docker compose exec -T` 必须追加 `</dev/null`；否则 exec 会吞掉后续脚本。
# API 容器只输出两个已校验的生产库名；不输出 URL、用户或密码。
mapfile -t PROD_DATABASES < <("${COMPOSE[@]}" exec -T api node - <<'NODE'
for (const key of ['DATABASE_URL', 'SEARCH_DATABASE_URL']) {
  const raw = process.env[key];
  if (!raw) throw new Error(`missing:${key}`);
  const name = decodeURIComponent(new URL(raw).pathname.replace(/^\//, ''));
  if (!/^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/.test(name)) throw new Error(`invalid:${key}`);
  process.stdout.write(`${name}\n`);
}
NODE
)
test "${#PROD_DATABASES[@]}" -eq 2
CORE_PROD_DB="${PROD_DATABASES[0]}"
SEARCH_PROD_DB="${PROD_DATABASES[1]}"
test "$CORE_RESTORE" != "$CORE_PROD_DB" && test "$CORE_RESTORE" != "$SEARCH_PROD_DB"
test "$SEARCH_RESTORE" != "$CORE_PROD_DB" && test "$SEARCH_RESTORE" != "$SEARCH_PROD_DB"
# 从 PostgreSQL 容器环境取得实际管理角色，只输出已校验的标识符，不读取密码或 .env.prod。
DB_ADMIN_ROLE="$("${COMPOSE[@]}" exec -T postgres sh -ceu \
  'case "$POSTGRES_USER" in (*[!A-Za-z0-9_]*|"") exit 64;; esac; printf "%s" "$POSTGRES_USER"' </dev/null)"
case "$DB_ADMIN_ROLE" in (*[!A-Za-z0-9_]*|"") exit 64;; esac
"${COMPOSE[@]}" exec -T postgres createdb --username="$DB_ADMIN_ROLE" -- "$CORE_RESTORE" </dev/null
"${COMPOSE[@]}" exec -T postgres createdb --username="$DB_ADMIN_ROLE" -- "$SEARCH_RESTORE" </dev/null
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 --username="$DB_ADMIN_ROLE" --dbname="$CORE_RESTORE" < core.sql
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 --username="$DB_ADMIN_ROLE" --dbname="$SEARCH_RESTORE" < search.sql

# 验收：核心库与搜索库分别核对迁移账本和 schema；禁止只验一个库。
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 --username="$DB_ADMIN_ROLE" --dbname="$CORE_RESTORE" \
  -tAc 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;' </dev/null
"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 --username="$DB_ADMIN_ROLE" --dbname="$SEARCH_RESTORE" \
  -tAc 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;' </dev/null
```

还需比对生产与临时库的关键表计数或 schema 指纹，但只记录计数/哈希，不读取行内容。演练完成后保留临时库，直到阶段验收明确批准清理。

## 5. 演练日志

| 日期 | 集合 / release | 核心库 | 搜索库 | 结果 |
|---|---|---|---|---|
| 2026-08-28 | `db-set-20260827T155422Z-1676593` / `8163f8b…` | restored；active ledger 30；schema/data hash exact | restored；active ledger 2；normalized schema/data hash exact | 通过；确认 stdin guard；恢复库及同轮测试库已按授权精确清理 |
| 2026-08-27 | 旧格式 `20260827T123813Z` / `f9659668…` | dump 校验并恢复 | dump 校验并恢复；迁移 1/1 | 通过；临时库保留 |

## 6. 上传文件逻辑备份

`infra/scripts/backup-objects.mjs` 复用运行中 API 的私有 S3 环境及既有 Minio SDK，仅列举、读取和核对对象。正常发布的 `backup.sh` 优先使用同一不可变 release 中的 helper；旧 release 缺 helper 时才使用经审阅的相邻安装文件。凭据不进入宿主命令、输出或备份元数据。

- 每次生成独立 `objects-set-<UTC>-<PID>/`：私有 manifest、对象映射和编号 blob；目录 `0700`、文件 `0600`。对象 key 不参与文件路径。
- 串行复制、逐对象大小/摘要及前后元数据验证、末轮重新核对后原子发布。失败只移除本次 staging；不触碰生产数据卷。总量上限之外，复制前与过程中保留 8 GiB 空间和文件节点余量。
- 使用 `node <同版本helper> verify <精确集合路径>` 离线核验。成功出口不代表对象服务恢复：仍须隔离导入、读取验证及数据库所需对象子集检查。
- 数据库和对象分别备份，不能声称全局同一时点快照。额外导出的对象允许存在；恢复库引用却缺失的对象必须判失败。
- 首次导出、校验和权限实测通过后才能加入每日调度。异机存储及外部告警需要实际目标；同机备份不能抵御 ECS 丢失。

### 回滚与失败处理

保留安装前脚本和已完成集合。未发布半成品不算备份；不要根据年龄清除未知 staging。回退应用按原 release 流程执行，其 helper 随不可变来源选择；独立运维安装则恢复原脚本/相邻 helper，并核对文件权限、调度和一次受控执行。完整恢复及异机副本通过前保留旧备份。

## 7. 完整本机恢复集合（源码候选，尚未生产验收）

`--full` 复用同一 backup flock，顺序生成 `db-set-*`、`objects-set-*`、`recovery-state-*`。三个组件完成并通过字节完整性校验后，才原子发布 `full-set-*/manifest`，引用同轮目录与精确 release。任一组件失败，没有完整集合完成记录，已成功组件和旧集合继续保留。日常 DB/objects 的 `--confirm` 轮转也跳过同 ID 已完成 full-set 所引用的成员；完整集合暂不自动轮转，需单独容量管理与恢复验收，保留数量可能超过 KEEP。备份锁只排除其他备份进程，不冻结产品、S3 或 host producer；完成记录明确为 `component-validated-not-point-in-time`，不是双库/S3/host 全局原子快照。

Host helper 使用固定来源：Native inbox/bridges 的 `request.json` 和 `ended`；Synclip image/video 的 inbox/results/private；旧 Codex/review/video 的 inbox/results/private，以及历史 Chat jobs、image/review inbox/results/private。Chat 来源同时覆盖原 `/opt/openscience-chatgpt-browser` 与既有授权退役归档 `/var/backups/openscience/retired-chatgpt-web/20261013/runtime` 的精确子目录，不递归备份整个归档或浏览器根。它保留 paid attempt/receipt/结果字节，Native 已付费工具调用与工作状态仍在核心库的原 checkpoint。目录缺失会在私有 manifest 标 `present:false`；恢复负责人必须与实际安装来源核对，缺失在用来源不能验收。Native task HOME、SDK/浏览器登录状态、运行配置、API key、caller credential、socket 与 `.ready` 不备份、不恢复，运行凭据从独立私密交接重配。

来源不删除、不移动；编号 blob 与私有 JSONL 保存来源映射、mode/uid/gid。Linux 从已打开的目录描述符读取、拒绝链接/特殊文件并核对全轮文件清单；文件增加、删除或修改就失败。文件权限和完整性与旧 DB/S3 机制一致，保留至少 8 GiB 空间。持续写入可能导致失败，不能反复试到偶然成功后声称一致：需要可恢复的维护窗口，先隔离用户写入口、停止 Worker/任务生产者/timer，并等待已发付费请求落终态；API 只保留对象读取所需容器，禁止客户请求写入。具体在用 unit/未知付费任务按当次只读证据确定，禁止泛化 stop 或终止 paid 请求来制造快照。

### 隔离恢复与一致性验证

1. 从 `full-set-*/manifest` 取固定组件名，核对同 ID/release 与目录 `0700`、文件 `0600`；只执行 `sha256sum -c` 和两个 helper 的 `verify`，不显示 dump/映射/收据内容。
2. 复用当次已存在且已核身份的 PostgreSQL 镜像，在独立目录、独立容器、`--network none`、无 ports、无生产 mount/env 下恢复两库。禁止使用上文历史同集群入口。示例只建立新的隔离实例；创建前确认 `RESTORE_ROOT`/容器名不存在，目录私有、磁盘足够，`POSTGRES_IMAGE` 指向已核缓存镜像，禁 pull：

```bash
# 维护负责人设置精确绝对路径和已存在的镜像 ID，不从生产 env 取凭据。
test ! -e "$RESTORE_ROOT"
install -d -m 0700 "$RESTORE_ROOT" "$RESTORE_ROOT/data"
docker run -d --pull never --name "$RESTORE_CONTAINER" --network none \
  --memory 1g --cpus 1 --security-opt no-new-privileges \
  --mount "type=bind,src=$RESTORE_ROOT/data,dst=/var/lib/postgresql/data" \
  -e POSTGRES_USER=restore_admin -e POSTGRES_DB=core_rehearsal \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$POSTGRES_IMAGE"
docker exec "$RESTORE_CONTAINER" pg_isready -U restore_admin -d core_rehearsal
docker exec "$RESTORE_CONTAINER" createdb -U restore_admin search_rehearsal
# 原 dump 可能含 owner/ACL：从其 release 配置取得已校验的 core/search
# 角色名，在此隔离实例创建 NOLOGIN 角色（不复制密码/URL），再恢复。
docker exec -i "$RESTORE_CONTAINER" psql -U restore_admin -v ON_ERROR_STOP=1 -d core_rehearsal < "$DB_SET/core.sql"
docker exec -i "$RESTORE_CONTAINER" psql -U restore_admin -v ON_ERROR_STOP=1 -d search_rehearsal < "$DB_SET/search.sql"
```

3. 核对两库迁移账本、schema/约束及关键表计数；核心与搜索必须分别成功。通过 `docker exec` 在恢复核心库以 COPY JSONL 导出所需对象引用到私有 `0600` 文件。当前来源至少包括：仍有未 `bytes_purged_at` Artifact 引用的 Blob `storage_key/sha256/size`、未清除的 PresentationAsset `object_key/content_hash`、非 deleted 的 TemporaryDocument `object_key/content_hash`，以及公开冻结快照中引用但不再有活跃行的媒体。按对应 release 的现有公开引用闭包选出后一类，不对 JSON 文本任意搜字符串、不把已授权 purge 项误判为应恢复。只输出 JSONL 到文件，不输出 key 或行内容到日志；每行 `{ "key": ..., "sha256": ...或null, "size": ...或null }`。
4. `node "$RELEASE_ROOT/infra/scripts/backup-objects.mjs" verify-references "$OBJECT_SET" "$RESTORE_ROOT/references.ndjson"` 核对恢复 DB→备份字节闭包，缺 key/大小/摘要不符都失败，成功只报告引用计数。引用集合为空或漏公开快照来源不能当作通过。再导入一个独立、internal 网络、无生产卷/凭据的 S3 实例，逐所需 key 读取并核 SHA/长度；现有 helper 不执行导入，该操作仍需当次明确目标与恢复授权。仅 checksum 或闭包校验不证明对象服务可用。
5. Host set 先离线 verify，再只恢复到独立私有目录；还原固定来源路径映射与所有权前核 uid/gid 对应 release。不得直接把 inbox 送回运行 broker，不恢复 caller credential/worker.sock/heartbeat，不启动模型或 paid 重试。对齐 DB 中已有 task/attempt、paid receipt 和未知提交：未知状态保持人工恢复 hold，不自动重发。先核恢复后的正式 PDF/图片读取与未知付费任务不重发，才安排生产恢复。

失败保留独立容器、目录、日志和完整集合，业务无需回滚。生产恢复另开窗口并保留原 DB/对象/host 数据；切回原 release 和原数据路径才是回滚，不用恢复演练覆盖生产。没有异机服务器目标：异机副本与整机丢失恢复继续是待办，同机副本、源码测试或隔离演练不能关闭这一项。
