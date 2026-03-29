# ═══════════════════════════════════════════════════════════════
# Schedula — Docker 起動前セットアップスクリプト (Windows PowerShell)
#
# フロー:
#   1. secrets-cli setup  → Infisical 認証情報を .env.secrets に保存
#   2. secrets-cli env    → Infisical → Docker 用 .env を生成
#   3. docker compose up  → .env を読んで起動
#
# Usage:
#   .\scripts\setup.ps1          # セットアップ → docker compose up
#   .\scripts\setup.ps1 -NoUp    # セットアップのみ
#   .\scripts\setup.ps1 -Dev     # 開発モードで起動
#   .\scripts\setup.ps1 -EnvOnly # .env 再生成のみ
# ═══════════════════════════════════════════════════════════════
param(
    [switch]$NoUp,
    [switch]$Dev,
    [switch]$EnvOnly,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SecretsEnv = Join-Path $ProjectRoot ".env.secrets"
$DotEnv = Join-Path $ProjectRoot ".env"

# ─── Helpers ────────────────────────────────────────────────

function Write-Header {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║   Schedula — 初回セットアップ                ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step  { param([string]$M) Write-Host "▸ $M" -ForegroundColor Green }
function Write-Info  { param([string]$M) Write-Host "  $M" -ForegroundColor Cyan }
function Write-Warn  { param([string]$M) Write-Host "  ⚠ $M" -ForegroundColor Yellow }
function Write-Err   { param([string]$M) Write-Host "  ✗ $M" -ForegroundColor Red }

function Read-YesNo {
    param([string]$Prompt, [string]$Default = "y")
    if ($Default -eq "y") {
        $result = Read-Host "  $Prompt [Y/n]"
        if ([string]::IsNullOrWhiteSpace($result)) { $result = "y" }
    } else {
        $result = Read-Host "  $Prompt [y/N]"
        if ([string]::IsNullOrWhiteSpace($result)) { $result = "n" }
    }
    return $result -match "^[Yy]"
}

function Get-EnvValue {
    param([string]$FilePath, [string]$Key, [string]$Fallback = "")
    if (Test-Path $FilePath) {
        $line = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
        if ($line) { return ($line -split "=", 2)[1] }
    }
    return $Fallback
}

function Assert-Npx {
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Err "npx が見つかりません。Node.js をインストールしてください。"
        exit 1
    }
}

# ─── Step 1: Infisical Setup ───────────────────────────────

function Setup-Infisical {
    Write-Step "Step 1/2: Infisical 認証設定"
    Write-Host ""

    if (Test-Path $SecretsEnv) {
        Write-Info "既存の .env.secrets が見つかりました。"
        $existingId = Get-EnvValue $SecretsEnv "INFISICAL_CLIENT_ID"
        if ($existingId) {
            $masked = $existingId.Substring(0, [Math]::Min(8, $existingId.Length)) + "..."
            Write-Info "  Client ID: $masked"
        }
        Write-Host ""

        if (-not (Read-YesNo "Infisical の設定を変更しますか?" "n")) {
            Write-Info "既存の設定を使用します。"
            return
        }
    }

    Assert-Npx
    Write-Host ""

    Push-Location $ProjectRoot
    try { npx tsx packages/env-cli/src/cli.ts setup }
    finally { Pop-Location }
}

# ─── Step 2: Generate .env ─────────────────────────────────

function Generate-DotEnv {
    Write-Step "Step 2/2: .env 生成 (Infisical → Docker 用)"
    Write-Host ""

    if (-not (Test-Path $SecretsEnv)) {
        Write-Err ".env.secrets が見つかりません。先に Infisical のセットアップを実行してください。"
        exit 1
    }

    Assert-Npx

    Push-Location $ProjectRoot
    try { npx tsx packages/env-cli/src/cli.ts env }
    finally { Pop-Location }
}

# ─── Step 3: Docker Compose Up ──────────────────────────────

function Start-Docker {
    param([switch]$DevMode)

    if (-not (Test-Path $DotEnv)) {
        Write-Err ".env が見つかりません。先に env を実行してください。"
        exit 1
    }

    Write-Step "Docker Compose を起動します..."
    Write-Host ""

    Push-Location $ProjectRoot
    try {
        if ($DevMode) {
            Write-Info "開発モード (docker-compose.dev.yaml)"
            docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
        } else {
            docker compose up -d
        }
    } finally { Pop-Location }

    Write-Host ""
    Write-Info "起動完了!"

    $fp = Get-EnvValue $DotEnv "FRONTEND_PORT" "8080"
    $bp = Get-EnvValue $DotEnv "BACKEND_PORT" "3000"

    Write-Host ""
    Write-Host "  アクセス URL:" -ForegroundColor White
    Write-Info "  Frontend: http://localhost:${fp}"
    Write-Info "  Backend:  http://localhost:${bp}"
    Write-Info "  API:      http://localhost:${bp}/api"
    Write-Host ""
    Write-Info "ログ確認: docker compose logs -f"
    Write-Info "停止:     docker compose down"
}

# ─── Main ───────────────────────────────────────────────────

if ($Help) {
    Write-Host "Usage: .\scripts\setup.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  (default)    Infisical 設定 → .env 生成 → Docker 起動"
    Write-Host "  -NoUp        セットアップのみ (Docker 起動しない)"
    Write-Host "  -Dev         開発モードで起動"
    Write-Host "  -EnvOnly     .env 再生成のみ (Infisical 設定スキップ)"
    Write-Host "  -Help        このヘルプを表示"
    exit 0
}

Write-Header

if ($EnvOnly) {
    Generate-DotEnv
} else {
    Setup-Infisical
    Write-Host ""
    Generate-DotEnv
}

Write-Host ""

if ($NoUp -or $EnvOnly) {
    Write-Step "完了"
    Write-Info "Docker を起動するには: docker compose up -d"
} elseif ($Dev) {
    Start-Docker -DevMode
} else {
    Start-Docker
}
