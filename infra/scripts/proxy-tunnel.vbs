' proxy-tunnel.vbs — 隐藏窗口启动 proxy-tunnel.sh（Windows 计划任务 OpenScience-ProxyTunnel 用）
' 手动重建计划任务（管理员/普通权限均可，当前用户上下文）：
'   schtasks /Create /TN "OpenScience-ProxyTunnel" /SC ONLOGON /RL LIMITED /F ^
'     /TR "wscript.exe \"E:\Miscellaneous\XGS\infra\scripts\proxy-tunnel.vbs\""
CreateObject("Wscript.Shell").Run """C:\Program Files\Git\bin\bash.exe"" -c ""/e/Miscellaneous/XGS/infra/scripts/proxy-tunnel.sh""", 0, False
