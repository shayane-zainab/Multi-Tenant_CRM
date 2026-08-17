#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Provision a new CRM client instance.

.DESCRIPTION
    Creates an isolated CRM environment for a new client:
      - Unique ports for DB, API, app and agent
      - Generated secrets (BETTER_AUTH_SECRET, AGENT_BRIDGE_SECRET, CRON_SECRET)
      - Per-client .env, docker-compose.yml, and nginx vhost
      - Runs DB migrations automatically
    Records the client in clients/registry.json so list.ps1 and destroy.ps1 work.

.PARAMETER ClientName
    Human-readable name, e.g. "Acme Corp". Used in the directory and as a label.

.PARAMETER Subdomain
    Override the auto-generated subdomain. Defaults to a slug of ClientName.

.EXAMPLE
    .\provision.ps1 -ClientName "Acme Corp"
    .\provision.ps1 -ClientName "Acme Corp" -Subdomain "acme"
#>

param(
    [Parameter(Mandatory)]
    [string]$ClientName,

    [string]$Subdomain = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = $PSScriptRoot
$RepoRoot    = Split-Path $ScriptDir -Parent
$Registry    = Join-Path $ScriptDir "registry.json"
$TemplateDir = Join-Path $ScriptDir "template"

function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [System.Convert]::ToBase64String($bytes)
}

function Get-Slug ([string]$name) {
    return ($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-')
}

function Get-NextPort ([int[]]$used, [int]$start) {
    $port = $start
    while ($port -in $used) { $port++ }
    return $port
}

Write-Host ""
Write-Host "  Aristral CRM Provisioner" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

$slug = if ($Subdomain) { Get-Slug $Subdomain } else { Get-Slug $ClientName }

if ([string]::IsNullOrWhiteSpace($slug)) {
    Write-Error "Could not derive a valid slug from '$ClientName'. Use -Subdomain to set one explicitly."
}

$ClientDir = Join-Path $ScriptDir "instances" $slug

if (Test-Path $ClientDir) {
    Write-Error "A client with slug '$slug' already exists at $ClientDir. Use destroy.ps1 first, or choose a different name."
}

$existingClients = @()
if (Test-Path $Registry) {
    $existingClients = (Get-Content $Registry -Raw | ConvertFrom-Json)
}

$usedPorts = @($existingClients | ForEach-Object {
    $_.dbPort, $_.apiPort, $_.appPort, $_.agentPort
})

$dbPort    = Get-NextPort $usedPorts 5433
$usedPorts += $dbPort
$apiPort   = Get-NextPort $usedPorts 3101
$usedPorts += $apiPort
$appPort   = Get-NextPort $usedPorts 3200
$usedPorts += $appPort
$agentPort = Get-NextPort $usedPorts 2001

$dbUser     = "crm_$($slug -replace '-','_')"
$dbPassword = New-Secret
$dbName     = "crm_$($slug -replace '-','_')"
$authSecret = New-Secret
$bridgeSecret = New-Secret
$cronSecret = New-Secret

Write-Host "  Client   : $ClientName" -ForegroundColor White
Write-Host "  Slug     : $slug" -ForegroundColor White
Write-Host "  Subdomain: $slug.aristral.com" -ForegroundColor White
Write-Host "  Ports    : DB=$dbPort  API=$apiPort  App=$appPort  Agent=$agentPort" -ForegroundColor White
Write-Host ""

New-Item -ItemType Directory -Path $ClientDir -Force | Out-Null

$envTemplate = Get-Content (Join-Path $TemplateDir ".env.template") -Raw

$env = $envTemplate `
    -replace '__DB_USER__',         $dbUser `
    -replace '__DB_PASSWORD__',     $dbPassword `
    -replace '__DB_PORT__',         $dbPort `
    -replace '__DB_NAME__',         $dbName `
    -replace '__BETTER_AUTH_SECRET__', $authSecret `
    -replace '__CLIENT_SUBDOMAIN__', $slug `
    -replace '__AGENT_PORT__',      $agentPort `
    -replace '__AGENT_BRIDGE_SECRET__', $bridgeSecret `
    -replace '__CRON_SECRET__',     $cronSecret

$env | Set-Content (Join-Path $ClientDir ".env") -Encoding UTF8

$composeTemplate = Get-Content (Join-Path $TemplateDir "docker-compose.yml") -Raw
$compose = $composeTemplate `
    -replace '\$\{CLIENT_SLUG\}',  $slug `
    -replace '\$\{DB_USER\}',      $dbUser `
    -replace '\$\{DB_PASSWORD\}',  $dbPassword `
    -replace '\$\{DB_NAME\}',      $dbName `
    -replace '\$\{DB_PORT\}',      $dbPort `
    -replace '\$\{API_PORT\}',     $apiPort `
    -replace '\$\{APP_PORT\}',     $appPort `
    -replace '\$\{AGENT_PORT\}',   $agentPort

$compose | Set-Content (Join-Path $ClientDir "docker-compose.yml") -Encoding UTF8

$nginxTemplate = Get-Content (Join-Path $TemplateDir "nginx-vhost.conf") -Raw
$nginx = $nginxTemplate `
    -replace '__CLIENT_SUBDOMAIN__', $slug `
    -replace '__APP_PORT__',         $appPort `
    -replace '__API_PORT__',         $apiPort

$nginxOut = Join-Path $ClientDir "nginx-vhost.conf"
$nginx | Set-Content $nginxOut -Encoding UTF8

Write-Host "  [1/5] Config files written to $ClientDir" -ForegroundColor Green

Write-Host "  [2/5] Starting Postgres container..." -ForegroundColor Yellow
Push-Location $ClientDir
try {
    docker compose up -d "postgres-$slug" 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} finally {
    Pop-Location
}
Write-Host "  [2/5] Postgres started" -ForegroundColor Green

Write-Host "  [3/5] Waiting for Postgres to be healthy..." -ForegroundColor Yellow
$attempts = 0
do {
    Start-Sleep -Seconds 2
    $health = docker inspect --format='{{.State.Health.Status}}' "crm-postgres-$slug" 2>$null
    $attempts++
    if ($attempts -gt 30) { throw "Postgres did not become healthy after 60s" }
} while ($health -ne "healthy")
Write-Host "  [3/5] Postgres healthy" -ForegroundColor Green

Write-Host "  [4/5] Running database migrations..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}?schema=public"
Push-Location $RepoRoot
try {
    $env:ALLOW_REMOTE_DB = "1"
    bun run db:deploy 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "db:deploy failed" }
} finally {
    Pop-Location
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\ALLOW_REMOTE_DB -ErrorAction SilentlyContinue
}
Write-Host "  [4/5] Migrations applied" -ForegroundColor Green

