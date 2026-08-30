#!/usr/bin/env bash
# production-deploy-transaction.sh — 单一 SSH/flock FD 内的生产发布事务。
# 详细步骤与回滚边界见 docs/runbooks/deployment.md。

set -eEuo pipefail

[ "$#" -eq 3 ] || { echo "错误：生产事务 runner 参数不完整" >&2; exit 64; }
RELEASE_SHA="$1"
ROLLBACK_SHA="$2"
SKIP_MIGRATE="$3"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ && "$ROLLBACK_SHA" =~ ^[0-9a-f]{40}$ ]] \
  || { echo "错误：生产事务 SHA 非法" >&2; exit 64; }
[[ "$SKIP_MIGRATE" =~ ^[01]$ ]] || { echo "错误：skip-migrate 标志非法" >&2; exit 64; }

REMOTE_ROOT="/opt/openscience"
RELEASE_ROOT="/opt/openscience-releases/$RELEASE_SHA"
SCRIPT_DIR="$RELEASE_ROOT/infra/scripts"
PROJECT_ROOT="$RELEASE_ROOT"
PROD_ENV="$REMOTE_ROOT/.env.prod"
COMPOSE_FILE="$RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
NGINX_CONF="/etc/nginx/conf.d/openscience.conf"
HTPASSWD="/etc/nginx/.htpasswd-admin"
DEPLOY_LOCK_DIRECTORY="/run/lock/openscience-production-deploy"
DEPLOY_LOCK_PATH="$DEPLOY_LOCK_DIRECTORY/lock"
DEPLOY_JOURNAL="$REMOTE_ROOT/.deploy-transaction.json"
SCANSCI_SECRET_ROOT="/opt/openscience-secrets/scansci"

run_remote() {
  bash -c "$1"
}

acquire_production_deploy_lock() {
  command -v flock >/dev/null 2>&1 || return 69
  [ ! -L "$DEPLOY_LOCK_DIRECTORY" ] || return 71
  if [ ! -e "$DEPLOY_LOCK_DIRECTORY" ]; then
    mkdir -m 0700 -- "$DEPLOY_LOCK_DIRECTORY" || return 71
  fi
  [ -d "$DEPLOY_LOCK_DIRECTORY" ] && [ ! -L "$DEPLOY_LOCK_DIRECTORY" ] \
    && [ "$(readlink -f -- "$DEPLOY_LOCK_DIRECTORY")" = "$DEPLOY_LOCK_DIRECTORY" ] || return 71
  set -- $(stat -c '%u %a' -- "$DEPLOY_LOCK_DIRECTORY")
  [ "$1" = 0 ] && [ "$2" = 700 ] || return 71
  [ ! -L "$DEPLOY_LOCK_PATH" ] || return 71
  if [ ! -e "$DEPLOY_LOCK_PATH" ]; then
    (umask 077; set -C; : > "$DEPLOY_LOCK_PATH") || return 71
  fi
  [ -f "$DEPLOY_LOCK_PATH" ] && [ ! -L "$DEPLOY_LOCK_PATH" ] || return 71
  set -- $(stat -c '%u %a %h' -- "$DEPLOY_LOCK_PATH")
  [ "$1" = 0 ] && [ "$2" = 600 ] && [ "$3" = 1 ] || return 71
  exec 9<>"$DEPLOY_LOCK_PATH"
  flock -n -E 73 9
}

assert_production_deploy_lock() {
  local fd_identity path_identity probe_status
  fd_identity="$(stat -Lc '%d:%i' /proc/$$/fd/9)" || return 74
  path_identity="$(stat -Lc '%d:%i' "$DEPLOY_LOCK_PATH")" || return 74
  [ "$fd_identity" = "$path_identity" ] || return 74
  set +e
  flock -n -E 73 "$DEPLOY_LOCK_PATH" -c : >/dev/null 2>&1
  probe_status=$?
  set -e
  [ "$probe_status" -eq 73 ]
}

read_prod_value() {
  local key="$1"
  run_remote "set -e; count=\$(grep -c '^${key}=' '$PROD_ENV' || true); test \"\$count\" -eq 1; sed -n 's/^${key}=//p' '$PROD_ENV' | tr -d '\r'"
}

read_capability_value() {
  local file="$1" key="$2"
  run_remote "set -e; count=\$(grep -c '^${key}=' '$file' || true); test \"\$count\" -eq 1; sed -n 's/^${key}=//p' '$file' | tr -d '\r'"
}

require_match() {
  local name="$1" value="$2" pattern="$3"
  [[ "$value" =~ $pattern ]] || {
    echo "错误：$name 格式非法" >&2
    exit 66
  }
}

journal_start() {
  node "$SCRIPT_DIR/production-deploy-lock.mjs" journal-start --journal "$DEPLOY_JOURNAL" \
    --candidate "$RELEASE_SHA" --rollback "$ROLLBACK_SHA" --phase prepared --lock-fd 9
}

journal_update() {
  node "$SCRIPT_DIR/production-deploy-lock.mjs" journal-update --journal "$DEPLOY_JOURNAL" \
    --candidate "$RELEASE_SHA" --rollback "$ROLLBACK_SHA" --phase "$1" --lock-fd 9
}

journal_clear() {
  node "$SCRIPT_DIR/production-deploy-lock.mjs" journal-clear --journal "$DEPLOY_JOURNAL" \
    --candidate "$RELEASE_SHA" --rollback "$ROLLBACK_SHA" --lock-fd 9
}

