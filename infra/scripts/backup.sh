#!/usr/bin/env bash
# backup.sh — 数据库每日备份（P1A-9 填充，Spec §17 MUST + §21.1 恢复测试层）。
#
# 安全约束（Spec §20.1-9）：
#   - 备份文件与真实用户数据不得拉入本地 Kimi/Agent 上下文；
#     备份只写远端本地盘，本脚本不向 stdout 输出备份内容。
#   - 恢复流程见 docs/runbooks/backup-restore.md（恢复演练属 §21.1）。
#
# 用法（云上执行，经 ssh-run.sh）:
#   backup.sh [--confirm] [--db] [--objects]
#     --db       PostgreSQL dump
#     --objects  SeaweedFS 数据卷快照（不触碰生产卷内容）
#     --confirm  危险命令（rm 轮转）放行
#
# 保留策略：KEEP_BACKUPS 轮（默认 7），超出轮转删除。

set -euo pipefail

CONFIRM=0
BACKUP_DB=0
BACKUP_OBJECTS=0
for arg in "$@"; do
  case "$arg" in
    --confirm) CONFIRM=1 ;;
    --db) BACKUP_DB=1 ;;
    --objects) BACKUP_OBJECTS=1 ;;
    *) echo "未知参数: $arg" >&2; exit 64 ;;
  esac
done
[ "$BACKUP_DB" -eq 1 ] || [ "$BACKUP_OBJECTS" -eq 1 ] || { echo "用法: backup.sh [--confirm] --db [--objects]" >&2; exit 64; }

REMOTE_ROOT="/opt/openscience"
COMPOSE_FILE="$REMOTE_ROOT/infra/compose/docker-compose.prod.yml"
DUMP_DIR="/var/backups/openscience"
KEEP="${KEEP_BACKUPS:-7}"
DB_USER="${POSTGRES_USER:-openscience}"
DB_NAME="${POSTGRES_DB:-openscience}"

mkdir -p "$DUMP_DIR"
DATE="$(date +%F)"

if [ "$BACKUP_DB" -eq 1 ]; then
DUMP_FILE="$DUMP_DIR/db-$DATE.sql"

# pg_dump：经生产 postgres 容器导出；内容不向 stdout 输出（Spec §20.1-9）
docker compose --env-file "$REMOTE_ROOT/.env.prod" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" > "$DUMP_FILE"

# 校验 dump 非空
[ -s "$DUMP_FILE" ] || { echo "BACKUP_FAIL: $DUMP_FILE 为空" >&2; exit 1; }

# 保留轮转（rm 命中危险命令，--confirm 才放行）
OLD_COUNT="$(ls -t "$DUMP_DIR"/db-*.sql 2>/dev/null | tail -n +$((KEEP + 1)) | wc -l)"
if [ "$OLD_COUNT" -gt 0 ]; then
  if [ "$CONFIRM" -ne 1 ]; then
    echo "轮转需删除 $OLD_COUNT 旧备份，加 --confirm 放行" >&2
  else
    ls -t "$DUMP_DIR"/db-*.sql | tail -n +$((KEEP + 1)) | xargs -r rm -f
  fi
fi

echo "BACKUP_OK size=$(du -h "$DUMP_FILE" | cut -f1) files=$(ls -t "$DUMP_DIR"/db-*.sql | wc -l)/$KEEP"
fi

if [ "$BACKUP_OBJECTS" -eq 1 ]; then
  VOLUME="${SEAWEED_VOLUME:-openscience-prod_seaweed-data}"
  MOUNTPOINT="$(docker volume inspect -f '{{.Mountpoint}}' "$VOLUME" 2>/dev/null || true)"
  [ -n "$MOUNTPOINT" ] && [ -d "$MOUNTPOINT" ] || { echo "BACKUP_FAIL: SeaweedFS volume unavailable" >&2; exit 1; }
  OBJECT_FILE="$DUMP_DIR/objects-$DATE.tar.gz"
  tar -czf "$OBJECT_FILE" -C "$MOUNTPOINT" .
  [ -s "$OBJECT_FILE" ] || { echo "BACKUP_FAIL: object snapshot empty" >&2; exit 1; }
  echo "OBJECT_BACKUP_OK size=$(du -h "$OBJECT_FILE" | cut -f1)"
fi
