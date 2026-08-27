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

compose_embedding_current() {
  run_remote "cd $RELEASE_ROOT && XGS_RELEASE_ROOT=$RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $COMPOSE_FILE $1"
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
  local source_sha256 package_freeze_sha256 model_manifest_sha256
  schema="$(read_capability_value "$file" schema)" || return
  embedding_deploy="$(read_capability_value "$file" embedding_deploy)" || return
  bge_m3_enabled="$(read_capability_value "$file" bge_m3_enabled)" || return
  model_version_id="$(read_capability_value "$file" model_version_id)" || return
  model_revision="$(read_capability_value "$file" model_revision)" || return
  source_sha256="$(read_capability_value "$file" source_sha256)" || return
  package_freeze_sha256="$(read_capability_value "$file" package_freeze_sha256)" || return
  model_manifest_sha256="$(read_capability_value "$file" model_manifest_sha256)" || return
  [ "$schema" = 2 ]
  [ "$embedding_deploy" = "$BGE_M3_DEPLOY_VALUE" ]
  [ "$bge_m3_enabled" = "$BGE_M3_ENABLED_VALUE" ]
  [ "$model_version_id" = "$BGE_M3_MODEL_VERSION_ID" ]
  [ "$model_revision" = "$BGE_M3_MODEL_REVISION" ]
  [ "$source_sha256" = "$BGE_M3_SOURCE_SHA256" ]
  [ "$package_freeze_sha256" = "$BGE_M3_PACKAGE_FREEZE_SHA256" ]
  [ "$model_manifest_sha256" = "$BGE_M3_MODEL_MANIFEST_SHA256" ]
}
if [ -n "$ACTIVE_RELEASE_SHA" ] && [[ ! "$ACTIVE_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "错误：云上 active release identity 非法" >&2
  exit 1
fi
if [ -z "$ACTIVE_RELEASE_SHA" ]; then
  run_remote "set -euo pipefail; containers=\$(docker ps -aq); if [ -n \"\$containers\" ]; then mounts=\$(docker inspect --format='{{range .Mounts}}{{println .Source}}{{end}}' \$containers); if printf '%s\n' \"\$mounts\" | grep -q '^/opt/openscience-releases/'; then echo 'versioned release mounts exist without .release-id' >&2; exit 1; fi; fi"
fi

if [ "$ACTIVE_RELEASE_SHA" = "$RELEASE_SHA" ]; then
  same_sha_verification_failed() {
    local original_status=$?
    trap - ERR
    run_remote "set -e; printf 'active=%s\nfailed_at=%s\nreason=same-sha-verification\n' '$RELEASE_SHA' \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > '$REMOTE_ROOT/.release-failed.next'; mv '$REMOTE_ROOT/.release-failed.next' '$REMOTE_ROOT/.release-failed'" || \
      echo "SAME_SHA_VERIFICATION_FAILED: unable to publish failure marker" >&2
    exit "$original_status"
  }
  trap 'same_sha_verification_failed' ERR
  run_remote "test \"\$(cat '$RELEASE_ROOT/.release-source')\" = '$RELEASE_SHA'"
  verify_release_capability "$REMOTE_ROOT/.release-capabilities/$RELEASE_SHA"
  if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
    compose_embedding_current "ps --status running --services | grep -qx embedding-worker"
    compose_embedding_current "run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs"
  fi
  expect_http_status https://OpenScience.428312321.xyz/ 200
  expect_http_status https://OpenScience.428312321.xyz/auth/me 401
  expect_http_status https://OpenScience.428312321.xyz/admin/ 401
  expect_http_body https://OpenScience.428312321.xyz/__release "$RELEASE_SHA"
  if [ "$EMBEDDING_DEPLOY" -eq 0 ]; then
    log "same-SHA disabled：收敛残留 embedding-worker..."
    compose_embedding_current "stop embedding-worker"
    run_remote "set -euo pipefail; cd '$RELEASE_ROOT'; services=\$(XGS_RELEASE_ROOT='$RELEASE_ROOT' XGS_RELEASE_IMAGE_TAG='$RELEASE_SHA' docker compose --profile embedding --env-file '$PROD_ENV' -f '$COMPOSE_FILE' ps --status running --services); if printf '%s\n' \"\$services\" | grep -qx embedding-worker; then exit 1; fi"
  fi
  trap - ERR
  log "already active: release=$RELEASE_SHA"
  exit 0
fi

PREVIOUS_RELEASE_SHA="${ACTIVE_RELEASE_SHA:-$ROLLBACK_SHA}"
PREVIOUS_RELEASE_ROOT="/opt/openscience-releases/$PREVIOUS_RELEASE_SHA"
ROLLBACK_COMPOSE_FILE="$PREVIOUS_RELEASE_ROOT/infra/compose/docker-compose.prod.yml"
ROLLBACK_COMPOSE_MODE="previous-release"
RELEASE_CAPABILITIES_DIR="$REMOTE_ROOT/.release-capabilities"
PREVIOUS_CAPABILITIES_FILE="$RELEASE_CAPABILITIES_DIR/$PREVIOUS_RELEASE_SHA"
PREVIOUS_HAS_EMBEDDING=0
PREVIOUS_BGE_M3_ENABLED_VALUE=false
PREVIOUS_BGE_M3_MODEL_VERSION_ID=""
PREVIOUS_BGE_M3_MODEL_REVISION=""
PREVIOUS_BGE_M3_SOURCE_SHA256=""
PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256=""
PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256=""
if [ -n "$ACTIVE_RELEASE_SHA" ]; then
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
PREVIOUS_RUNTIME_ENV="BGE_M3_ENABLED=$PREVIOUS_BGE_M3_ENABLED_VALUE BGE_M3_MODEL_VERSION_ID=$PREVIOUS_BGE_M3_MODEL_VERSION_ID BGE_M3_MODEL_REVISION=$PREVIOUS_BGE_M3_MODEL_REVISION BGE_M3_SOURCE_SHA256=$PREVIOUS_BGE_M3_SOURCE_SHA256 BGE_M3_PACKAGE_FREEZE_SHA256=$PREVIOUS_BGE_M3_PACKAGE_FREEZE_SHA256 BGE_M3_MODEL_MANIFEST_SHA256=$PREVIOUS_BGE_M3_MODEL_MANIFEST_SHA256"

log "[1] 物化完整 Git release..."
XGS_SOURCE_ROOT="$PROJECT_ROOT" XGS_CONFIG_ROOT="$CONFIG_ROOT" XGS_RELEASE_SHA="$RELEASE_SHA" node "$PROJECT_ROOT/scripts/cloud-sync.mjs"

log "[2] install + 全量 build..."
run_remote "cd $RELEASE_ROOT && with-proxy npx pnpm@9.15.0 install && with-proxy npx pnpm@9.15.0 --filter @openscience/database generate && with-proxy npx pnpm@9.15.0 build"

log "[2b] 构建 SHA-tagged release 镜像..."
compose_current "build agent-worker document-parser"
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  compose_embedding_current "build embedding-worker"
fi

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
    if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then compose_embedding_current "stop embedding-worker" || true; fi
    if [ "$PREVIOUS_HAS_EMBEDDING" -eq 1 ]; then
      run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE up -d --force-recreate --wait --wait-timeout 900 embedding-worker" || rollback_ok=0
      if [ "$rollback_ok" -eq 1 ]; then
        run_remote "cd $PREVIOUS_RELEASE_ROOT && env $PREVIOUS_RUNTIME_ENV XGS_RELEASE_ROOT=$PREVIOUS_RELEASE_ROOT XGS_RELEASE_IMAGE_TAG=$PREVIOUS_RELEASE_SHA docker compose --profile embedding --env-file $PROD_ENV -f $ROLLBACK_COMPOSE_FILE run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs" || rollback_ok=0
      fi
    fi
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
fi

SWITCH_STARTED=1
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
compose_current "up -d --force-recreate --wait --wait-timeout 300 document-parser"

log "[5c] 切换 API/Web/Worker 并等待 healthy..."
compose_current "up -d --force-recreate --wait --wait-timeout 300 api web agent-worker"
wait_for_healthy api web agent-worker
if [ "$EMBEDDING_DEPLOY" -eq 1 ]; then
  log "[5d] 切换后再次验证 embedding 健康、身份与真实向量..."
  compose_embedding_current "ps --status running --services | grep -qx embedding-worker"
  compose_embedding_current "run --rm --no-deps -T -w /opt/openscience agent-worker node scripts/verify-embedding-runtime.mjs"
fi

log "[6] 切换 nginx 与 release identity..."
run_remote "set -e; backup=${NGINX_CONF}.pre-deploy-\$(date +%Y%m%d%H%M%S); cp -p $NGINX_CONF \$backup; install -m 0644 $RELEASE_ROOT/infra/nginx/openscience.conf $NGINX_CONF; if ! nginx -t; then cp -p \$backup $NGINX_CONF; nginx -t; exit 1; fi; systemctl reload nginx"
run_remote "set -e; install -d -m 0755 '$RELEASE_CAPABILITIES_DIR'; printf 'schema=2\nembedding_deploy=%s\nbge_m3_enabled=%s\nmodel_version_id=%s\nmodel_revision=%s\nsource_sha256=%s\npackage_freeze_sha256=%s\nmodel_manifest_sha256=%s\n' '$BGE_M3_DEPLOY_VALUE' '$BGE_M3_ENABLED_VALUE' '$BGE_M3_MODEL_VERSION_ID' '$BGE_M3_MODEL_REVISION' '$BGE_M3_SOURCE_SHA256' '$BGE_M3_PACKAGE_FREEZE_SHA256' '$BGE_M3_MODEL_MANIFEST_SHA256' > '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next'; chmod 0644 '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next'; mv '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA.next' '$RELEASE_CAPABILITIES_DIR/$RELEASE_SHA'; printf '%s\n' '$RELEASE_SHA' > $REMOTE_ROOT/.release-id.next; mv $REMOTE_ROOT/.release-id.next $REMOTE_ROOT/.release-id"
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

trap - ERR
log "=== 部署完成（release=$RELEASE_SHA rollback=$PREVIOUS_RELEASE_SHA）==="
