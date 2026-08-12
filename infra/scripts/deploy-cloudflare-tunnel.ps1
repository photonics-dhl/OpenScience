[CmdletBinding()]
param(
  [ValidateSet('deploy', 'status', 'rollback')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$envFile = Join-Path $projectRoot '.env'
$gitBash = 'C:\Program Files\Git\bin\bash.exe'
$sshHelper = 'infra/scripts/ssh-run.sh'
$zoneName = '428312321.xyz'
$hostname = 'openscience.428312321.xyz'
$originIp = '115.29.208.1'
$tunnelName = 'openscience-prod'

function Get-EnvSecret([string]$Name) {
  if (!(Test-Path -LiteralPath $envFile)) {
    throw "Missing project .env"
  }

  $escapedName = [regex]::Escape($Name)
  $line = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match "^\s*$escapedName\s*=" } |
    Select-Object -First 1
  if (!$line) {
    throw "Missing required secret key: $Name"
  }

  $value = (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required secret key is empty: $Name"
  }
  return $value
}

function Invoke-CloudflareApi {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [ValidateSet('Get', 'Post', 'Put', 'Patch')] [string]$Method = 'Get',
    [object]$Body
  )

  $params = @{
    Uri = "https://api.cloudflare.com/client/v4$Path"
    Headers = $script:cloudflareHeaders
    Method = $Method
    TimeoutSec = 30
  }
  if ($null -ne $Body) {
    $params.Body = $Body | ConvertTo-Json -Depth 12 -Compress
  }

  $response = Invoke-RestMethod @params
  if (!$response.success) {
    throw "Cloudflare API request failed: $Method $Path"
  }
  return $response
}

