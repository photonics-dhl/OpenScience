#!/usr/bin/env bash
# deploy.sh — 单 ECS、Git SHA 不可变目录部署。
# 详细步骤与回滚边界见 docs/runbooks/deployment.md。

set -eEuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_ROOT="${XGS_CONFIG_ROOT:-$PROJECT_ROOT}"
ENV_FILE="$CONFIG_ROOT/.env"

CONFIRM=0
SKIP_BUILD=0
SKIP_MIGRATE=0
ROLLBACK_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) CONFIRM=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --rollback-ref) [ $# -ge 2 ] || { echo "错误：--rollback-ref 缺少值" >&2; exit 64; }; ROLLBACK_REF="$2"; shift 2 ;;
    -*) echo "未知参数: $1" >&2; exit 64 ;;
    *) RELEASE_REF="$1"; shift ;;
  esac
done
[ -n "${RELEASE_REF:-}" ] || { echo "用法: deploy.sh [--confirm] --rollback-ref <rollback-ref> <release-ref>" >&2; exit 64; }
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
SSH_KEY="$HOME/.ssh/id_ed25519_xgs"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -i "$SSH_KEY" -p "$SSH_PORT")

run_remote() {
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$1"
}

REMOTE_ROOT="/opt/openscience"
RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"
PROD_ENV="$REMOTE_ROOT/.env.prod"
COMPOSE_FILE="$RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
LEGACY_COMPOSE_FILE="$REMOTE_ROOT/infra/compose/docker-compose.prod.yml"
NGINX_CONF="/etc/nginx/conf.d/openscience.conf"
HTPASSWD="/etc/nginx/.htpasswd-admin"

compose_current() {
  run_remote "cd $RELEASE_ROOT && XGS_RELEASE_ROOT=$RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$RELEASE_SHA docker compose --env-file $PROD_ENV -f $COMPOSE_FILE $1"
}

wait_for_healthy() {
  local services=("$@")
  [ "${#services[@]}" -gt 0 ] || { echo "错误：wait_for_healthy 需要明确 service" >&2; return 64; }
  compose_current "up -d --wait --wait-timeout 300 ${services[*]}"
}

expect_http_status() {
  local url="$1" expected="$2"
  run_remote "actual=\$(curl -sS -o /dev/null -w '%{http_code}' '$url'); test \"\$actual\" = '$expected'"
}

expect_http_body() {
  local url="$1" expected="$2"
  run_remote "actual=\$(curl -fsS '$url'); test \"\$actual\" = '$expected'"
}

log() { printf '%s\n' "$*"; }
plan() { log "  [计划] $*"; }

log "=== OpenScience 部署计划 ===  release=$RELEASE_REF  host=$SSH_HOST"
if [ "$CONFIRM" -ne 1 ]; then
  plan "完整 Git commit → $RELEASE_ROOT；同 SHA 已在线则验证后 no-op"
  plan "install + 全量 build；Worker/Parser 使用 release SHA 镜像标签"
  plan "迁移/seed 后按 Parser→API/Web/Worker 顺序切换"
  plan "公网与 /__release 验收；失败自动恢复 rollback-ref/上一 active SHA"
  [ -n "$ROLLBACK_REF" ] || plan "执行 --confirm 前必须补 --rollback-ref <已验证 Git ref>"
  exit 0
fi
[ -n "$ROLLBACK_SHA" ] || { echo "错误：--confirm 必须提供 --rollback-ref" >&2; exit 64; }
[ "$ROLLBACK_SHA" != "$RELEASE_SHA" ] || { echo "错误：rollback-ref 不能等于 release-ref" >&2; exit 64; }

