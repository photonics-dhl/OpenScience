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
umask 077

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
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_FAIL: invalid retention" >&2; exit 64; }

install -d -m 0700 "$DUMP_DIR"
exec 9>"$DUMP_DIR/.backup.lock"
flock -n 9 || { echo "BACKUP_BUSY: another backup is running" >&2; exit 75; }
DATE="$(date -u +%Y%m%dT%H%M%SZ)-$$"

if [ "$BACKUP_DB" -eq 1 ]; then
export XGS_RELEASE_ROOT="$RELEASE_ROOT" XGS_RELEASE_IMAGE_TAG="$RELEASE_SHA"
read -r SCANSCI_BROWSER_REQUIREMENTS_SHA256 _ < <(sha256sum "$RELEASE_ROOT/apps/scansci-legal/browser-requirements.lock")
[[ "$SCANSCI_BROWSER_REQUIREMENTS_SHA256" =~ ^[0-9a-f]{64}$ ]] || { echo "BACKUP_FAIL: invalid browser requirements identity" >&2; exit 1; }
export SCANSCI_BROWSER_REQUIREMENTS_SHA256
COMPOSE=(docker compose --project-directory "$RELEASE_ROOT" --env-file "$REMOTE_ROOT/.env.prod" -f "$COMPOSE_FILE")
"${COMPOSE[@]}" exec -T -w /opt/openscience api node scripts/verify-database-isolation.mjs >/dev/null
mapfile -t DB_IDENTITIES < <("${COMPOSE[@]}" exec -T api node -e '
  const core = new URL(process.env.DATABASE_URL);
  const search = new URL(process.env.SEARCH_DATABASE_URL);
  if (core.hostname !== search.hostname || core.port !== search.port) process.exit(65);
  const values = [
    decodeURIComponent(core.username),
    decodeURIComponent(core.pathname.replace(/^\//, "")),
    decodeURIComponent(search.username),
    decodeURIComponent(search.pathname.replace(/^\//, "")),
  ];
  if (values.some((value) => !/^[a-zA-Z0-9_]{1,63}$/.test(value))) process.exit(66);
  process.stdout.write(values.join("\n"));
')
[ "${#DB_IDENTITIES[@]}" -eq 4 ] || { echo "BACKUP_FAIL: database identities unavailable" >&2; exit 1; }
CORE_DB_USER="${DB_IDENTITIES[0]}"
CORE_DB_NAME="${DB_IDENTITIES[1]}"
SEARCH_DB_USER="${DB_IDENTITIES[2]}"
SEARCH_DB_NAME="${DB_IDENTITIES[3]}"
[ "$CORE_DB_NAME" != "$SEARCH_DB_NAME" ] || { echo "BACKUP_FAIL: core/search database identity collision" >&2; exit 1; }

STAGING_DIR="$DUMP_DIR/.db-set-$DATE.$$.staging"
FINAL_SET_DIR="$DUMP_DIR/db-set-$DATE"
case "$STAGING_DIR" in "$DUMP_DIR"/.db-set-*.staging) ;; *) echo "BACKUP_FAIL: unsafe staging path" >&2; exit 1 ;; esac
[ ! -e "$STAGING_DIR" ] && [ ! -e "$FINAL_SET_DIR" ] || { echo "BACKUP_FAIL: backup set collision" >&2; exit 1; }
install -d -m 0700 "$STAGING_DIR"
CORE_DUMP_FILE="$STAGING_DIR/core.sql"
SEARCH_DUMP_FILE="$STAGING_DIR/search.sql"
MANIFEST_FILE="$STAGING_DIR/manifest"
install -m 0600 /dev/null "$CORE_DUMP_FILE"
install -m 0600 /dev/null "$SEARCH_DUMP_FILE"

cleanup_db_stage() {
  case "${STAGING_DIR:-}" in "$DUMP_DIR"/.db-set-*.staging) rm -rf -- "$STAGING_DIR" ;; esac
}
trap cleanup_db_stage EXIT
trap 'cleanup_db_stage; exit 130' HUP INT TERM

# 两个逻辑库独立导出；URL/凭据不进入命令输出或备份元数据。
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$CORE_DB_USER" -d "$CORE_DB_NAME" > "$CORE_DUMP_FILE"
"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$SEARCH_DB_USER" -d "$SEARCH_DB_NAME" > "$SEARCH_DUMP_FILE"

# 校验两个 dump 非空并生成独立校验和与集合元数据。
[ -s "$CORE_DUMP_FILE" ] || { echo "BACKUP_FAIL: core dump empty" >&2; exit 1; }
[ -s "$SEARCH_DUMP_FILE" ] || { echo "BACKUP_FAIL: search dump empty" >&2; exit 1; }
(
  cd "$STAGING_DIR"
  sha256sum core.sql > core.sql.sha256
  sha256sum search.sql > search.sql.sha256
)
printf 'schema=2\ncreated_at=%s\nrelease=%s\nretention_sets=%s\ncore=core.sql\nsearch=search.sql\n' \
  "$DATE" "$RELEASE_SHA" "$KEEP" > "$MANIFEST_FILE"
chmod 0600 "$STAGING_DIR"/*
sync -f "$STAGING_DIR"/* "$STAGING_DIR"
mv -- "$STAGING_DIR" "$FINAL_SET_DIR"
trap - EXIT HUP INT TERM
CORE_DUMP_FILE="$FINAL_SET_DIR/core.sql"
SEARCH_DUMP_FILE="$FINAL_SET_DIR/search.sql"

# 保留轮转（rm 命中危险命令，--confirm 才放行）
mapfile -t DB_SETS < <(find "$DUMP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'db-set-*' -printf '%f\n' | sort -r)
OLD_COUNT=$((${#DB_SETS[@]} > KEEP ? ${#DB_SETS[@]} - KEEP : 0))
if [ "$OLD_COUNT" -gt 0 ]; then
  if [ "$CONFIRM" -ne 1 ]; then
    echo "轮转需删除 $OLD_COUNT 旧备份，加 --confirm 放行" >&2
  else
    for set_name in "${DB_SETS[@]:$KEEP}"; do
      case "$set_name" in db-set-[0-9]*Z-[0-9]*) rm -rf -- "$DUMP_DIR/$set_name" ;; *) echo "BACKUP_FAIL: unsafe rotation target" >&2; exit 1 ;; esac
    done
  fi
fi

count_retained_db_sets() {
  local count
  if ! count="$(find "$DUMP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'db-set-*' -printf '.\n' | awk 'END { print NR }')"; then
    return 1
  fi
  [[ "$count" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$count"
}
if ! RETAINED_SET_COUNT="$(count_retained_db_sets)"; then
  echo "BACKUP_FAIL: retention inventory failed" >&2
  exit 1
fi
echo "BACKUP_OK core_size=$(du -h "$CORE_DUMP_FILE" | cut -f1) search_size=$(du -h "$SEARCH_DUMP_FILE" | cut -f1) sets=${RETAINED_SET_COUNT}/$KEEP"
fi

if [ "$BACKUP_OBJECTS" -eq 1 ]; then
  VOLUME="${SEAWEED_VOLUME:-openscience-prod_seaweed-data}"
  MOUNTPOINT="$(docker volume inspect -f '{{.Mountpoint}}' "$VOLUME" 2>/dev/null || true)"
  [ -n "$MOUNTPOINT" ] && [ -d "$MOUNTPOINT" ] || { echo "BACKUP_FAIL: SeaweedFS volume unavailable" >&2; exit 1; }
  OBJECT_STAGE="$DUMP_DIR/.objects-$DATE.staging"
  OBJECT_FILE="$DUMP_DIR/objects-$DATE.tar.gz"
  case "$OBJECT_STAGE" in "$DUMP_DIR"/.objects-*.staging) ;; *) echo "BACKUP_FAIL: unsafe object staging path" >&2; exit 1 ;; esac
  [ ! -e "$OBJECT_STAGE" ] && [ ! -e "$OBJECT_FILE" ] || { echo "BACKUP_FAIL: object snapshot collision" >&2; exit 1; }
  install -m 0600 /dev/null "$OBJECT_STAGE"
  cleanup_object_stage() { case "${OBJECT_STAGE:-}" in "$DUMP_DIR"/.objects-*.staging) rm -f -- "$OBJECT_STAGE" ;; esac; }
  trap cleanup_object_stage EXIT
  trap 'cleanup_object_stage; exit 130' HUP INT TERM
  tar -czf "$OBJECT_STAGE" -C "$MOUNTPOINT" .
  [ -s "$OBJECT_STAGE" ] || { echo "BACKUP_FAIL: object snapshot empty" >&2; exit 1; }
  sync -f "$OBJECT_STAGE"
  mv -- "$OBJECT_STAGE" "$OBJECT_FILE"
  trap - EXIT HUP INT TERM
  echo "OBJECT_BACKUP_OK size=$(du -h "$OBJECT_FILE" | cut -f1)"
fi