function Invoke-SshWithInput {
  param(
    [Parameter(Mandatory)] [string]$RemoteCommand,
    [Parameter(Mandatory)] [string]$InputText
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $gitBash
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.ArgumentList.Add($sshHelper)
  $startInfo.ArgumentList.Add($RemoteCommand)
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $process.StandardInput.Write($InputText)
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if ($process.ExitCode -ne 0) {
    throw "Remote operation failed (exit $($process.ExitCode)): $($stderr.Trim())"
  }
  if ($stdout) {
    Write-Output $stdout.TrimEnd()
  }
}

function Invoke-Ssh {
  param(
    [Parameter(Mandatory)] [string]$RemoteCommand,
    [switch]$ConfirmDangerous
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $gitBash
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.ArgumentList.Add($sshHelper)
  if ($ConfirmDangerous) {
    $startInfo.ArgumentList.Add('--confirm')
  }
  $startInfo.ArgumentList.Add($RemoteCommand)
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.UseShellExecute = $false

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Remote operation failed (exit $($process.ExitCode)): $($stderr.Trim())"
  }
  if ($stdout) {
    Write-Output $stdout.TrimEnd()
  }
}

$cloudflareToken = Get-EnvSecret 'CLOUDFLARE_API_TOKEN_428xyz'
$script:cloudflareHeaders = @{
  Authorization = "Bearer $cloudflareToken"
  'Content-Type' = 'application/json'
}

try {
  $zones = Invoke-CloudflareApi -Path "/zones?name=$zoneName&status=active"
  if ($zones.result.Count -ne 1) {
    throw "Expected exactly one active zone for $zoneName"
  }
  $zone = $zones.result[0]
  $zoneId = $zone.id
  $accountId = $zone.account.id

  $records = Invoke-CloudflareApi -Path "/zones/$zoneId/dns_records?name=$hostname"
  if ($records.result.Count -ne 1) {
    throw "Expected exactly one DNS record for $hostname"
  }
  $record = $records.result[0]

  $tunnels = Invoke-CloudflareApi -Path "/accounts/$accountId/cfd_tunnel?name=$tunnelName&is_deleted=false"
  $tunnel = if ($tunnels.result.Count -eq 1) { $tunnels.result[0] } else { $null }

  if ($Action -eq 'status') {
    Write-Output "DNS type=$($record.type) proxied=$($record.proxied) tunnelTarget=$($record.content -like '*.cfargotunnel.com')"
    if ($tunnel) {
      Write-Output "TUNNEL id=$($tunnel.id) status=$($tunnel.status) connections=$($tunnel.connections.Count)"
    } else {
      Write-Output 'TUNNEL absent'
    }
    Invoke-Ssh 'printf "SERVICE enabled="; systemctl is-enabled cloudflared 2>/dev/null || true; printf "SERVICE active="; systemctl is-active cloudflared 2>/dev/null || true; test -s /etc/cloudflared/tunnel-token && echo TOKEN_FILE present || echo TOKEN_FILE absent'
    exit 0
  }

  if ($Action -eq 'rollback') {
    $restore = @{
      type = 'A'
      name = $hostname
      content = $originIp
      ttl = 1
      proxied = $false
      comment = 'OpenScience manual rollback to Alibaba ECS direct origin'
    }
    [void](Invoke-CloudflareApi -Path "/zones/$zoneId/dns_records/$($record.id)" -Method Put -Body $restore)
    Invoke-Ssh -ConfirmDangerous 'systemctl disable --now cloudflared; systemctl is-active cloudflared 2>/dev/null || true'
    Write-Output "ROLLBACK dns=A/$originIp/proxied-false service=disabled"
    exit 0
  }

  if ($tunnels.result.Count -gt 1) {
    throw "Multiple active tunnels named $tunnelName"
  }

  $tunnelToken = $null
  if (!$tunnel) {
    $created = Invoke-CloudflareApi -Path "/accounts/$accountId/cfd_tunnel" -Method Post -Body @{
      name = $tunnelName
      config_src = 'cloudflare'
    }
    $tunnel = $created.result
    $tunnelToken = $tunnel.token
  } else {
    $tokenResponse = Invoke-CloudflareApi -Path "/accounts/$accountId/cfd_tunnel/$($tunnel.id)/token"
    $tunnelToken = $tokenResponse.result
  }
  if ([string]::IsNullOrWhiteSpace($tunnelToken)) {
    throw 'Cloudflare did not return a tunnel token'
  }

  $ingressConfig = @{
    config = @{
      ingress = @(
        @{
          hostname = $hostname
          service = 'https://127.0.0.1:443'
          originRequest = @{
            originServerName = $hostname
            httpHostHeader = $hostname
            connectTimeout = 10
          }
        },
        @{ service = 'http_status:404' }
      )
    }
  }
  [void](Invoke-CloudflareApi -Path "/accounts/$accountId/cfd_tunnel/$($tunnel.id)/configurations" -Method Put -Body $ingressConfig)

  Invoke-SshWithInput -RemoteCommand 'set -e; umask 077; mkdir -p /etc/cloudflared; cat > /etc/cloudflared/tunnel-token; chmod 600 /etc/cloudflared/tunnel-token; chown root:root /etc/cloudflared/tunnel-token; test -s /etc/cloudflared/tunnel-token; echo TOKEN_FILE_READY' -InputText $tunnelToken

  $unit = @'
[Unit]
Description=OpenScience Cloudflare Tunnel
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=notify
TimeoutStartSec=0
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --protocol auto run --token-file /etc/cloudflared/tunnel-token
Restart=always
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
'@
  Invoke-SshWithInput -RemoteCommand 'set -e; cat > /etc/systemd/system/cloudflared.service; chmod 644 /etc/systemd/system/cloudflared.service; systemctl daemon-reload; systemctl enable --now cloudflared; sleep 10; systemctl is-enabled cloudflared; systemctl is-active cloudflared' -InputText $unit

  $healthy = $null
  foreach ($attempt in 1..12) {
    Start-Sleep -Seconds 5
    $latest = Invoke-CloudflareApi -Path "/accounts/$accountId/cfd_tunnel/$($tunnel.id)"
    if ($latest.result.status -eq 'healthy' -and $latest.result.connections.Count -ge 2) {
      $healthy = $latest.result
      break
    }
  }
  if (!$healthy) {
    throw 'Tunnel did not become healthy with at least two edge connections'
  }

  $backup = @{
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    id = $record.id
    type = $record.type
    name = $record.name
    content = $record.content
    ttl = $record.ttl
    proxied = $record.proxied
  } | ConvertTo-Json -Compress
  Invoke-SshWithInput -RemoteCommand 'set -e; umask 077; mkdir -p /var/lib/openscience; cat > /var/lib/openscience/cloudflare-dns-backup.json; chmod 600 /var/lib/openscience/cloudflare-dns-backup.json; echo DNS_BACKUP_READY' -InputText $backup

  $tunnelRecord = @{
    type = 'CNAME'
    name = $hostname
    content = "$($tunnel.id).cfargotunnel.com"
    ttl = 1
    proxied = $true
    comment = 'OpenScience production ingress via ECS-resident Cloudflare Tunnel'
  }
  [void](Invoke-CloudflareApi -Path "/zones/$zoneId/dns_records/$($record.id)" -Method Put -Body $tunnelRecord)

  Write-Output "DEPLOYED tunnel=$($tunnel.id) status=$($healthy.status) connections=$($healthy.connections.Count)"
  Write-Output 'DNS switched-to=proxied-tunnel-cname'
  Write-Output 'SECRET exposure=none'
} finally {
  Remove-Variable cloudflareToken, tunnelToken -ErrorAction SilentlyContinue
}