log "=== 执行部署（--confirm）==="
run_remote "test ! -e $REMOTE_ROOT/.release-failed" || {
  echo "错误：云上存在 .release-failed；必须先显式恢复并核验运行态" >&2
  exit 1
}
ACTIVE_RELEASE_SHA="$(run_remote "cat $REMOTE_ROOT/.release-id 2>/dev/null || true")"
if [ -n "$ACTIVE_RELEASE_SHA" ] && [[ ! "$ACTIVE_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：云上 active release identity 非法" >&2
  exit 1
fi
if [ -z "$ACTIVE_RELEASE_SHA" ]; then
  run_remote "set -euo pipefail; containers=\$(docker ps -aq); if [ -n \"\$containers\" ]; then mounts=\$(docker inspect --format='{{range .Mounts}}{{println .Source}}{{end}}' \$containers); if printf '%s\n' \"\$mounts\" | grep -q '^/opt/openscience-releases/'; then echo 'versioned release mounts exist without .release-id' >&2; exit 1; fi; fi"
fi

if [ "$ACTIVE_RELEASE_SHA" = "$RELEASE_SHA" ]; then
  run_remote "test \"\$(cat '$RELEASE_ROOT/.release-source')\" = '$RELEASE_SHA'"
  expect_http_status https://OpenScience.428312321.xyz/ 200
  expect_http_status https://OpenScience.428312321.xyz/auth/me 401
  expect_http_status https://OpenScience.428312321.xyz/admin/ 401
  expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"
  log "already active: release=$RELEASE_SHA"
  exit 0
fi

PREVIOUS_RELEASE_SHA="${ACTIVE_RELEASE_SHA:-$ROLLBACK_SHA}"
PREVIOUS_RELEASE_ROOT="/opt/openscience-releases/$PREVIOUS_RELEASE_SHA"
ROLLBACK_COMPOSE_FILE="$PREVIOUS_RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
ROLLBACK_COMPOSE_MODE="previous-release"
if [ -n "$ACTIVE_RELEASE_SHA" ]; then
  run_remote "test \"\$(cat '$PREVIOUS_RELEASE_ROOT/.release-source')\" = '$PREVIOUS_RELEASE_SHA'"
  run_remote "test -f '$ROLLBACK_COMPOSE_FILE'"
  run_remote "docker image inspect openscience-agent-worker:$PREVIOUS_RELEASE_SHA openscience-document-parser:$PREVIOUS_RELEASE_SHA >/dev/null"
else
  log "[0] 首次版本化发布：物化并构建 rollback-ref..."
  # 旧版 Compose 不理解 release root/image tag；首次切换只能用新 Compose
  # 作为显式兼容适配器，并把切换前正在运行的不可变镜像 ID 保存为 rollback tag。
  ROLLBACK_COMPOSE_FILE="$COMPOSE_FILE"
  ROLLBACK_COMPOSE_MODE="first-transition-adapter"
  XGS_SOURCE_ROOT="$PROJECT_ROOT" XGS_CONFIG_ROOT="$CONFIG_ROOT" XGS_RELEASE_SHA="$PREVIOUS_RELEASE_SHA" node "$PROJECT_ROOT/scripts/cloud-sync.mjs"
  run_remote "cd $PREVIOUS_RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build"
  run_remote "set -e; worker_container=\$(docker compose --env-file $PROD_ENV -f $LEGACY_COMPOSE_FILE ps -q agent-worker); parser_container=\$(docker compose --env-file $PROD_ENV -f $LEGACY_COMPOSE_FILE ps -q document-parser); test -n \"\$worker_container\"; test -n \"\$parser_container\"; worker_image=\$(docker inspect --format='{{.Image}}' \"\$worker_container\"); parser_image=\$(docker inspect --format='{{.Image}}' \"\$parser_container\"); test -n \"\$worker_image\"; test -n \"\$parser_image\"; docker image inspect \"\$worker_image\" \"\$parser_image\" >/dev/null; docker tag \"\$worker_image\" openscience-agent-worker:$PREVIOUS_RELEASE_SHA; docker tag \"\$parser_image\" openscience-document-parser:$PREVIOUS_RELEASE_SHA"
fi

log "[1] 物化完整 Git release..."
XGS_SOURCE_ROOT="$PROJECT_ROOT" XGS_CONFIG_ROOT="$CONFIG_ROOT" XGS_RELEASE_SHA="$RELEASE_SHA" node "$PROJECT_ROOT/scripts/cloud-sync.mjs"

log "[2] install + 全量 build..."
run_remote "cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build"

log "[2b] 构建 SHA-tagged release 镜像..."
compose_current "build agent-worker document-parser"

SWITCH_STARTED=0
rollback_application() {
  local original_status=$?
  trap - ERR
  set +e
  if [ "$SWITCH_STARTED" -eq 0 ]; then exit "$original_status"; fi

  local rollback_ok=1
  log "[回滚] 恢复 application release=$PREVIOUS_RELEASE_SHA"
  run_remote "test \"\$(cat '$PREVIOUS_RELEASE_ROOT/.release-source')\" = '$PREVIOUS_RELEASE_SHA'" || rollback_ok=0
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "docker image inspect openscience-agent-worker:$PREVIOUS_RELEASE_SHA openscience-document-parser:$PREVIOUS_RELEASE_SHA >/dev/null" || rollback_ok=0
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "cd $PREVIOUS_RELEASE_ROOT && XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE up -d --force-recreate --wait --wait-timeout 300 document-parser api web agent-worker" || rollback_ok=0
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "install -m 0644 $PREVIOUS_RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF && nginx -t && systemctl reload nginx" || rollback_ok=0
  fi

  if [ "$rollback_ok" -ne 1 ]; then
    run_remote "set -e; rm -f $REMOTE_ROOT/.release-id; printf 'candidate=%s\nprevious=%s\ncompose_mode=%s\nfailed_at=%s\n' '$RELEASE_SHA' '$PREVIOUS_RELEASE_SHA' '$ROLLBACK_COMPOSE_MODE' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > $REMOTE_ROOT/.release-failed.next; mv $REMOTE_ROOT/.release-failed.next $REMOTE_ROOT/.release-failed" || \
      echo "ROLLBACK_FAILED_IDENTITY_UNSAFE: unable to guarantee removal of release identity" >&2
    echo "ROLLBACK_FAILED: release identity withdrawn; inspect $REMOTE_ROOT/.release-failed" >&2
    exit 70
  fi
  run_remote "set -e; printf '%s\n' '$PREVIOUS_RELEASE_SHA' > $REMOTE_ROOT/.release-id.rollback; mv $REMOTE_ROOT/.release-id.rollback $REMOTE_ROOT/.release-id; rm -f $REMOTE_ROOT/.release-failed" || {
    run_remote "set -e; rm -f $REMOTE_ROOT/.release-id; printf 'candidate=%s\nprevious=%s\ncompose_mode=%s\nfailed_at=%s\nreason=marker-update\n' '$RELEASE_SHA' '$PREVIOUS_RELEASE_SHA' '$ROLLBACK_COMPOSE_MODE' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > $REMOTE_ROOT/.release-failed.next; mv $REMOTE_ROOT/.release-failed.next $REMOTE_ROOT/.release-failed" || \
      echo "ROLLBACK_FAILED_IDENTITY_UNSAFE: unable to guarantee removal of release identity" >&2
    echo "ROLLBACK_FAILED: recovery healthy but release identity was withdrawn" >&2
    exit 70
  }
  exit "$original_status"
}
trap 'rollback_application' ERR

if [ "$SKIP_MIGRATE" -ne 1 ]; then
  log "[3] 迁移 deploy..."
  compose_current "run --rm --no-deps -T -e DATABASE_URL=\$(grep '^DATABASE_URL=' $PROD_ENV | cut -d= -f2-) -w /opt/openscience api node packages/database/dist/migrate-cli.js deploy"
  log "[4] seed-quota..."
  compose_current "run --rm --no-deps -T -e DATABASE_URL=\$(grep '^DATABASE_URL=' $PROD_ENV | cut -d= -f2-) -w /opt/openscience api node scripts/seed-quota.mjs --confirm"
fi

SWITCH_STARTED=1
log "[5] Parser 先行并等待 healthy..."
compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"

log "[5b] 切换 API/Web/Worker 并等待 healthy..."
compose_current "up -d --force-recreate --wait --wait-timeout 300 api web agent-worker"
wait_for_healthy api web agent-worker

log "[6] 切换 nginx 与 release identity..."
run_remote "set -e; backup=${NGINX_CONF}.pre-deploy-\$(date +%Y%m%d%H%M%S); cp -p $NGINX_CONF \$backup; install -m 0644 $RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF; if ! nginx -t; then cp -p \$backup $NGINX_CONF; nginx -t; exit 1; fi; systemctl reload nginx"
run_remote "set -e; printf '%s\n' '$RELEASE_SHA' > $REMOTE_ROOT/.release-id.next; mv $REMOTE_ROOT/.release-id.next $REMOTE_ROOT/.release-id"
run_remote "test -f $HTPASSWD || echo 'WARN: $HTPASSWD 不存在——首次需手动生成（见 runbook）'"

log "[7] 公网与精确 release 验收..."
expect_http_status https://OpenScience.428312321.xyz/ 200
expect_http_status https://OpenScience.428312321.xyz/auth/me 401
expect_http_status https://OpenScience.428312321.xyz/admin/ 401
expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"
run_remote "rm -f $REMOTE_ROOT/.release-failed"

# 只有新 release 已从公网确认后，才替换定时任务调用的备份脚本。
run_remote "install -m 0755 $RELEASE_ROOT/infra/scripts/backup.sh /usr/local/bin/backup.sh"

trap - ERR
log "=== 部署完成（release=$RELEASE_SHA rollback=$PREVIOUS_RELEASE_SHA）==="
