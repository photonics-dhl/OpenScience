[CmdletBinding()]
param([string]$ConfigRoot)
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$bash = 'C:/Program Files/Git/bin/bash.exe'
if (-not (Test-Path -LiteralPath $bash -PathType Leaf)) { throw 'Git Bash is required by the project SSH entry.' }
if (-not $ConfigRoot) {
    $commonGit = & git -C $repo rev-parse --path-format=absolute --git-common-dir
    if ($LASTEXITCODE -ne 0) { throw 'Cannot locate the project SSH configuration.' }
    $ConfigRoot = Split-Path -Parent $commonGit.Trim()
}
$previousConfigRoot = $env:XGS_CONFIG_ROOT
$secureKey = $null
$pointer = [IntPtr]::Zero
$payload = $null
try {
    $env:XGS_CONFIG_ROOT = [System.IO.Path]::GetFullPath($ConfigRoot)
    # Only public helper source goes into the command. The credential travels on SSH stdin.
    $helper = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'configure-key.py')))
    $command = "python3 -c 'import base64,sys;exec(base64.b64decode(sys.argv[1]))' $helper"
    $secureKey = Read-Host 'Synclip API Key (hidden; Enter to save privately, Ctrl+C to cancel)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $payload = @{ apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } | ConvertTo-Json -Compress
    Push-Location $repo
    try {
        $payload | & $bash infra/scripts/ssh-run.sh --confirm $command
        if ($LASTEXITCODE -ne 0) { throw 'Credential setup did not confirm success. Do not resend blindly.' }
    } finally { Pop-Location }
} finally {
    $payload = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secureKey) { $secureKey.Dispose() }
    $env:XGS_CONFIG_ROOT = $previousConfigRoot
}
