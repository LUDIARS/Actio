# ═══════════════════════════════════════════════════════════════
# Schedula — Docker 起動前セットアップスクリプト (Windows PowerShell)
#
# Usage:
#   .\scripts\setup.ps1          # 対話セットアップ → docker compose up
#   .\scripts\setup.ps1 -NoUp    # セットアップのみ (Docker 起動しない)
#   .\scripts\setup.ps1 -Dev     # 開発モードで docker compose up
# ═══════════════════════════════════════════════════════════════
param(
    [switch]$NoUp,
    [switch]$Dev,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$InfraEnv = Join-Path $ProjectRoot "config\infra.env"
$InfraEnvExample = Join-Path $ProjectRoot "config\infra.env.example"
$SecretsEnv = Join-Path $ProjectRoot ".env.secrets"

# ─── Helpers ────────────────────────────────────────────────

function Write-Header {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║   Schedula — 初回セットアップ                ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host "▸ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Read-Value {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )
    if ($Default) {
        $result = Read-Host "  $Prompt [$Default]"
        if ([string]::IsNullOrWhiteSpace($result)) { return $Default }
        return $result
    }
    else {
        return Read-Host "  $Prompt"
    }
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [string]$Default = "y"
    )
    if ($Default -eq "y") {
        $result = Read-Host "  $Prompt [Y/n]"
        if ([string]::IsNullOrWhiteSpace($result)) { $result = "y" }
    }
    else {
        $result = Read-Host "  $Prompt [y/N]"
        if ([string]::IsNullOrWhiteSpace($result)) { $result = "n" }
    }
    return $result -match "^[Yy]"
}

function Get-EnvValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Fallback = ""
    )
    if (Test-Path $FilePath) {
        $line = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
        if ($line) {
            return ($line -split "=", 2)[1]
        }
    }
    return $Fallback
}

# ─── Step 1: Infrastructure Config ──────────────────────────

function Setup-Infra {
    Write-Step "Step 1/2: インフラ設定 (config\infra.env)"
    Write-Host ""

    if (Test-Path $InfraEnv) {
        Write-Info "既存の config\infra.env が見つかりました。"
        Write-Host ""

        Get-Content $InfraEnv | Where-Object { $_ -and -not $_.StartsWith("#") } | ForEach-Object {
            Write-Info "  $_"
        }
        Write-Host ""

        if (-not (Read-YesNo "設定を変更しますか?" "n")) {
            Write-Info "スキップしました。"
            return
        }
    }
    else {
        Write-Info "config\infra.env が見つかりません。テンプレートから作成します。"
        Write-Host ""
    }

    $sourceFile = if (Test-Path $InfraEnv) { $InfraEnv } else { $InfraEnvExample }

    # Read current/default values
    $curFrontendPort = Get-EnvValue $sourceFile "FRONTEND_PORT" "8080"
    $curBackendPort  = Get-EnvValue $sourceFile "BACKEND_PORT" "3000"
    $curDbPort       = Get-EnvValue $sourceFile "DB_PORT" "5432"
    $curRedisPort    = Get-EnvValue $sourceFile "REDIS_PORT" "6379"
    $curDbDialect    = Get-EnvValue $sourceFile "DB_DIALECT" "postgres"
    $curPgUser       = Get-EnvValue $sourceFile "POSTGRES_USER" "schedula"
    $curPgPass       = Get-EnvValue $sourceFile "POSTGRES_PASSWORD" "schedula"
    $curPgDb         = Get-EnvValue $sourceFile "POSTGRES_DB" "schedula"

    Write-Host "  ポート設定:" -NoNewline
    Write-Host ""
    $frontendPort = Read-Value "Frontend ポート" $curFrontendPort
    $backendPort  = Read-Value "Backend ポート" $curBackendPort
    $dbPort       = Read-Value "PostgreSQL ポート" $curDbPort
    $redisPort    = Read-Value "Redis ポート" $curRedisPort

    Write-Host ""
    Write-Host "  データベース設定:" -NoNewline
    Write-Host ""
    $dbDialect = Read-Value "DB方言 (postgres/sqlite/mysql)" $curDbDialect
    $pgUser    = Read-Value "PostgreSQL ユーザー" $curPgUser
    $pgPass    = Read-Value "PostgreSQL パスワード" $curPgPass
    $pgDb      = Read-Value "PostgreSQL データベース名" $curPgDb

    $databaseUrl = "postgresql://${pgUser}:${pgPass}@db:5432/${pgDb}"

    # Ensure config directory exists
    $configDir = Split-Path $InfraEnv -Parent
    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    # Write config
    @"
# --- Infrastructure Configuration ---
# setup.ps1 で自動生成。手動編集可。

# --- Port Configuration ---
FRONTEND_PORT=$frontendPort
BACKEND_PORT=$backendPort
DB_PORT=$dbPort
REDIS_PORT=$redisPort

# --- Database ---
DB_DIALECT=$dbDialect
POSTGRES_USER=$pgUser
POSTGRES_PASSWORD=$pgPass
POSTGRES_DB=$pgDb

# --- Internal Service URLs (Docker network) ---
DATABASE_URL=$databaseUrl
REDIS_URL=redis://redis:${redisPort}
"@ | Set-Content -Path $InfraEnv -Encoding UTF8

    Write-Host ""
    Write-Info "config\infra.env を保存しました。"
}

# ─── Step 2: Secrets (Infisical) ────────────────────────────

function Setup-Secrets {
    Write-Step "Step 2/2: シークレット管理 (Infisical)"
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
            Write-Info "スキップしました。"
            return
        }
    }

    if (-not (Read-YesNo "Infisical でシークレットを管理しますか?" "y")) {
        Write-Warn "スキップしました。環境変数フォールバックモードで動作します。"
        Write-Warn ".env ファイルに JWT_SECRET 等を直接設定してください。"
        return
    }

    # Check npx
    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Err "npx が見つかりません。Node.js をインストールしてください。"
        return
    }

    Write-Host ""
    Write-Info "secrets-cli を起動します..."
    Write-Host ""

    Push-Location $ProjectRoot
    try {
        npx tsx scripts/secrets-cli.ts setup
    }
    finally {
        Pop-Location
    }
}

# ─── Step 3: Docker Compose Up ──────────────────────────────

function Start-Docker {
    param([switch]$DevMode)

    Write-Step "Docker Compose を起動します..."
    Write-Host ""

    Push-Location $ProjectRoot
    try {
        if ($DevMode) {
            Write-Info "開発モード (docker-compose.dev.yaml)"
            docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
        }
        else {
            docker compose up -d
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Info "起動完了!"

    $fp = Get-EnvValue $InfraEnv "FRONTEND_PORT" "8080"
    $bp = Get-EnvValue $InfraEnv "BACKEND_PORT" "3000"

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
    Write-Host "  -NoUp     セットアップのみ (Docker 起動しない)"
    Write-Host "  -Dev      開発モードで起動"
    Write-Host "  -Help     このヘルプを表示"
    exit 0
}

Write-Header

# Step 1
Setup-Infra
Write-Host ""

# Step 2
Setup-Secrets
Write-Host ""

# Step 3
if ($NoUp) {
    Write-Step "セットアップ完了"
    Write-Info "Docker を起動するには: docker compose up -d"
}
elseif ($Dev) {
    Start-Docker -DevMode
}
else {
    Start-Docker
}