transaction_abort_rollback_intent() {
  [ ! -e "$REMOTE_ROOT/.rollback-id.pending" ] || \
    node "$SCRIPT_DIR/production-release-retention.mjs" abort \
      --expected-active "$RELEASE_SHA" --expected-rollback "$ROLLBACK_SHA" --lock-fd 9
}

compose_current() {
  run_remote "cd $RELEASE_ROOT && XGS_RELEASE_ROOT=$RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$RELEASE_SHA docker compose --env-file $PROD_ENV -f $COMPOSE_FILE $1"
}

compose_embedding_current() {
  run_remote "cd $RELEASE_ROOT && XGS_RELEASE_ROOT=$RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $COMPOSE_FILE $1"
}

compose_scansci_auth_current() {
  run_remote "cd $RELEASE_ROOT && XGS_RELEASE_ROOT=$RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$RELEASE_SHA docker compose --profile scansci-auth --env-file $PROD_ENV -f $COMPOSE_FILE $1"
}

verify_scansci_current() {
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/verify-scansci-runtime.mjs' --release-root '$RELEASE_ROOT' --release-sha '$RELEASE_SHA' --compose-file '$COMPOSE_FILE' --service-token-file '$SCANSCI_SECRET_ROOT/scansci_service_token'"
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

log "=== 执行单一 SSH/flock 生产事务（release=$RELEASE_SHA rollback=$ROLLBACK_SHA）==="
acquire_production_deploy_lock
assert_production_deploy_lock
node "$PROJECT_ROOT/scripts/release-input-manifest.mjs" verify --root "$RELEASE_ROOT" --sha "$RELEASE_SHA"
# shellcheck source=production-deploy-transaction-state.sh
source "$SCRIPT_DIR/production-deploy-transaction-state.sh"
[ ! -e "$DEPLOY_JOURNAL" ] || {
  echo "错误：存在未恢复的 durable production transaction journal" >&2
  exit 75
}
[ ! -e "$REMOTE_ROOT/.release-failed" ] || {
  echo "错误：云上存在 .release-failed；必须先显式恢复并核验运行态" >&2
  exit 1
}
ACTIVE_RELEASE_SHA="$(cat "$REMOTE_ROOT/.release-id" 2>/dev/null || true)"
if [ -n "$ACTIVE_RELEASE_SHA" ] && [[ ! "$ACTIVE_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：云上 active release identity 非法" >&2
  exit 1
fi
[ -n "$ACTIVE_RELEASE_SHA" ] || {
  echo "错误：云上缺少 active release identity，拒绝猜测 rollback" >&2
  exit 66
}
[ "$ROLLBACK_SHA" = "$ACTIVE_RELEASE_SHA" ] || {
  echo "错误：rollback-ref 必须精确等于当前 active production release" >&2
  exit 66
}
node "$SCRIPT_DIR/production-release-retention.mjs" preflight \
  --expected-active "$ACTIVE_RELEASE_SHA" --lock-fd 9
run_remote "test -z \"\$(docker ps -aq --filter 'label=com.docker.compose.project=openscience-prod' --filter 'label=com.docker.compose.service=scansci-auth')\"" || {
  echo "错误：认证 helper 容器必须在生产部署前显式移除" >&2
  exit 66
}
BGE_M3_DEPLOY_VALUE="$(read_prod_value BGE_M3_DEPLOY)" || {
  echo "错误：BGE_M3_DEPLOY 必须且只能配置一次" >&2
  exit 66
}
case "$BGE_M3_DEPLOY_VALUE" in
  true) EMBEDDING_DEPLOY=1 ;;
  false) EMBEDDING_DEPLOY=0 ;;
  *) echo "错误：BGE_M3_DEPLOY 仅允许精确 true 或 false" >&2; exit 66 ;;
esac
BGE_M3_ENABLED_VALUE="$(read_prod_value BGE_M3_ENABLED)" || {
  echo "错误：BGE_M3_ENABLED 必须且只能配置一次" >&2
  exit 66
}
case "$BGE_M3_ENABLED_VALUE" in
  true) BGE_M3_ENABLED=1 ;;
  false) BGE_M3_ENABLED=0 ;;
  *) echo "错误：BGE_M3_ENABLED 仅允许精确 true 或 false" >&2; exit 66 ;;
esac
[ "$BGE_M3_ENABLED" -eq 0 ] || [ "$EMBEDDING_DEPLOY" -eq 1 ] || {
  echo "错误：BGE_M3_ENABLED=true 时必须同时设置 BGE_M3_DEPLOY=true" >&2
  exit 66
}
BGE_M3_MODEL_VERSION_ID=""
BGE_M3_MODEL_REVISION=""
BGE_M3_SOURCE_SHA256=""
BGE_M3_PACKAGE_FREEZE_SHA256=""
BGE_M3_MODEL_MANIFEST_SHA256=""
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  BGE_M3_MODEL_VERSION_ID="$(read_prod_value BGE_M3_MODEL_VERSION_ID)"
  BGE_M3_MODEL_REVISION="$(read_prod_value BGE_M3_MODEL_REVISION)"
  BGE_M3_SOURCE_SHA256="$(read_prod_value BGE_M3_SOURCE_SHA256)"
  BGE_M3_PACKAGE_FREEZE_SHA256="$(read_prod_value BGE_M3_PACKAGE_FREEZE_SHA256)"
  BGE_M3_MODEL_MANIFEST_SHA256="$(read_prod_value BGE_M3_MODEL_MANIFEST_SHA256)"
  require_match BGE_M3_MODEL_VERSION_ID "$BGE_M3_MODEL_VERSION_ID" '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  require_match BGE_M3_MODEL_REVISION "$BGE_M3_MODEL_REVISION" '^[0-9a-f]{40}$'
  require_match BGE_M3_SOURCE_SHA256 "$BGE_M3_SOURCE_SHA256" '^[0-9a-f]{64}$'
  require_match BGE_M3_PACKAGE_FREEZE_SHA256 "$BGE_M3_PACKAGE_FREEZE_SHA256" '^[0-9a-f]{64}$'
  require_match BGE_M3_MODEL_MANIFEST_SHA256 "$BGE_M3_MODEL_MANIFEST_SHA256" '^[0-9a-f]{64}$'
