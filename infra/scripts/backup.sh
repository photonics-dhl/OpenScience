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
RELEASE_SHA="$(cat "$REMOTE_ROOT/.release-id")"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "BACKUP_FAIL: invalid active release identity" >&2; exit 1; }
RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"
test "$(cat "$RELEASE_ROOT/.release-source")" = "$RELEASE_SHA" || { echo "BACKUP_FAIL: active release directory mismatch" >&2; exit 1; }
COMPOSE_FILE="$RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
DUMP_DIR="/var/backups/openscience"
KEEP="${KEEP_BACKUPS:-7}"
DB_USER="${POSTGRES_USER:-openscience}"
DB_NAME="${POSTGRES_DB:-openscience}"

mkdir -p "$DUMP_DIR"
DATE="$(date -u +%Y%m%dT%H%M%SZ)"

if [ "$BACKUP_DB" -eq 1 ]; then
export XGS_RELEASE_ROOT="$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="$RELEASE_SHA"
COMPOSE=(docker compose --env-file "$REMOTE_ROOT/.env.prod" -f "$COMPOSE_FILE")
"${COMPOSE[@]}" exec -T -w /opt/openscience api node scripts/verify-database-isolation.mjs >/dev/null
SEARCH_DB_NAME="$("${COMPOSE[@]}" exec -T api node -e '
  const core = new URL(process.env.DATABASE_URL);
  const search = new URL(process.env.SEARCH_DATABASE_URL);
  if (core.hostname !== search.hostname || core.port !== search.port) process.exit(65);
  const name = decodeURIComponent(search.pathname.replace(/^\//, ""));
  if (!/^[a-zA-Z0-9_]{1,63}$/.test(name)) process.exit(66);
  process.stdout.write(name);
')"
[ -n "$SEARCH_DB_NAME" ] || { echo "BACKUP_FAIL: search database identity unavailable" >&2; exit 1; }
[ "$DB_NAME" != "$SEARCH_DB_NAME" ] || { echo "BACKUP_FAIL: core/search database identity collision" >&2; exit 1; }

CORE_DUMP_FILE="$DUMP_DIR/core-db-$DATE.sql"
SEARCH_DUMP_FILE="$DUMP_DIR/search-db-$DATE.sql"
MANIFEST_FILE="$DUMP_DIR/db-set-$DATE.manifest"

# 两个逻辑库独立导出；URL/凭据不进入命令输出或备份元数据。
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" > "$CORE_DUMP_FILE"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$SEARCH_DB_NAME" > "$SEARCH_DUMP_FILE"

# 校验两个 dump 非空并生成独立校验和与集合元数据。
[ -s "$CORE_DUMP_FILE" ] || { echo "BACKUP_FAIL: core dump empty" >&2; exit 1; }
[ -s "$SEARCH_DUMP_FILE" ] || { echo "BACKUP_FAIL: search dump empty" >&2; exit 1; }
sha256sum "$CORE_DUMP_FILE" > "$CORE_DUMP_FILE.sha256"
sha256sum "$SEARCH_DUMP_FILE" > "$SEARCH_DUMP_FILE.sha256"
printf 'schema=1\ncreated_at=%s\nrelease=%s\nretention_sets=%s\ncore=%s\nsearch=%s\n' \
  "$DATE" "$RELEASE_SHA" "$KEEP" "$(basename "$CORE_DUMP_FILE")" "$(basename "$SEARCH_DUMP_FILE")" > "$MANIFEST_FILE"

# 保留轮转（rm 命中危险命令，--confirm 才放行）
OLD_COUNT="$(ls -t "$DUMP_DIR"/db-set-*.manifest 2>/dev/null | tail -n +$((KEEP + 1)) | wc -l)"
if [ "$OLD_COUNT" -gt 0 ]; then
  if [ "$CONFIRM" -ne 1 ]; then
    echo "轮转需删除 $OLD_COUNT 旧备份，加 --confirm 放行" >&2
  else
    while IFS= read -r manifest; do
      suffix="${manifest##*/db-set-}"
      suffix="${suffix%.manifest}"
      rm -f -- "$DUMP_DIR/core-db-$suffix.sql" "$DUMP_DIR/core-db-$suffix.sql.sha256" \
        "$DUMP_DIR/search-db-$suffix.sql" "$DUMP_DIR/search-db-$suffix.sql.sha256" "$manifest"
    done < <(ls -t "$DUMP_DIR"/db-set-*.manifest | tail -n +$((KEEP + 1)))
  fi
fi

echo "BACKUP_OK core_size=$(du -h "$CORE_DUMP_FILE" | cut -f1) search_size=$(du -h "$SEARCH_DUMP_FILE" | cut -f1) sets=$(ls -t "$DUMP_DIR"/db-set-*.manifest | wc -l)/$KEEP"
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
