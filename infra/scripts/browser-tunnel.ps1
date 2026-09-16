param([string]$ConfigRoot = 'E:/Miscellaneous/XGS')
$ErrorActionPreference = 'Stop'
$env:XGS_CONFIG_ROOT = $ConfigRoot
$taskWrapper = Join-Path $PSScriptRoot 'ssh-run.sh'
$taskLog = Join-Path $env:TEMP 'xgs-browser-tunnel.err.log'
while ($true) {
    & 'C:/Program Files/Git/bin/bash.exe' $taskWrapper '--browser-tunnel' 2>> $taskLog
    Start-Sleep -Seconds 5
}
