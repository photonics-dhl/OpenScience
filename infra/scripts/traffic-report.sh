#!/bin/bash
# traffic-report.sh — 从 vnStat 容器取网卡流量 JSON，渲染流量账单静态页到 /var/www/traffic/
# 云上 cron 每 5 分钟执行（/etc/cron.d/traffic-report），页面经 nginx
# https://portainer.428312321.xyz/traffic/ 暴露（basic_auth）。
# 依赖：宿主机 python3 + 运行中的 vnstat 容器（infra/compose/docker-compose.monitor.yml）。
# 用法: traffic-report.sh [网卡名]（默认 eth0）
set -euo pipefail
exec python3 - "${1:-eth0}" <<'PYEOF'
import json, subprocess, sys, datetime, html

IFACE = sys.argv[1]
OUT = "/var/www/traffic/index.html"

def gib(b):
    return b / (1024 ** 3)

def fmt(b):
    if b >= 1024 ** 3:
        return f"{gib(b):.2f} GiB"
    if b >= 1024 ** 2:
        return f"{b / 1024 ** 2:.1f} MiB"
    return f"{b / 1024:.0f} KiB"

try:
    raw = subprocess.run(
        ["docker", "exec", "vnstat", "vnstat", "--json", "-i", IFACE],
        capture_output=True, text=True, check=True, timeout=30,
    ).stdout
    data = json.loads(raw)
    traffic = next(i for i in data["interfaces"] if i["name"] == IFACE)["traffic"]
    err = None
except Exception as e:  # noqa: BLE001 — 渲染错误页而不是让 cron 静默失败
    traffic, err = None, f"{type(e).__name__}: {e}"

def rows_month(tr):
    out = []
    for m in reversed(tr["month"][-12:]):
        y, mo = m["date"]["year"], m["date"]["month"]
        rx, tx = m["rx"], m["tx"]
        out.append((f"{y}-{mo:02d}", rx, tx, rx + tx))
    return out

def rows_day(tr):
    out = []
    for d in reversed(tr["day"][-14:]):
        i = d["date"]
        rx, tx = d["rx"], d["tx"]
        out.append((f"{i['year']}-{i['month']:02d}-{i['day']:02d}", rx, tx, rx + tx))
    return out

def bars(rows, unit_name):
    if not rows:
        return "<p>暂无数据（vnStat 刚开始采集，稍候刷新）</p>"
    peak = max(r[3] for r in rows) or 1
    h = [f"<table><tr><th>{unit_name}</th><th>下行 rx</th><th>上行 tx</th>"
         "<th>合计</th><th style='width:45%'></th></tr>"]
    for name, rx, tx, tot in rows:
        w = max(tot / peak * 100, 0.5)
        h.append(
            f"<tr><td>{name}</td><td>{fmt(rx)}</td><td>{fmt(tx)}</td><td><b>{fmt(tot)}</b></td>"
            f"<td><div class='bar' style='width:{w:.1f}%'></div></td></tr>"
        )
    h.append("</table>")
    return "\n".join(h)

now = datetime.datetime.now().strftime("%F %T")
if err:
    body = f"<h1>流量账单暂不可用</h1><p class='err'>{html.escape(err)}</p>"
else:
    total = traffic["total"]
    month_rows = rows_month(traffic)
    cur = month_rows[-1] if month_rows else None
    head = (
        f"<div class='cards'>"
        f"<div class='card'><div class='num'>{fmt(cur[3]) if cur else '—'}</div>"
        f"<div class='lbl'>本月合计（{cur[0] if cur else ''}）</div></div>"
        f"<div class='card'><div class='num'>{fmt(cur[2]) if cur else '—'}</div>"
        f"<div class='lbl'>本月上行 tx（阿里云计费口径）</div></div>"
        f"<div class='card'><div class='num'>{fmt(total['rx'] + total['tx'])}</div>"
        f"<div class='lbl'>累计（rx+tx，采集起）</div></div></div>"
    )
    body = head + "<h2>按月</h2>" + bars(month_rows, "月份") \
        + "<h2>近 14 天</h2>" + bars(rows_day(traffic), "日期")

page = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="300">
<title>流量账单 - {html.escape(IFACE)}</title>
<style>
  body{{font-family:sans-serif;background:#141518;color:#e8e8e8;margin:0;padding:20px;max-width:900px;margin:auto}}
  h1{{font-size:20px}} h2{{font-size:16px;margin-top:28px}}
  table{{border-collapse:collapse;width:100%}}
  td,th{{padding:5px 8px;font-size:14px;text-align:right;white-space:nowrap}}
  td:first-child,th:first-child{{text-align:left}}
  .bar{{height:12px;background:linear-gradient(90deg,#3b82f6,#22c55e);border-radius:2px}}
  .cards{{display:flex;gap:14px;margin:18px 0;flex-wrap:wrap}}
  .card{{background:#1f2124;border-radius:8px;padding:14px 20px;flex:1;min-width:180px}}
  .num{{font-size:24px;font-weight:700}} .lbl{{color:#999;font-size:12px;margin-top:4px}}
  .meta{{color:#777;font-size:12px;margin-top:24px}}
  .err{{color:#f87171}}
</style>
</head>
<body>
<h1>服务器流量账单（网卡 {html.escape(IFACE)}，每 5 分钟自动刷新）</h1>
<p class="meta" style="margin-top:-6px"><a href="/nav/" style="color:#3b82f6">← 导航</a> ·
<a href="/monitor/" style="color:#3b82f6">实时监控面板</a> ·
<a href="/" style="color:#3b82f6">Portainer</a></p>
{body}
<p class="meta">生成时间：{now} · 数据源 vnStat（宿主机网卡计数器，{html.escape(IFACE)}）·
账单以阿里云控制台为准，此处为估算参考</p>
</body>
</html>
"""
with open(OUT, "w", encoding="utf-8") as f:
    f.write(page)
PYEOF
