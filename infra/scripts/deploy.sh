#!/usr/bin/env bash
# deploy.sh — 物化 immutable candidate，并以单一前台 SSH 启动锁内生产事务。

set -eEuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_ROOT="${XGS_CONFIG_ROOT:-$PROJECT_ROOT}"
# Native Windows Node must not receive /c/... paths (notably quoted usernames).
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  PROJECT_ROOT="$(cygpath -m "$PROJECT_ROOT")"
  CONFIG_ROOT="$(cygpath -m "$CONFIG_ROOT")"
fi
ENV_FILE="$CONFIG_ROOT/.env"

CONFIRM=0
SKIP_BUILD=0
SKIP_MIGRATE=0
REQUIRE_PARSER_ACCEPTANCE=0
ROLLBACK_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) CONFIRM=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --require-parser-acceptance) REQUIRE_PARSER_ACCEPTANCE=1; shift ;;
    --rollback-ref) [ $# -ge 2 ] || { echo "错误：--rollback-ref 缺少值" >&2; exit 64; }; ROLLBACK_REF="$2"; shift 2 ;;
    -*) echo "未知参数: $1" >&2; exit 64 ;;
    *) RELEASE_REF="$1"; shift ;;
  esac
done
[ -n "${RELEASE_REF:-}" ] || { echo "用法: deploy.sh [--confirm] [--require-parser-acceptance] --rollback-ref <active-release-ref> <release-ref>" >&2; exit 64; }
[ "$SKIP_BUILD" -eq 0 ] || { echo "错误：精确 Git tree 部署必须重新 build，禁止 --skip-build" >&2; exit 64; }

RELEASE_SHA="$(node "$PROJECT_ROOT/scripts/verify-release-source.mjs" --root "$PROJECT_ROOT" --ref "$RELEASE_REF")" \
  || { echo "错误：部署源不是 release-ref 的干净精确 tree" >&2; exit 66; }
ROLLBACK_SHA=""
if [ -n "$ROLLBACK_REF" ]; then
  ROLLBACK_SHA="$(git -C "$PROJECT_ROOT" rev-parse --verify "$ROLLBACK_REF^{commit}")" \
    || { echo "错误：rollback-ref '$ROLLBACK_REF' 不存在" >&2; exit 66; }
  [[ "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "错误：rollback-ref 必须解析为完整 commit SHA" >&2; exit 66; }
fi

[ -f "$ENV_FILE" ] || { echo "错误：未找到 .env（$ENV_FILE）" >&2; exit 66; }
read_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}
pick() {
  local value
  for key in "$@"; do
    value="$(read_env "$key")"
    if [ -n "$value" ]; then printf '%s' "$value"; return 0; fi
  done
  return 1
}
SSH_HOST="$(pick SERVER_HOST SSH_HOST 公网ip)" || { echo "错误：.env 缺少服务器地址" >&2; exit 66; }
SSH_USER="$(pick SERVER_USER SSH_USER 用户名)" || { echo "错误：.env 缺少用户名" >&2; exit 66; }
SSH_PORT="$(pick SERVER_PORT SSH_PORT SSH端口 || true)"; SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="${XGS_SSH_KEY:-$HOME/.ssh/id_ed25519_xgs}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=2 -i "$SSH_KEY" -p "$SSH_PORT")
if [ -n "${XGS_SSH_KNOWN_HOSTS:-}" ]; then
  [[ "$XGS_SSH_KNOWN_HOSTS" != *[\"$'\r\n']* ]] || { echo "错误：known_hosts 路径无效" >&2; exit 64; }
  SSH_OPTS+=(-o "UserKnownHostsFile=\"$XGS_SSH_KNOWN_HOSTS\"" -o StrictHostKeyChecking=yes)
fi

log() { printf '%s\n' "$*"; }
plan() { log "  [计划] $*"; }

log "=== OpenScience 部署计划 ===  release=$RELEASE_REF  host=$SSH_HOST"
if [ "$CONFIRM" -ne 1 ]; then
  plan "先物化 immutable candidate；dry-run 不连接或写入生产锁"
  plan "随后由单一前台 SSH runner 自持 FD9 flock 完成 build/migrate/switch/health/publish/rollback"
  plan "事务在首次生产 mutation 前发布 durable journal；残留 journal 阻断下一次部署"
  [ -n "$ROLLBACK_REF" ] || plan "执行 --confirm 前必须补 --rollback-ref <已验证 Git ref>"
  [ "$REQUIRE_PARSER_ACCEPTANCE" -eq 1 ] || plan "执行 --confirm 前必须补 --require-parser-acceptance"
  exit 0
fi
[ -n "$ROLLBACK_SHA" ] || { echo "错误：--confirm 必须提供 --rollback-ref" >&2; exit 64; }
[ "$REQUIRE_PARSER_ACCEPTANCE" -eq 1 ] || { echo "错误：--confirm 必须提供 --require-parser-acceptance" >&2; exit 64; }

log "[1] 物化 immutable Git candidate（不改变 active production）..."
XGS_SOURCE_ROOT="$PROJECT_ROOT" XGS_CONFIG_ROOT="$CONFIG_ROOT" XGS_RELEASE_SHA="$RELEASE_SHA" node "$PROJECT_ROOT/scripts/cloud-sync.mjs"

log "[2] 启动单一 SSH/flock 生产事务..."
git -C "$PROJECT_ROOT" show "$RELEASE_SHA:infra/scripts/production-deploy-transaction.sh" \
  | grep -F 'install -m 0644 $RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF' >/dev/null \
  || { echo "错误：候选 transaction runner 缺少 nginx 收敛合同" >&2; exit 66; }
REMOTE_TRANSACTION_RUNNER="/opt/openscience-releases/$RELEASE_SHA/infra/scripts/production-deploy-transaction.sh"
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
  "exec /bin/bash '$REMOTE_TRANSACTION_RUNNER' '$RELEASE_SHA' '$ROLLBACK_SHA' '$SKIP_MIGRATE' </dev/null" \
  </dev/null
