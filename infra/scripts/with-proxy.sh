#!/bin/bash
# with-proxy.sh — 经 ECS 稳定出网入口 127.0.0.1:7891 执行命令；
# Squid 优先 SSH 反向隧道 7890，隧道不可用时自动回落阿里云直连。
#
# 用法: with-proxy <command> [args...]
#   例: with-proxy npm install
#       with-proxy git clone https://github.com/xxx/yyy
# 注意: docker pull 不走此脚本——dockerd 同样指向 7891，策略由 Squid 统一执行。
set -uo pipefail

PROXY=http://127.0.0.1:7891
PROBE=https://www.gstatic.com/generate_204

if [ $# -eq 0 ]; then
  echo "用法: with-proxy <command> [args...]" >&2
  exit 64
fi

# 先清掉环境里可能残留的代理变量，保证判定干净
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY 2>/dev/null || true

if curl -x "$PROXY" -s -o /dev/null --max-time 5 "$PROBE"; then
  export http_proxy="$PROXY" https_proxy="$PROXY" HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"
  echo "[with-proxy] 稳定代理可用 → 隧道优先、阿里云直连兜底" >&2
else
  echo "[with-proxy] 隧道不可用 → 回落阿里云直连（计费流量兜底）" >&2
fi

exec "$@"