fi
verify_release_capability() {
  local file="$1"
  local schema embedding_deploy bge_m3_enabled model_version_id model_revision
  local source_sha256 package_freeze_sha256 model_manifest_sha256 scansci_deploy
  schema="$(read_capability_value "$file" schema)" || return
  embedding_deploy="$(read_capability_value "$file" embedding_deploy)" || return
  bge_m3_enabled="$(read_capability_value "$file" bge_m3_enabled)" || return
  model_version_id="$(read_capability_value "$file" model_version_id)" || return
  model_revision="$(read_capability_value "$file" model_revision)" || return
  source_sha256="$(read_capability_value "$file" source_sha256)" || return
  package_freeze_sha256="$(read_capability_value "$file" package_freeze_sha256)" || return
  model_manifest_sha256="$(read_capability_value "$file" model_manifest_sha256)" || return
  scansci_deploy="$(read_capability_value "$file" scansci_deploy)" || return
  [ "$schema" = 3 ]
  [ "$embedding_deploy" = "$BGE_M3_DEPLOY_VALUE" ]
  [ "$bge_m3_enabled" = "$BGE_M3_ENABLED_VALUE" ]
  [ "$model_version_id" = "$BGE_M3_MODEL_VERSION_ID" ]
  [ "$model_revision" = "$BGE_M3_MODEL_REVISION" ]
  [ "$source_sha256" = "$BGE_M3_SOURCE_SHA256" ]
  [ "$package_freeze_sha256" = "$BGE_M3_PACKAGE_FREEZE_SHA256" ]
  [ "$model_manifest_sha256" = "$BGE_M3_MODEL_MANIFEST_SHA256" ]
  [ "$scansci_deploy" = true ]
}
if [ "$ACTIVE_RELEASE_SHA" = "$RELEASE_SHA" ]; then
  same_sha_verification_failed() {
    local original_status=$?
    trap - ERR
    run_remote "set -e; printf 'active=%s\nfailed_at=%s\nreason=same-sha-verification\n' '$RELEASE_SHA' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > '$REMOTE_ROOT/.release-failed.next'; mv '$REMOTE_ROOT/.release-failed.next' '$REMOTE_ROOT/.release-failed'" || \
      echo "SAME_SHA_VERIFICATION_FAILED: unable to publish failure marker" >&2
    exit "$original_status"
  }
  trap 'same_sha_verification_failed' ERR
  transaction_verify_already_active_release
  trap - ERR
  log "already active: release=$RELEASE_SHA"
  exit 0
fi

