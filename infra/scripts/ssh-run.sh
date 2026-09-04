#!/usr/bin/env bash
# ssh-run.sh — 在 OpenScience 生产 ECS 上执行单条远程命令（仅 SSH 密钥认证）。
#
# 用法:
#   ssh-run.sh "<remote command>"        # 只读/普通命令
#   ssh-run.sh --confirm "<command>"     # 危险命令（黑名单命中）必须显式确认
#
# 安全设计:
#   - BatchMode=yes：不处理密码。无密钥登录时明确报错"请配置 SSH 密钥"。
#   - 凭据仅从 .env 读取，绝不 echo/打印任何键值。
#   - 危险命令黑名单（rm|mv|dd|mkfs|shutdown|reboot|systemctl stop|disable）
#     带单词边界匹配，需 --confirm 才放行；`systemctl status` 等只读命令不受影响。
#
# .env 键名（英文键优先，中文键兜底，实测于 2026-07-24）:
#   host: SERVER_HOST / SSH_HOST  ← 公网ip
#   user: SERVER_USER / SSH_USER  ← 用户名
#   port: SERVER_PORT / SSH_PORT  ← SSH端口

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

usage() {
  echo "用法: $0 [--confirm] \"<remote command>\"" >&2
  exit 64
}

# --- 参数解析 ---
CONFIRM=0
if [ "${1:-}" = "--confirm" ]; then
  CONFIRM=1
  shift
fi
[ $# -eq 1 ] || usage
REMOTE_CMD="$1"

# --- 危险命令黑名单（单词边界匹配，避免误伤 systemctl status 等只读命令）---
is_dangerous() {
  local cmd="$1"
  # 独立危险命令：rm / mv / dd / mkfs / shutdown / reboot
  if printf '%s' "$cmd" | grep -qE '(^|[^A-Za-z0-9_])(rm|mv|dd|mkfs|shutdown|reboot)([^A-Za-z0-9_]|$)'; then
    return 0
  fi
  # systemctl stop / disable（status/is-active/restart 之外的写操作按此扩展）
  if printf '%s' "$cmd" | grep -qE '(^|[^A-Za-z0-9_])systemctl[[:space:]]+(stop|disable)([^A-Za-z0-9_]|$)'; then
    return 0
  fi
  return 1
}

if is_dangerous "$REMOTE_CMD" && [ "$CONFIRM" -ne 1 ]; then
  echo "拒绝执行：该命令命中危险命令黑名单。" >&2
  echo "如确需执行，请加 --confirm 重试（属 Spec §20.5 '询问' 级操作，需用户确认）。" >&2
  exit 65
fi

# --- 从 .env 读取服务器连接信息（只取值，绝不打印）---
[ -f "$ENV_FILE" ] || { echo "错误：未找到 .env（$ENV_FILE）" >&2; exit 66; }

read_env() {
  # read_env <key>：输出 .env 中该键的值（去引号/CR），调用方不得回显
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- \
    | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# 英文键优先，中文键兜底（.env 为 UTF-8，中文键可可靠匹配）
pick() {
  # pick <key1> <key2> ... ：返回第一个非空值
  local k v
  for k in "$@"; do
    v="$(read_env "$k")"
    if [ -n "$v" ]; then printf '%s' "$v"; return 0; fi
  done
  return 1
}

SSH_HOST="$(pick SERVER_HOST SSH_HOST 公网ip)" || { echo "错误：.env 缺少服务器地址键（SERVER_HOST/SSH_HOST/公网ip）" >&2; exit 66; }
SSH_USER="$(pick SERVER_USER SSH_USER 用户名)" || { echo "错误：.env 缺少用户名键（SERVER_USER/SSH_USER/用户名）" >&2; exit 66; }
SSH_PORT="$(pick SERVER_PORT SSH_PORT SSH端口 || true)"
SSH_PORT="${SSH_PORT:-22}"

# --- 执行（BatchMode：无密钥即失败，绝不提示密码）---
SSH_ERR="$(mktemp)"
trap 'rm -f "$SSH_ERR"' EXIT

set +e
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -p "$SSH_PORT")
[ -z "${XGS_SSH_KEY:-}" ] || SSH_OPTS+=(-i "$XGS_SSH_KEY")
if [ -n "${XGS_SSH_KNOWN_HOSTS:-}" ]; then
  [[ "$XGS_SSH_KNOWN_HOSTS" != *[\"$'\r\n']* ]] || { echo "错误：known_hosts 路径无效" >&2; exit 64; }
  SSH_OPTS+=(-o "UserKnownHostsFile=\"$XGS_SSH_KNOWN_HOSTS\"" -o StrictHostKeyChecking=yes)
fi
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$REMOTE_CMD" 2>"$SSH_ERR"
rc=$?
set -e

if [ $rc -ne 0 ]; then
  if [ $rc -eq 255 ] \
    && grep -qiE 'permission denied \((publickey|password|keyboard-interactive)(,[^)]*)?\)|host key verification failed|no supported authentication methods available' "$SSH_ERR"; then
    echo "SSH 认证失败：请配置 SSH 密钥，本脚本不处理密码。" >&2
  else
    echo "远程命令失败（exit=$rc）：" >&2
    # 仅透传远端 stderr（服务端输出，不含本地凭据）
    cat "$SSH_ERR" >&2
  fi
  exit $rc
fi
