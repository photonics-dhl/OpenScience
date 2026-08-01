#!/bin/bash
# with-proxy.sh — 经 SSH 反向隧道（127.0.0.1:7890 → 本机 v2ray）执行命令；
# 隧道不可用时自动回落阿里云直连（计费流量兜底，绝不因代理挂而失败）。
#
# 用法: with-proxy <command> [args...]
#   例: with-proxy npm install
#       with-proxy git clone https://github.com/xxx/yyy
# 注意: docker pull 不走此脚本——dockerd 代理已在 daemon 层配置
#       （/etc/systemd/system/docker.service.d/http-proxy.conf），隧道断开时 pull 会失败，
#       恢复隧道后重试即可（见 docs/runbooks/monitoring.md 排障节）。
set -uo pipefail

PROXY=http://127.0.0.1:7890
PROBE=https://www.gstatic.com/generate_204

if [ $# -eq 0 ]; then
  echo "用法: with-proxy <command> [args...]" >&2
  exit 64
fi

# 先清掉环境里可能残留的代理变量，保证判定干净
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY all_proxy ALL_PROXY 2>/dev/null || true

if curl -x "$PROXY" -s -o /dev/null --max-time 3 "$PROBE"; then
  export http_proxy="$PROXY" https_proxy="$PROXY" HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"
  echo "[with-proxy] 隧道可用 → 经本机 v2ray 代理执行" >&2
else
  echo "[with-proxy] 隧道不可用 → 回落阿里云直连（计费流量兜底）" >&2
fi

exec "$@"