PREVIOUS_RELEASE_SHA="$ACTIVE_RELEASE_SHA"
PREVIOUS_RELEASE_ROOT="/opt/openscience-releases/$PREVIOUS_RELEASE_SHA"
ROLLBACK_COMPOSE_FILE="$PREVIOUS_RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
ROLLBACK_COMPOSE_MODE="previous-release"
RELEASE_CAPABILITIES_DIR="$REMOTE_ROOT/.release-capabilities"
PREVIOUS_CAPABILITIES_FILE="$RELEASE_CAPABILITIES_DIR/$PREVIOUS_RELEASE_SHA"
PREVIOUS_HAS_EMBEDDING=0
PREVIOUS_HAS_SCANSCI=0
PREVIOUS_BGE_M3_ENABLED_VALUE=false
PREVIOUS_BGE_M3_MODEL_VERSION_ID=""
PREVIOUS_BGE_M3_MODEL_REVISION=""
PREVIOUS_BGE_M3_SOURCE_SHA256=""
PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256=""
PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256=""
run_remote "test \"\$(cat '$PREVIOUS_RELEASE_ROOT/.release-source')\" = '$PREVIOUS_RELEASE_SHA'"
run_remote "test -f '$ROLLBACK_COMPOSE_FILE'"
run_remote "docker image inspect openscience-agent-worker:$PREVIOUS_RELEASE_SHA openscience-document-parser:$PREVIOUS_RELEASE_SHA >/dev/null"
PREVIOUS_CAPABILITY_STATE="$(run_remote "set -euo pipefail; if [ -f '$PREVIOUS_CAPABILITIES_FILE' ]; then printf present; elif [ -e '$PREVIOUS_CAPABILITIES_FILE' ]; then exit 65; elif grep -q '^  embedding-worker:' '$ROLLBACK_COMPOSE_FILE'; then printf missing-with-embedding; else probe_status=\$?; if [ \"\$probe_status\" -eq 1 ]; then printf absent-no-embedding; else exit \"\$probe_status\"; fi; fi")" || {
  echo "错误：旧 release capability 探测失败，拒绝猜测回滚身份" >&2
  exit 66
}
case "$PREVIOUS_CAPABILITY_STATE" in
  present)
    PREVIOUS_CAPABILITY_SCHEMA="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" schema)"
    case "$PREVIOUS_CAPABILITY_SCHEMA" in
      1)
        # 兼容 embedding 上线前的 release：只接受明确 disabled；schema 1 的 enabled
        # 没有保存身份，不能安全回滚，必须拒绝。
        [ "$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" embedding)" = 0 ] || {
          echo "错误：旧 release 的 embedding capability 无完整身份，无法安全回滚" >&2
          exit 66
        }
        ;;
      2)
        PREVIOUS_EMBEDDING_DEPLOY_VALUE="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" embedding_deploy)"
        PREVIOUS_BGE_M3_ENABLED_VALUE="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" bge_m3_enabled)"
        PREVIOUS_BGE_M3_MODEL_VERSION_ID="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_version_id)"
        PREVIOUS_BGE_M3_MODEL_REVISION="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_revision)"
        PREVIOUS_BGE_M3_SOURCE_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" source_sha256)"
        PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" package_freeze_sha256)"
        PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_manifest_sha256)"
        case "$PREVIOUS_EMBEDDING_DEPLOY_VALUE" in true|false) ;; *) echo "错误：旧 release embedding_deploy 非法" >&2; exit 66 ;; esac
        case "$PREVIOUS_BGE_M3_ENABLED_VALUE" in true|false) ;; *) echo "错误：旧 release bge_m3_enabled 非法" >&2; exit 66 ;; esac
        if [ "$PREVIOUS_EMBEDDING_DEPLOY_VALUE" = true ]; then
          PREVIOUS_HAS_EMBEDDING=1
          require_match previous_model_version_id "$PREVIOUS_BGE_M3_MODEL_VERSION_ID" '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          require_match previous_model_revision "$PREVIOUS_BGE_M3_MODEL_REVISION" '^[0-9a-f]{40}$'
          require_match previous_source_sha256 "$PREVIOUS_BGE_M3_SOURCE_SHA256" '^[0-9a-f]{64}$'
          require_match previous_package_freeze_sha256 "$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256" '^[0-9a-f]{64}$'
          require_match previous_model_manifest_sha256 "$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256" '^[0-9a-f]{64}$'
          run_remote "grep -q '^  embedding-worker:' '$ROLLBACK_COMPOSE_FILE'"
          run_remote "docker image inspect openscience-embedding-worker:$PREVIOUS_RELEASE_SHA >/dev/null"
        elif [ "$PREVIOUS_BGE_M3_ENABLED_VALUE" = true ]; then
          echo "错误：旧 release enabled=true 但 embedding_deploy=false" >&2
          exit 66
        elif [ -n "$PREVIOUS_BGE_M3_MODEL_VERSION_ID$PREVIOUS_BGE_M3_MODEL_REVISION$PREVIOUS_BGE_M3_SOURCE_SHA256$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256" ]; then
          echo "错误：旧 release disabled capability 不得携带模型身份" >&2
          exit 66
        fi
        ;;
      3)
        PREVIOUS_EMBEDDING_DEPLOY_VALUE="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" embedding_deploy)"
        PREVIOUS_BGE_M3_ENABLED_VALUE="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" bge_m3_enabled)"
        PREVIOUS_BGE_M3_MODEL_VERSION_ID="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_version_id)"
        PREVIOUS_BGE_M3_MODEL_REVISION="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_revision)"
        PREVIOUS_BGE_M3_SOURCE_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" source_sha256)"
        PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" package_freeze_sha256)"
        PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" model_manifest_sha256)"
        PREVIOUS_SCANSCI_DEPLOY_VALUE="$(read_capability_value "$PREVIOUS_CAPABILITIES_FILE" scansci_deploy)"
        case "$PREVIOUS_EMBEDDING_DEPLOY_VALUE" in true|false) ;; *) echo "错误：旧 release embedding_deploy 非法" >&2; exit 66 ;; esac
        case "$PREVIOUS_BGE_M3_ENABLED_VALUE" in true|false) ;; *) echo "错误：旧 release bge_m3_enabled 非法" >&2; exit 66 ;; esac
        case "$PREVIOUS_SCANSCI_DEPLOY_VALUE" in true|false) ;; *) echo "错误：旧 release scansci_deploy 非法" >&2; exit 66 ;; esac
        if [ "$PREVIOUS_EMBEDDING_DEPLOY_VALUE" = true ]; then
          PREVIOUS_HAS_EMBEDDING=1
          require_match previous_model_version_id "$PREVIOUS_BGE_M3_MODEL_VERSION_ID" '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          require_match previous_model_revision "$PREVIOUS_BGE_M3_MODEL_REVISION" '^[0-9a-f]{40}$'
          require_match previous_source_sha256 "$PREVIOUS_BGE_M3_SOURCE_SHA256" '^[0-9a-f]{64}$'
          require_match previous_package_freeze_sha256 "$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256" '^[0-9a-f]{64}$'
          require_match previous_model_manifest_sha256 "$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256" '^[0-9a-f]{64}$'
          run_remote "grep -q '^  embedding-worker:' '$ROLLBACK_COMPOSE_FILE'"
          run_remote "docker image inspect openscience-embedding-worker:$PREVIOUS_RELEASE_SHA >/dev/null"
        elif [ "$PREVIOUS_BGE_M3_ENABLED_VALUE" = true ]; then
          echo "错误：旧 release enabled=true 但 embedding_deploy=false" >&2
          exit 66
        elif [ -n "$PREVIOUS_BGE_M3_MODEL_VERSION_ID$PREVIOUS_BGE_M3_MODEL_REVISION$PREVIOUS_BGE_M3_SOURCE_SHA256$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256" ]; then
          echo "错误：旧 release disabled capability 不得携带模型身份" >&2
          exit 66
        fi
        if [ "$PREVIOUS_SCANSCI_DEPLOY_VALUE" = true ]; then
          PREVIOUS_HAS_SCANSCI=1
          run_remote "grep -q '^  scansci-legal:' '$ROLLBACK_COMPOSE_FILE'"
          run_remote "docker image inspect openscience-scansci-legal:$PREVIOUS_RELEASE_SHA openscience-scansci-auth:$PREVIOUS_RELEASE_SHA >/dev/null"
        elif run_remote "grep -q '^  scansci-legal:' '$ROLLBACK_COMPOSE_FILE'"; then
          echo "错误：旧 release scansci_deploy=false 但 Compose 含 ScanSci 服务" >&2
          exit 66
        fi
        ;;
      *) echo "错误：旧 release capability schema 不受支持" >&2; exit 66 ;;
    esac
    ;;
  absent-no-embedding) ;;
  missing-with-embedding)
    echo "错误：旧 release 含 embedding 服务但 capability sidecar 缺失，拒绝猜测回滚身份" >&2
    exit 66
    ;;
  *) echo "错误：旧 release capability 探测返回未知状态" >&2; exit 66 ;;
