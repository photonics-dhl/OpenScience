#!/bin/bash
# proxy-tunnel.sh — SSH 反向隧道常驻（本机侧）：服务器 127.0.0.1:7890 → 本机 v2ray。
# 由 Windows 计划任务 OpenScience-ProxyTunnel 在登录时经 proxy-tunnel.vbs 隐藏启动；
# 断线自动 5s 重连，日志在 %USERPROFILE%\proxy-tunnel.log（超 1MB 自动截断）。
#
# 凭据从仓库 .env 读取（SERVER_HOST/SERVER_USER/SERVER_PORT，兼容中文键），不回显。
set -uo pipefail
cd "$(dirname "$0")/../.."

read_env() {
  grep -E "^$1=" .env | head -n1 | cut -d= -f2- | tr -d '\r' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}
pick() { local k v; for k in "$@"; do v="$(read_env "$k")"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }; done; return 1; }

H="$(pick SERVER_HOST SSH_HOST 公网ip)" || { echo "缺少服务器地址" >&2; exit 66; }
U="$(pick SERVER_USER SSH_USER 用户名)" || { echo "缺少用户名" >&2; exit 66; }
P="$(pick SERVER_PORT SSH_PORT SSH端口 || true)"; P="${P:-22}"

LOG="${USERPROFILE:-$HOME}/proxy-tunnel.log"

while true; do
  echo "$(date '+%F %T') [tunnel] 建立连接..." >> "$LOG"
  ssh -N -R 127.0.0.1:7890:127.0.0.1:7890 \
      -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes -o BatchMode=yes -o ConnectTimeout=15 \
      -i "$HOME/.ssh/id_ed25519_xgs" -p "$P" "$U@$H" >> "$LOG" 2>&1
  echo "$(date '+%F %T') [tunnel] 连接断开，5s 后重连" >> "$LOG"
  # 日志超 1MB 截断保留尾部 500 行
  if [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 1048576 ]; then
    tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
  sleep 5
done
