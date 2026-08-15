[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([IO.Path]::GetPathRoot($projectRoot) -ne 'E:\') {
  throw "Hermes asset builds must run from an E: project checkout, got $projectRoot"
}

$blenderExe = & (Join-Path $PSScriptRoot 'fetch-blender-portable.ps1')
if (-not (Test-Path -LiteralPath $blenderExe -PathType Leaf)) {
  throw 'Unable to resolve the checksum-pinned Blender Portable executable'
}

$profileRoot = Join-Path $projectRoot '.tools\blender\profile'
$tempRoot = Join-Path $projectRoot '.tools\blender\temp'
$env:TEMP = $tempRoot
$env:TMP = $tempRoot
$env:BLENDER_USER_CONFIG = Join-Path $profileRoot 'config'
$env:BLENDER_USER_SCRIPTS = Join-Path $profileRoot 'scripts'
New-Item -ItemType Directory -Force -Path $env:TEMP, $env:BLENDER_USER_CONFIG, $env:BLENDER_USER_SCRIPTS | Out-Null

$builder = Join-Path $projectRoot 'apps\web\scripts\hermes\build-hermes-asset.py'
$outputRoot = Join-Path $projectRoot 'apps\web'
& $blenderExe --background --factory-startup --python $builder -- --output-root $outputRoot
if ($LASTEXITCODE -ne 0) {
  throw "Hermes Blender build failed with exit code $LASTEXITCODE"
}
