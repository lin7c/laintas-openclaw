# Laintas for OpenClaw — one-command install (Windows, PowerShell).
#
# 1. If OpenClaw is not installed, installs it via OpenClaw's own installer.
# 2. Installs the Laintas provider plugin from its public repository.
#
# Safe to re-run.
# Run:  irm https://raw.githubusercontent.com/lin7c/openclaw-laintas/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'

if (Get-Command openclaw -ErrorAction SilentlyContinue) {
    Write-Host "OpenClaw found: $(openclaw --version)"
} else {
    Write-Host 'Installing OpenClaw via its official installer...'
    Invoke-WebRequest -Uri 'https://openclaw.ai/install.ps1' -UseBasicParsing | Invoke-Expression
    Write-Host "OpenClaw installed: $(openclaw --version)"
}

Write-Host 'Installing the Laintas plugin...'
openclaw plugins install --force --accept-capabilities git:github.com/lin7c/openclaw-laintas

Write-Host ''
Write-Host 'Done. Now sign in and pick a model:'
Write-Host ''
Write-Host '  openclaw models auth login --provider laintas'
Write-Host '  openclaw models set laintas/gpt-6-luna'
Write-Host ''
Write-Host 'Your Laintas account balance is what gets billed — there is no API key.'
