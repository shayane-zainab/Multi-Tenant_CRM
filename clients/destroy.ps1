#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tear down a provisioned CRM client instance.

.DESCRIPTION
    Stops and removes all Docker containers for the client. Optionally deletes
    the database volume (permanent data loss) and the config files.

.PARAMETER Slug
    The client slug, e.g. "acme-corp". Use list.ps1 to find it.

.PARAMETER DeleteData
    If set, also deletes the Postgres volume (permanent — all CRM data is gone).

.PARAMETER DeleteFiles
    If set, also deletes the client's config directory under clients/instances/.

.EXAMPLE
    .\destroy.ps1 -Slug acme-corp
    .\destroy.ps1 -Slug acme-corp -DeleteData -DeleteFiles
#>

param(
    [Parameter(Mandatory)]
    [string]$Slug,

    [switch]$DeleteData,
    [switch]$DeleteFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Registry  = Join-Path $PSScriptRoot "registry.json"
$ClientDir = Join-Path $PSScriptRoot "instances" $Slug

if (-not (Test-Path $Registry)) {
    Write-Error "No registry found. Nothing to destroy."
}

$clients = Get-Content $Registry -Raw | ConvertFrom-Json
$client  = $clients | Where-Object { $_.slug -eq $Slug } | Select-Object -First 1

if (-not $client) {
    Write-Error "No client with slug '$Slug' found in registry. Run list.ps1 to see all clients."
}

Write-Host ""
Write-Host "  Destroying client: $($client.name) ($Slug)" -ForegroundColor Red

if ($DeleteData) {
    Write-Host "  !! This will permanently delete all CRM data for this client !!" -ForegroundColor Red
    $confirm = Read-Host "  Type the slug '$Slug' to confirm"
    if ($confirm -ne $Slug) {
        Write-Host "  Aborted." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "  [1/3] Stopping containers..." -ForegroundColor Yellow
Push-Location $ClientDir
try {
    docker compose down 2>&1 | ForEach-Object { Write-Host "         $_" -ForegroundColor DarkGray }
} finally {
    Pop-Location
}
Write-Host "  [1/3] Containers stopped" -ForegroundColor Green

if ($DeleteData) {
    Write-Host "  [2/3] Deleting Postgres volume..." -ForegroundColor Yellow
    docker volume rm "crm-data-$Slug" 2>&1 | Out-Null
    Write-Host "  [2/3] Volume deleted" -ForegroundColor Green
} else {
    Write-Host "  [2/3] Skipping volume deletion (data preserved). Use -DeleteData to remove." -ForegroundColor DarkGray
}

if ($DeleteFiles) {
    Write-Host "  [3/3] Removing config files..." -ForegroundColor Yellow
    Remove-Item $ClientDir -Recurse -Force
    Write-Host "  [3/3] Config files deleted" -ForegroundColor Green
} else {
    Write-Host "  [3/3] Skipping file deletion (config preserved at $ClientDir). Use -DeleteFiles to remove." -ForegroundColor DarkGray
}

$updated = $clients | Where-Object { $_.slug -ne $Slug }
$updated | ConvertTo-Json -Depth 5 | Set-Content $Registry -Encoding UTF8

Write-Host ""
Write-Host "  ✓ Client '$($client.name)' destroyed" -ForegroundColor Green
Write-Host ""
