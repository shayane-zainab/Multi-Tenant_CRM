#!/usr/bin/env pwsh
<#
.SYNOPSIS
    List all provisioned CRM client instances and their live Docker status.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Registry = Join-Path $PSScriptRoot "registry.json"

if (-not (Test-Path $Registry)) {
    Write-Host "No clients provisioned yet. Run provision.ps1 to add one." -ForegroundColor Yellow
    exit 0
}

$clients = Get-Content $Registry -Raw | ConvertFrom-Json

if ($clients.Count -eq 0) {
    Write-Host "No clients provisioned yet. Run provision.ps1 to add one." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "  Aristral CRM — Client Registry" -ForegroundColor Cyan
Write-Host "  ────────────────────────────────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host ""

foreach ($client in $clients) {
    $appStatus   = docker inspect --format='{{.State.Status}}' "crm-app-$($client.slug)"   2>$null
    $apiStatus   = docker inspect --format='{{.State.Status}}' "crm-api-$($client.slug)"   2>$null
    $agentStatus = docker inspect --format='{{.State.Status}}' "crm-agent-$($client.slug)" 2>$null
    $dbStatus    = docker inspect --format='{{.State.Status}}' "crm-postgres-$($client.slug)" 2>$null

    $overallColor = if ($appStatus -eq "running" -and $apiStatus -eq "running") { "Green" } else { "Red" }

    Write-Host "  $($client.name) ($($client.slug))" -ForegroundColor $overallColor
    Write-Host "    URL        : https://$($client.subdomain)" -ForegroundColor White
    Write-Host "    Provisioned: $($client.provisionedAt)" -ForegroundColor DarkGray
    Write-Host "    Ports      : DB=$($client.dbPort)  API=$($client.apiPort)  App=$($client.appPort)  Agent=$($client.agentPort)" -ForegroundColor DarkGray
    Write-Host "    Containers : db=[$dbStatus]  api=[$apiStatus]  app=[$appStatus]  agent=[$agentStatus]" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "  Total: $($clients.Count) client(s)" -ForegroundColor Cyan
Write-Host ""