esac
PREVIOUS_RUNTIME_ENV="BGE_M3_ENABLED=$PREVIOUS_BGE_M3_ENABLED_VALUE BGE_M3_MODEL_VERSION_ID=$PREVIOUS_BGE_M3_MODEL_VERSION_ID BGE_M3_MODEL_REVISION=$PREVIOUS_BGE_M3_MODEL_REVISION BGE_M3_SOURCE_SHA256=$PREVIOUS_BGE_M3_SOURCE_SHA256 BGE_M3_PACKAGE_FREEZE_SHA256=$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256 BGE_M3_MODEL_MANIFEST_SHA256=$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256"

log "[1] 锁内重验 immutable candidate source..."
assert_production_deploy_lock
node "$PROJECT_ROOT/scripts/release-input-manifest.mjs" verify --root "$RELEASE_ROOT" --sha "$RELEASE_SHA"
assert_production_deploy_lock

log "[2] install + 全量 build..."
run_remote "cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install --ignore-scripts --frozen-lockfile && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build"

log "[2a] 归一化验收运行闭包权限..."
assert_production_deploy_lock
/usr/bin/node "$PROJECT_ROOT/scripts/release-input-manifest.mjs" runtime-normalize --root "$RELEASE_ROOT" --sha "$RELEASE_SHA" >/dev/null \
  || { echo "错误：生产 build 后运行闭包权限归一化失败" >&2; exit 66; }
/usr/bin/node "$PROJECT_ROOT/scripts/release-input-manifest.mjs" verify --root "$RELEASE_ROOT" --sha "$RELEASE_SHA"
assert_production_deploy_lock

log "[2b] 构建 SHA-tagged release 镜像..."
compose_scansci_auth_current "build scansci-legal scansci-auth"
compose_current "build agent-worker document-parser"
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  compose_embedding_current "build embedding-worker"
fi

PARSER_ACCEPTANCE_REPORT="/opt/openscience-acceptance/document-parser/$RELEASE_SHA/report.json"
FINAL_WORKER_IMAGE_ID="$(run_remote "docker image inspect --format='{{.Id}}' openscience-agent-worker:$RELEASE_SHA")"
FINAL_PARSER_IMAGE_ID="$(run_remote "docker image inspect --format='{{.Id}}' openscience-document-parser:$RELEASE_SHA")"
FINAL_SCANSCI_IMAGE_ID="$(run_remote "docker image inspect --format='{{.Id}}' openscience-scansci-legal:$RELEASE_SHA")"
FINAL_SCANSCI_AUTH_IMAGE_ID="$(run_remote "docker image inspect --format='{{.Id}}' openscience-scansci-auth:$RELEASE_SHA")"
require_match final_worker_image_id "$FINAL_WORKER_IMAGE_ID" '^sha256:[0-9a-f]{64}$'
require_match final_parser_image_id "$FINAL_PARSER_IMAGE_ID" '^sha256:[0-9a-f]{64}$'
require_match final_scansci_image_id "$FINAL_SCANSCI_IMAGE_ID" '^sha256:[0-9a-f]{64}$'
require_match final_scansci_auth_image_id "$FINAL_SCANSCI_AUTH_IMAGE_ID" '^sha256:[0-9a-f]{64}$'

