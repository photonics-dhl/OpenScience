#!/usr/bin/env bash
# checkup.sh — 生产 ECS 只读巡检（默认只读，不含任何写操作）。
#
# 汇总：磁盘 / 内存 / 负载 / Docker 容器 / systemd 服务状态 / TLS 证书有效期。
# 依赖 infra/scripts/ssh-run.sh；SSH 密钥未配置时会报"请配置 SSH 密钥"。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

read -r -d '' REMOTE_CMD <<'EOF' || true
echo "=== df -h ==="
df -h
echo
echo "=== free -h ==="
free -h
echo
echo "=== uptime ==="
uptime
echo
echo "=== docker ps ==="
if command -v docker >/dev/null 2>&1; then
  docker ps --format table
else
  echo "N/A (docker 未安装)"
fi
echo
echo "=== systemd services ==="
for svc in nginx docker postgresql redis; do
  if systemctl list-unit-files "${svc}.service" 2>/dev/null | grep -q "^${svc}\.service"; then
    state=$(systemctl is-active "$svc" 2>/dev/null || true)
    echo "${svc}: ${state:-unknown}"
  else
    echo "${svc}: N/A (未安装)"
  fi
done
echo
echo "=== TLS certs (/etc/letsencrypt) ==="
if [ -d /etc/letsencrypt/live ]; then
  found=0
  for d in /etc/letsencrypt/live/*/; do
    if [ -f "${d}cert.pem" ]; then
      found=1
      printf '%s: ' "$(basename "$d")"
      openssl x509 -enddate -noout -in "${d}cert.pem"
    fi
  done
  [ "$found" -eq 1 ] || echo "N/A (无证书文件)"
else
  echo "N/A (/etc/letsencrypt 不存在)"
fi
EOF

echo "===== OpenScience ECS 巡检（$(date '+%Y-%m-%d %H:%M:%S %z')）====="
"$SCRIPT_DIR/ssh-run.sh" "$REMOTE_CMD"
