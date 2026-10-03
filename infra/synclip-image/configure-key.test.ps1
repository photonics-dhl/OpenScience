# Run with Windows PowerShell 5 to exercise its real native-argument quoting.
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$testRoot = Join-Path $repo ('tmp/synclip-key-test-' + [Guid]::NewGuid().ToString('N'))
$previousConfigRoot = $env:XGS_CONFIG_ROOT
$previousPython = $env:SYNCLIP_TEST_PYTHON
try {
    [void](New-Item -ItemType Directory -Path (Join-Path $testRoot 'infra/synclip-image') -Force)
    [void](New-Item -ItemType Directory -Path (Join-Path $testRoot 'infra/scripts') -Force)
    $source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'configure-key.ps1') -Raw
    $target = Join-Path $testRoot 'infra/synclip-image/configure-key.ps1'
    [IO.File]::WriteAllText($target, $source)
    $env:SYNCLIP_TEST_PYTHON = (Get-Command python.exe -ErrorAction Stop).Source.Replace('\', '/')
    # Replace SSH alone. Git Bash and Python are real processes; no network or key is used.
    [IO.File]::WriteAllText((Join-Path $testRoot 'infra/scripts/ssh-run.sh'), @'
#!/usr/bin/env bash
set -euo pipefail
python3() { "$SYNCLIP_TEST_PYTHON" "$@"; }
export -f python3
exec bash -c "$2"
'@.Replace("`r`n", "`n"))
    [IO.File]::WriteAllText((Join-Path $testRoot 'infra/synclip-image/configure-key.py'), @'
import json, sys
payload = json.load(sys.stdin)
assert payload == {'apiKey': 'offline-fixture-only'}
assert len(sys.argv) == 2 and payload['apiKey'] not in ' '.join(sys.argv)
print('STDIN_ONLY_ROUNDTRIP_PASS')
'@)
    function Read-Host { param($Prompt, [switch]$AsSecureString)
        if (-not $AsSecureString) { throw 'Key input must stay hidden' }
        ConvertTo-SecureString 'offline-fixture-only' -AsPlainText -Force
    }
    $output = & $target -ConfigRoot $testRoot
    if ($LASTEXITCODE -ne 0 -or $output -ne 'STDIN_ONLY_ROUNDTRIP_PASS') { throw 'Native argument roundtrip failed' }
    if ($env:XGS_CONFIG_ROOT -ne $previousConfigRoot) { throw 'Configuration environment was not restored' }
    Write-Output 'PowerShell -> Git Bash -> Python: PASS; credential on stdin only; no network or provider call'
} finally {
    $env:XGS_CONFIG_ROOT = $previousConfigRoot
    $env:SYNCLIP_TEST_PYTHON = $previousPython
    $expectedParent = [IO.Path]::GetFullPath((Join-Path $repo 'tmp')) + [IO.Path]::DirectorySeparatorChar
    if ([IO.Path]::GetFullPath($testRoot).StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
