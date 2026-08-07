#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Create a new organization for a multi-tenant client.

.DESCRIPTION
    Creates an Organization row, adds the given user as an owner, and seeds OrgSettings.
    The user must have already signed in at least once so their account exists.

.PARAMETER Name
    The name of the organization (e.g. "Acme Corp").

.PARAMETER AdminEmail
    The email of the admin who will be the owner of the organization.

.PARAMETER Website
    Optional website for the organization.

.EXAMPLE
    .\create-org.ps1 -Name "Acme Corp" -AdminEmail "admin@acme.com"
#>

param(
    [Parameter(Mandatory)]
    [string]$Name,

    [Parameter(Mandatory)]
    [string]$AdminEmail,

    [string]$Website = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir   = $PSScriptRoot
$RepoRoot    = Split-Path $ScriptDir -Parent

Push-Location $RepoRoot
try {
    Write-Host "Creating organization '$Name'..." -ForegroundColor Cyan
    bun run scripts/create-org.ts $Name $AdminEmail $Website
} finally {
    Pop-Location
}