verify_candidate_switch_contract() {
  local stage="$1" current_active current_worker_image current_parser_image current_scansci_image current_scansci_auth_image
  current_active="$(run_remote "cat '$REMOTE_ROOT/.release-id'")"
  [[ "$current_active" =~ ^[0-9a-f]{40}$ ]] || {
    echo "错误：$stage 前 active release identity 非法" >&2
    return 1
  }
  [ "$current_active" = "$ROLLBACK_SHA" ] || {
    echo "错误：$stage 前 active release 已变化，拒绝使用 stale rollback" >&2
    return 1
  }
  run_remote "/usr/bin/node '$RELEASE_ROOT/scripts/release-input-manifest.mjs' verify --root '$RELEASE_ROOT' --sha '$RELEASE_SHA'"
  current_worker_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-agent-worker:$RELEASE_SHA")"
  current_parser_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-document-parser:$RELEASE_SHA")"
  current_scansci_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-scansci-legal:$RELEASE_SHA")"
  current_scansci_auth_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-scansci-auth:$RELEASE_SHA")"
  [ "$current_worker_image" = "$FINAL_WORKER_IMAGE_ID" ] || {
    echo "错误：$stage 前 Worker SHA tag 已被重定向" >&2
    return 1
  }
  [ "$current_parser_image" = "$FINAL_PARSER_IMAGE_ID" ] || {
    echo "错误：$stage 前 Parser SHA tag 已被重定向" >&2
    return 1
  }
  [ "$current_scansci_image" = "$FINAL_SCANSCI_IMAGE_ID" ] || {
    echo "错误：$stage 前 ScanSci SHA tag 已被重定向" >&2
    return 1
  }
  [ "$current_scansci_auth_image" = "$FINAL_SCANSCI_AUTH_IMAGE_ID" ] || {
    echo "错误：$stage 前 ScanSci auth SHA tag 已被重定向" >&2
    return 1
  }
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/production-deploy-lock.mjs' verify-state --active-sha '$current_active' --rollback-sha '$ROLLBACK_SHA' --accepted-worker-image-id '$FINAL_WORKER_IMAGE_ID' --accepted-parser-image-id '$FINAL_PARSER_IMAGE_ID' --current-worker-image-id '$current_worker_image' --current-parser-image-id '$current_parser_image'"
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/verify-document-parser-acceptance.mjs' --release-root '$RELEASE_ROOT' --report '$PARSER_ACCEPTANCE_REPORT' --source-sha '$RELEASE_SHA' --worker-image-id '$current_worker_image' --parser-image-id '$current_parser_image'"
}

verify_running_container_image() {
  local service="$1" expected="$2" container_id actual
  container_id="$(compose_current "ps -q $service")"
  [[ "$container_id" =~ ^[0-9a-f]{12,64}$ ]] || {
    echo "错误：$service 未解析到唯一运行容器" >&2
    return 1
  }
  actual="$(run_remote "docker inspect --format='{{.Image}}' '$container_id'")"
  [ "$actual" = "$expected" ] || {
    echo "错误：$service 实际容器镜像不等于正式验收镜像" >&2
    return 1
  }
}

