#!/usr/bin/env bash
# deploy.sh — 单 ECS 部署（P1A-9 填充）。
#
# 部署纪律（Spec §20.5）：
#   - 部署必须通过本仓库脚本 + CI/CD 完成，禁止手工在服务器上改代码；
#   - 部署属"询问"级操作：默认 dry-run 打印计划，`--confirm` 才执行；
#   - 不给 Agent 通用服务器写权限（只读巡检走 checkup.sh）。
#
# 详细步骤见 docs/runbooks/deployment.md。
#
# 用法:
#   deploy.sh <release-ref>                     # dry-run：打印计划不执行
#   deploy.sh --confirm <release-ref>           # 执行（询问级，用户确认）
#   deploy.sh --confirm --skip-build <ref>      # 跳过 build（已构建过）
#   deploy.sh --confirm --skip-migrate <ref>    # 跳过迁移/seed
#
# ECS 规格/带宽 §24 待确认：端口/路径/保留轮数全变量，不写死。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_ROOT="${XGS_CONFIG_ROOT:-$PROJECT_ROOT}"
ENV_FILE="$CONFIG_ROOT/.env"

# --- 参数解析 ---
CONFIRM=0
SKIP_BUILD=0
SKIP_MIGRATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --confirm) CONFIRM=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    -*) echo "未知参数: $1" >&2; exit 64 ;;
    *) RELEASE_REF="$1"; shift ;;
  esac
done
[ -n "${RELEASE_REF:-}" ] || { echo "用法: deploy.sh [--confirm] [--skip-build] [--skip-migrate] <release-ref>" >&2; exit 64; }

# --- 前置：release-ref 存在 ---
git rev-parse --verify "$RELEASE_REF^{commit}" >/dev/null 2>&1 \
  || { echo "错误：release-ref '$RELEASE_REF' 不存在" >&2; exit 66; }

# --- 从 .env 读取服务器连接（只取值，绝不打印）---
[ -f "$ENV_FILE" ] || { echo "错误：未找到 .env（$ENV_FILE）" >&2; exit 66; }
read_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}
pick() {
  local v
  for k in "$@"; do v="$(read_env "$k")"; if [ -n "$v" ]; then printf '%s' "$v"; return 0; fi; done
  return 1
}
SSH_HOST="$(pick SERVER_HOST SSH_HOST 公网ip)" || { echo "错误：.env 缺少服务器地址" >&2; exit 66; }
SSH_USER="$(pick SERVER_USER SSH_USER 用户名)" || { echo "错误：.env 缺少用户名" >&2; exit 66; }
SSH_PORT="$(pick SERVER_PORT SSH_PORT SSH端口 || true)"; SSH_PORT="${SSH_PORT:-22}"
SSH_KEY="$HOME/.ssh/id_ed25519_xgs"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=20 -i "$SSH_KEY" -p "$SSH_PORT")

run_remote() {
  # run_remote "<cmd>" —— 经 ssh 执行远端命令
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$1"
}

wait_for_healthy() {
  local services=("$@")
  run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE up -d --wait --wait-timeout 300 ${services[*]}"
}

expect_http_status() {
  local url="$1"
  local expected="$2"
  run_remote "actual=\$(curl -sS -o /dev/null -w '%{http_code}' '$url'); test \"\$actual\" = '$expected'"
}

# --- 参数化（§24 待确认项，改一处即可）---
REMOTE_ROOT="/opt/openscience"
PROD_ENV="$REMOTE_ROOT/.env.prod"
COMPOSE_FILE="$REMOTE_ROOT/infra/compose/docker-compose.prod.yml"
NGINX_CONF="/etc/nginx/conf.d/openscience.conf"
HTPASSWD="/etc/nginx/.htpasswd-admin"
DUMP_DIR="/var/backups/openscience"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"

# --- 计划打印（dry-run 核心）---
log() { printf '%s\n' "$*"; }
plan() { log "  [计划] $*"; }
step() { log "  [执行] $*"; }

log "=== OpenScience 部署计划 ===  release=$RELEASE_REF  host=$SSH_HOST"
log "目标：同步→build→迁移→seed→生产栈→nginx 反代→验证"