Write-Host "  [5/5] Starting all services..." -ForegroundColor Yellow
Push-Location $ClientDir
try {
    docker compose up -d 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }
} finally {
    Pop-Location
}
Write-Host "  [5/5] All containers running" -ForegroundColor Green

$record = [PSCustomObject]@{
    slug          = $slug
    name          = $ClientName
    subdomain     = "$slug.aristral.com"
    dbPort        = $dbPort
    apiPort       = $apiPort
    appPort       = $appPort
    agentPort     = $agentPort
    clientDir     = $ClientDir
    nginxConf     = $nginxOut
    provisionedAt = (Get-Date -Format "o")
}

$existingClients += $record
$existingClients | ConvertTo-Json -Depth 5 | Set-Content $Registry -Encoding UTF8

Write-Host ""
Write-Host "  ✓ Client '$ClientName' provisioned" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy the nginx vhost to your server:" -ForegroundColor White
Write-Host "     scp $nginxOut root@your-server:/etc/nginx/sites-available/$slug.conf" -ForegroundColor DarkGray
Write-Host "  2. Enable it: ln -s /etc/nginx/sites-available/$slug.conf /etc/nginx/sites-enabled/" -ForegroundColor DarkGray
Write-Host "  3. Issue SSL: certbot --nginx -d $slug.aristral.com" -ForegroundColor DarkGray
Write-Host "  4. Reload nginx: nginx -s reload" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  App URL : https://$slug.aristral.com" -ForegroundColor Cyan
Write-Host ""
