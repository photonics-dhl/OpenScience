[CmdletBinding()]
param(
  [string]$Version = '4.5.12',
  [string]$ExpectedSha256 = '317ef64e7a2c3cc79ec810c766ae9828aff865bea78039dc695b3f1118c34b4f'
)

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([IO.Path]::GetPathRoot($projectRoot) -ne 'E:\') {
  throw "Hermes Blender tooling must remain on E:, got $projectRoot"
}

$toolsRoot = Join-Path $projectRoot '.tools'
$downloadRoot = Join-Path $toolsRoot 'downloads'
$extractRoot = Join-Path $toolsRoot 'blender'
$archiveName = "blender-$Version-windows-x64.zip"
$archivePath = Join-Path $downloadRoot $archiveName
$releaseMinor = ($Version -split '\.')[0..1] -join '.'
$uri = "https://download.blender.org/release/Blender$releaseMinor/$archiveName"
$blenderRoot = Join-Path $extractRoot "blender-$Version-windows-x64"
$blenderExe = Join-Path $blenderRoot 'blender.exe'

New-Item -ItemType Directory -Force -Path $downloadRoot, $extractRoot | Out-Null

if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
  Invoke-WebRequest -Uri $uri -OutFile $archivePath -UseBasicParsing
}

$actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $ExpectedSha256.ToLowerInvariant()) {
  throw "Blender archive checksum mismatch: expected $ExpectedSha256, got $actualSha256"
}

if (-not (Test-Path -LiteralPath $blenderExe -PathType Leaf)) {
  if (Test-Path -LiteralPath $blenderRoot) {
    throw "Partial Blender directory already exists at $blenderRoot; inspect it before retrying"
  }
  [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $extractRoot)
}

$resolvedExe = (Resolve-Path -LiteralPath $blenderExe).Path
if ([IO.Path]::GetPathRoot($resolvedExe) -ne 'E:\') {
  throw "Resolved Blender executable escaped E:, got $resolvedExe"
}

Write-Output $resolvedExe