if [ "$CONFIRM" -ne 1 ]; then
  log ""
  log "DRY-RUN：以下步骤将执行，--confirm 后实际执行："
  plan "1. 同步代码：tar-over-ssh → $REMOTE_ROOT（排除 .env/.git/node_modules/dist）"
  [ "$SKIP_BUILD" -eq 1 ] || plan "2. install + 全量 build（跨包 import 需全量）"
  [ "$SKIP_MIGRATE" -eq 1 ] || plan "3. migrate deploy + status 验证"
  [ "$SKIP_MIGRATE" -eq 1 ] || plan "4. seed-quota --confirm（幂等）"
  plan "5. 重建 agent-worker/document-parser 镜像并收敛生产栈"
  plan "5b. parser 先行并硬等待 healthy；再收敛全栈，重启 bind-mounted api/web/agent-worker"
  plan "6. nginx：$NGINX_CONF 部署（nginx -t + reload）+ htpasswd-admin（首次）"
  plan "7. 验证：curl /auth/me 401、/admin basic_auth、安全头"
  exit 0
fi

log "=== 执行部署（--confirm）==="

# 1. 同步（复用 cloud-sync 逻辑：tar 流式经 ssh）
log "[1] 同步代码..."
XGS_SOURCE_ROOT="$PROJECT_ROOT" XGS_CONFIG_ROOT="$CONFIG_ROOT" node "$PROJECT_ROOT/scripts/cloud-sync.mjs" || { echo "同步失败" >&2; exit 1; }

# 2. build
if [ "$SKIP_BUILD" -ne 1 ]; then
  log "[2] install + 全量 build..."
  run_remote "cd $REMOTE_ROOT && npx pnpm@9.15.0 install && npx pnpm@9.15.0 build" || exit 1
fi

# 3. 迁移
if [ "$SKIP_MIGRATE" -ne 1 ]; then
  log "[3] 迁移 deploy..."
  run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE exec -T -e DATABASE_URL=\$(grep '^DATABASE_URL=' $PROD_ENV | cut -d= -f2-) -w $REMOTE_ROOT api node packages/database/dist/migrate-cli.js deploy" || exit 1
  # seed 占位值（幂等）
  log "[4] seed-quota..."
  run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE exec -T -e DATABASE_URL=\$(grep '^DATABASE_URL=' $PROD_ENV | cut -d= -f2-) -w $REMOTE_ROOT api node scripts/seed-quota.mjs --confirm" || exit 1
fi

# 4. 生产栈
log "[5] 生产栈 up..."
run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE build agent-worker document-parser" || exit 1
run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE up -d --wait --wait-timeout 300 document-parser" || exit 1
wait_for_healthy || exit 1

# 源码与构建产物通过 bind mount 同步到长期运行的容器。Compose 配置未变化时，
# `up -d` 不会重启这些进程，因此显式重启应用服务以切换到本次 release；数据服务保持运行。
log "[5b] 重启 bind-mounted api/web/agent-worker 并重新等待应用健康..."
run_remote "cd $REMOTE_ROOT && docker compose --env-file $PROD_ENV -f $COMPOSE_FILE restart api web agent-worker" || exit 1
wait_for_healthy api web agent-worker || exit 1

# 5. nginx 反代 + /admin basic_auth（P1A-8）
log "[6] nginx 反代部署..."
run_remote "set -e; backup=${NGINX_CONF}.pre-deploy-\$(date +%Y%m%d%H%M%S); cp -p $NGINX_CONF \$backup; install -m 0644 $REMOTE_ROOT/infra/nginx/openscience.conf $NGINX_CONF; if ! nginx -t; then cp -p \$backup $NGINX_CONF; nginx -t; exit 1; fi"
# htpasswd 首次生成（无则提示用户手动；含敏感密码不入脚本）
run_remote "test -f $HTPASSWD || echo 'WARN: $HTPASSWD 不存在——首次需手动生成（见 runbook）'"
run_remote "systemctl reload nginx" || exit 1

# 6. 验证
log "[7] 验证..."
expect_http_status https://OpenScience.428312321.xyz/ 200
expect_http_status https://OpenScience.428312321.xyz/auth/me 401
expect_http_status https://OpenScience.428312321.xyz/admin/ 401

log "=== 部署完成（release=$RELEASE_REF）==="