verify_running_release_images() {
  local current_active current_worker_image current_parser_image worker_container parser_container
  local running_worker_image running_parser_image
  verify_candidate_switch_contract pre-publish
  current_active="$(run_remote "cat '$REMOTE_ROOT/.release-id'")"
  current_worker_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-agent-worker:$RELEASE_SHA")"
  current_parser_image="$(run_remote "docker image inspect --format='{{.Id}}' openscience-document-parser:$RELEASE_SHA")"
  worker_container="$(compose_current 'ps -q agent-worker')"
  parser_container="$(compose_current 'ps -q document-parser')"
  [[ "$worker_container" =~ ^[0-9a-f]{12,64}$ && "$parser_container" =~ ^[0-9a-f]{12,64}$ ]] || {
    echo "错误：Worker/Parser 运行容器身份非法" >&2
    return 1
  }
  running_worker_image="$(run_remote "docker inspect --format='{{.Image}}' '$worker_container'")"
  running_parser_image="$(run_remote "docker inspect --format='{{.Image}}' '$parser_container'")"
  [[ "$current_active" =~ ^[0-9a-f]{40}$
    && "$current_worker_image" =~ ^sha256:[0-9a-f]{64}$
    && "$current_parser_image" =~ ^sha256:[0-9a-f]{64}$
    && "$running_worker_image" =~ ^sha256:[0-9a-f]{64}$
    && "$running_parser_image" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "错误：切换后 release/image identity 非法" >&2
    return 1
  }
  run_remote "/usr/bin/node '$RELEASE_ROOT/infra/scripts/production-deploy-lock.mjs' verify-state --active-sha '$current_active' --rollback-sha '$ROLLBACK_SHA' --accepted-worker-image-id '$FINAL_WORKER_IMAGE_ID' --accepted-parser-image-id '$FINAL_PARSER_IMAGE_ID' --current-worker-image-id '$current_worker_image' --current-parser-image-id '$current_parser_image' --running-worker-image-id '$running_worker_image' --running-parser-image-id '$running_parser_image'"
}

transaction_assert_lock() { assert_production_deploy_lock; }
transaction_journal_start() { journal_start; }
transaction_journal_update() { journal_update "$1"; }
transaction_journal_clear() { journal_clear; }
transaction_journal_clear_after_rollback() {
  [ ! -e "$DEPLOY_JOURNAL" ] || journal_clear
}
transaction_restore_previous_scansci() {
  local exact_previous_sha="$1"
  [ "$exact_previous_sha" = "$PREVIOUS_RELEASE_SHA" ] || return 64
  run_remote "docker image inspect openscience-scansci-legal:$exact_previous_sha openscience-scansci-auth:$exact_previous_sha >/dev/null" || return
  run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$exact_previous_sha docker compose --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE up -d --force-recreate --wait --wait-timeout 300 scansci-legal" || return
  run_remote "/usr/bin/node '$PREVIOUS_RELEASE_ROOT/infra/scripts/verify-scansci-runtime.mjs' --release-root '$PREVIOUS_RELEASE_ROOT' --release-sha '$exact_previous_sha' --compose-file '$ROLLBACK_COMPOSE_FILE' --service-token-file '$SCANSCI_SECRET_ROOT/scansci_service_token'"
}
transaction_stop_candidate_scansci() {
  local exact_candidate_sha="$1"
  [ "$exact_candidate_sha" = "$RELEASE_SHA" ] || return 64
  compose_scansci_auth_current "rm -f -s scansci-auth"
  compose_current "rm -f -s scansci-legal scansci-secret-init"
  run_remote "set -euo pipefail; cd '$RELEASE_ROOT'; services=\$(XGS_RELEASE_ROOT='$RELEASE_ROOT' XGS_RELEASE_IMAGE_TAG='$RELEASE_SHA' docker compose --profile scansci-auth --env-file '$PROD_ENV' -f '$COMPOSE_FILE' ps --status running --services); for service in scansci-legal scansci-auth; do if printf '%s\n' \"\$services\" | grep -qx \"\$service\"; then exit 1; fi; done"
}
transaction_perform_application_rollback() {
  local rollback_ok=1 rollback_active
  rollback_active="$(run_remote "cat '$REMOTE_ROOT/.release-id' 2>/dev/null || true")"
  case "$rollback_active" in
    "$PREVIOUS_RELEASE_SHA"|"$RELEASE_SHA") ;;
    *)
      echo "ROLLBACK_FAILED_STALE_ACTIVE: active release is outside the locked deploy transition" >&2
      return 70
      ;;
  esac
  log "[回滚] 恢复 application release=$PREVIOUS_RELEASE_SHA"
  run_remote "test \"\$(cat '$PREVIOUS_RELEASE_ROOT/.release-source')\" = '$PREVIOUS_RELEASE_SHA'" || rollback_ok=0
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "docker image inspect openscience-agent-worker:$PREVIOUS_RELEASE_SHA openscience-document-parser:$PREVIOUS_RELEASE_SHA >/dev/null" || rollback_ok=0
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then compose_embedding_current "stop embedding-worker" || true; fi
    if [ "$PREVIOUS_HAS_EMBEDDING" -eq 1 ]; then
      run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE up -d --force-recreate --wait --wait-timeout 900 embedding-worker" || rollback_ok=0
      if [ "$rollback_ok" -eq 1 ]; then
        run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs" || rollback_ok=0
      fi
    fi
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    transaction_restore_scansci_rollback "$PREVIOUS_HAS_SCANSCI" "$PREVIOUS_RELEASE_SHA" "$RELEASE_SHA" || rollback_ok=0
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE up -d --force-recreate --wait --wait-timeout 300 document-parser api web agent-worker" || rollback_ok=0
  fi
  if [ "$rollback_ok" -eq 1 ]; then
    run_remote "install -m 0644 $PREVIOUS_RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF && nginx -t && systemctl reload nginx" || rollback_ok=0
  fi

  if [ "$rollback_ok" -ne 1 ]; then
    run_remote "set -e; rm -f $REMOTE_ROOT/.release-id; printf 'candidate=%s\nprevious=%s\ncompose_mode=%s\nfailed_at=%s\n' '$RELEASE_SHA' '$PREVIOUS_RELEASE_SHA' '$ROLLBACK_COMPOSE_MODE' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > $REMOTE_ROOT/.release-failed.next; mv $REMOTE_ROOT/.release-failed.next $REMOTE_ROOT/.release-failed" || \
      echo "ROLLBACK_FAILED_IDENTITY_UNSAFE: unable to guarantee removal of release identity" >&2
    echo "ROLLBACK_FAILED: release identity withdrawn; inspect $REMOTE_ROOT/.release-failed" >&2
    return 70
  fi
  run_remote "set -e; /usr/bin/node '$RELEASE_ROOT/infra/scripts/production-deploy-lock.mjs' cas-active --marker '$REMOTE_ROOT/.release-id' --expected '$rollback_active' --next '$PREVIOUS_RELEASE_SHA' --lock-fd 9; rm -f $REMOTE_ROOT/.release-failed" || {
    run_remote "set -e; rm -f $REMOTE_ROOT/.release-id; printf 'candidate=%s\nprevious=%s\ncompose_mode=%s\nfailed_at=%s\nreason=marker-update\n' '$RELEASE_SHA' '$PREVIOUS_RELEASE_SHA' '$ROLLBACK_COMPOSE_MODE' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > $REMOTE_ROOT/.release-failed.next; mv $REMOTE_ROOT/.release-failed.next $REMOTE_ROOT/.release-failed" || \
      echo "ROLLBACK_FAILED_IDENTITY_UNSAFE: unable to guarantee removal of release identity" >&2
    echo "ROLLBACK_FAILED: recovery healthy but release identity was withdrawn" >&2
    return 70
  }
  return 0
}

transaction_initialize_state
transaction_install_traps

verify_candidate_switch_contract post-build
transaction_begin

if [ "$SKIP_MIGRATE" -ne 1 ]; then
  transaction_mark_phase migrating
  run_remote "grep -q '^SEARCH_DATABASE_URL=.' $PROD_ENV" || {
    echo "错误：生产环境缺少 SEARCH_DATABASE_URL，拒绝把搜索索引写入核心数据库" >&2
    exit 66
  }
  log "[2c] 验证核心库/搜索库物理隔离..."
  compose_current "run --rm --no-deps -T -w /opt/openscience api node scripts/verify-database-isolation.mjs"
  log "[3] 迁移 deploy..."
  compose_current "run --rm --no-deps -T -w /opt/openscience api node packages/database/dist/migrate-cli.js deploy"
  log "[3b] 搜索库迁移 deploy..."
  compose_current "run --rm --no-deps -T -w /opt/openscience api node node_modules/prisma/build/index.js migrate deploy --schema /opt/openscience/infra/search/schema.prisma"
  compose_current "run --rm --no-deps -T -w /opt/openscience api node node_modules/prisma/build/index.js migrate status --schema /opt/openscience/infra/search/schema.prisma"
  log "[3c] search migration status=2/2"
  log "[4] seed-quota..."
  compose_current "run --rm --no-deps -T -w /opt/openscience api node scripts/seed-quota.mjs --confirm"
  transaction_complete_migration
fi

verify_candidate_switch_contract pre-switch
transaction_mark_phase switching
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  log "[5] 初始化并验证 BGE-M3 模型卷..."
  compose_embedding_current "up -d --force-recreate --wait --wait-timeout 900 embedding-worker"
  compose_embedding_current "run --rm --no-deps -T --entrypoint python embedding-worker /app/model-init.py --validate --seed /opt/bge-m3-seed --target /models/bge-m3"
  compose_embedding_current "run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs"
  log "[5a] embedding model manifest and runtime identity verified"
else
  log "[5] BGE-M3 deploy disabled; model image/service untouched"
fi

log "[5b] Parser 先行并等待 healthy..."
verify_candidate_switch_contract pre-parser-switch
compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"
verify_running_container_image document-parser "$FINAL_PARSER_IMAGE_ID"

log "[5c] 切换 API/Web/Worker 并等待 healthy..."
log "[5c] ScanSci 先行并验证 source/policy/session/runtime..."
verify_candidate_switch_contract pre-scansci-switch
compose_current "up -d --force-recreate --wait --wait-timeout 300 scansci-legal"
verify_running_container_image scansci-legal "$FINAL_SCANSCI_IMAGE_ID"
verify_scansci_current

log "[5d] 切换 API/Web/Worker 并等待 healthy..."
verify_candidate_switch_contract pre-worker-switch
compose_current "up -d --force-recreate --wait --wait-timeout 300 api web agent-worker"
verify_running_container_image agent-worker "$FINAL_WORKER_IMAGE_ID"
verify_running_container_image document-parser "$FINAL_PARSER_IMAGE_ID"
wait_for_healthy api web agent-worker
verify_scansci_current
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  log "[5d] 切换后再次验证 embedding 健康、身份与真实向量..."
  compose_embedding_current "ps --status running --services | grep -qx embedding-worker"
  compose_embedding_current "run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs"
fi
verify_running_release_images

log "[6] 切换 nginx 与 release identity..."
run_remote "set -e; backup=${NGINX_CONF}.pre-deploy-\$(date +%Y%m%d%H%M%S); cp -p $NGINX_CONF \$backup; install -m 0644 $RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF; if ! nginx -t; then cp -p \$backup $NGINX_CONF; nginx -t; exit 1; fi; systemctl reload nginx"
run_remote "set -e; install -d -m 0755 '$RELEASE_CAPABILITIES_DIR'; printf 'schema=3\nembedding_deploy=%s\nbge_m3_enabled=%s\nmodel_version_id=%s\nmodel_revision=%s\nsource_sha256=%s\npackage_freeze_sha256=%s\nmodel_manifest_sha256=%s\nscansci_deploy=true\n' '$BGE_M3_DEPLOY_VALUE' '$BGE_M3_ENABLED_VALUE' '$BGE_M3_MODEL_VERSION_ID' '$BGE_M3_MODEL_REVISION' '$BGE_M3_SOURCE_SHA256' '$BGE_M3_PACKAGE_FREEZE_SHA256' '$BGE_M3_MODEL_MANIFEST_SHA256' > '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next'; chmod 0644 '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next'; mv '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next' '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA'; /usr/bin/node '$RELEASE_ROOT/infra/scripts/production-deploy-lock.mjs' cas-active --marker '$REMOTE_ROOT/.release-id' --expected '$ROLLBACK_SHA' --next '$RELEASE_SHA' --lock-fd 9"
transaction_mark_phase published
run_remote "test -f $HTPASSWD || echo 'WARN: $HTPASSWD 不存在——首次需手动生成（见 runbook）'"

log "[7] 公网与精确 release 验收..."
expect_http_status https://OpenScience.428312321.xyz/ 200
expect_http_status https://OpenScience.428312321.xyz/auth/me 401
expect_http_status https://OpenScience.428312321.xyz/admin/ 401
expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"
if [ "$EMBEDDING_DEPLOY" -eq 0 ] && [ "$PREVIOUS_HAS_EMBEDDING" -eq 1 ]; then
  log "[7a] 公网验收后停止上一 release 的 embedding-worker..."
  run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE stop embedding-worker"
fi
run_remote "rm -f $REMOTE_ROOT/.release-failed"

# 只有新 release 已从公网确认后，才以同目录 rename 原子替换定时任务脚本；
# install/bash -n 任一步失败都不会破坏当前可执行文件。
run_remote "set -e; install -m 0755 $RELEASE_ROOT/infra/scripts/backup.sh /usr/local/bin/backup.sh.next; bash -n /usr/local/bin/backup.sh.next; mv /usr/local/bin/backup.sh.next /usr/local/bin/backup.sh"

node "$SCRIPT_DIR/production-release-retention.mjs" prepare \
  --expected-active "$RELEASE_SHA" --expected-rollback "$PREVIOUS_RELEASE_SHA" --lock-fd 9
transaction_commit
node "$SCRIPT_DIR/production-release-retention.mjs" complete \
  --expected-active "$RELEASE_SHA" --expected-rollback "$PREVIOUS_RELEASE_SHA" --lock-fd 9 || {
    status=$?
    echo "DEPLOY_COMMITTED_RETENTION_PENDING: release=$RELEASE_SHA rollback=$PREVIOUS_RELEASE_SHA" >&2
    exit "$status"
  }
exec 9>&-
log "=== 部署完成（release=$RELEASE_SHA rollback=$PREVIOUS_RELEASE_SHA）==="
