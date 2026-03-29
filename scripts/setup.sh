#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Schedula — Docker 起動前セットアップスクリプト
#
# Usage:
#   ./scripts/setup.sh          # 対話セットアップ → docker compose up
#   ./scripts/setup.sh --no-up  # セットアップのみ (Docker 起動しない)
#   ./scripts/setup.sh --dev    # 開発モードで docker compose up
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INFRA_ENV="$PROJECT_ROOT/config/infra.env"
INFRA_ENV_EXAMPLE="$PROJECT_ROOT/config/infra.env.example"
SECRETS_ENV="$PROJECT_ROOT/.env.secrets"

# Colors (disabled if not a TTY)
if [ -t 1 ]; then
  BOLD="\033[1m"
  GREEN="\033[32m"
  YELLOW="\033[33m"
  CYAN="\033[36m"
  RED="\033[31m"
  RESET="\033[0m"
else
  BOLD="" GREEN="" YELLOW="" CYAN="" RED="" RESET=""
fi

# ─── Helpers ────────────────────────────────────────────────

header() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║   Schedula — 初回セットアップ                ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}"
  echo ""
}

step() {
  echo -e "${BOLD}${GREEN}▸ $1${RESET}"
}

warn() {
  echo -e "${YELLOW}  ⚠ $1${RESET}"
}

info() {
  echo -e "  ${CYAN}$1${RESET}"
}

err() {
  echo -e "${RED}  ✗ $1${RESET}"
}

ask() {
  local prompt="$1"
  local default="${2:-}"
  local result

  if [ -n "$default" ]; then
    read -rp "  $prompt [$default]: " result
    echo "${result:-$default}"
  else
    read -rp "  $prompt: " result
    echo "$result"
  fi
}

ask_yn() {
  local prompt="$1"
  local default="${2:-y}"
  local result

  if [ "$default" = "y" ]; then
    read -rp "  $prompt [Y/n]: " result
    result="${result:-y}"
  else
    read -rp "  $prompt [y/N]: " result
    result="${result:-n}"
  fi

  [[ "$result" =~ ^[Yy] ]]
}

# ─── Step 1: Infrastructure Config ──────────────────────────

setup_infra() {
  step "Step 1/2: インフラ設定 (config/infra.env)"
  echo ""

  if [ -f "$INFRA_ENV" ]; then
    info "既存の config/infra.env が見つかりました。"
    echo ""
    # Show current values
    grep -v '^\s*#' "$INFRA_ENV" | grep -v '^\s*$' | while IFS='=' read -r key value; do
      info "  $key = $value"
    done
    echo ""

    if ! ask_yn "設定を変更しますか?" "n"; then
      info "スキップしました。"
      return
    fi
  else
    info "config/infra.env が見つかりません。テンプレートから作成します。"
    echo ""
  fi

  # Load defaults from existing file or example
  local source_file="$INFRA_ENV"
  if [ ! -f "$source_file" ]; then
    source_file="$INFRA_ENV_EXAMPLE"
  fi

  # Read current/default values
  local cur_frontend_port cur_backend_port cur_db_port cur_redis_port
  local cur_db_dialect cur_pg_user cur_pg_pass cur_pg_db

  cur_frontend_port=$(grep -E '^FRONTEND_PORT=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "8080")
  cur_backend_port=$(grep -E '^BACKEND_PORT=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "3000")
  cur_db_port=$(grep -E '^DB_PORT=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "5432")
  cur_redis_port=$(grep -E '^REDIS_PORT=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "6379")
  cur_db_dialect=$(grep -E '^DB_DIALECT=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "postgres")
  cur_pg_user=$(grep -E '^POSTGRES_USER=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "schedula")
  cur_pg_pass=$(grep -E '^POSTGRES_PASSWORD=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "schedula")
  cur_pg_db=$(grep -E '^POSTGRES_DB=' "$source_file" 2>/dev/null | cut -d= -f2 || echo "schedula")

  echo -e "  ${BOLD}ポート設定:${RESET}"
  local frontend_port backend_port db_port redis_port
  frontend_port=$(ask "Frontend ポート" "$cur_frontend_port")
  backend_port=$(ask "Backend ポート" "$cur_backend_port")
  db_port=$(ask "PostgreSQL ポート" "$cur_db_port")
  redis_port=$(ask "Redis ポート" "$cur_redis_port")

  echo ""
  echo -e "  ${BOLD}データベース設定:${RESET}"
  local db_dialect pg_user pg_pass pg_db
  db_dialect=$(ask "DB方言 (postgres/sqlite/mysql)" "$cur_db_dialect")
  pg_user=$(ask "PostgreSQL ユーザー" "$cur_pg_user")
  pg_pass=$(ask "PostgreSQL パスワード" "$cur_pg_pass")
  pg_db=$(ask "PostgreSQL データベース名" "$cur_pg_db")

  # Build DATABASE_URL
  local database_url="postgresql://${pg_user}:${pg_pass}@db:5432/${pg_db}"

  # Write config
  mkdir -p "$(dirname "$INFRA_ENV")"
  cat > "$INFRA_ENV" << ENVEOF
# ─── Infrastructure Configuration ─────────────────────────────
# setup.sh で自動生成。手動編集可。
# ──────────────────────────────────────────────────────────────

# ─── Port Configuration ──────────────────────────────────────
FRONTEND_PORT=${frontend_port}
BACKEND_PORT=${backend_port}
DB_PORT=${db_port}
REDIS_PORT=${redis_port}

# ─── Database ────────────────────────────────────────────────
DB_DIALECT=${db_dialect}
POSTGRES_USER=${pg_user}
POSTGRES_PASSWORD=${pg_pass}
POSTGRES_DB=${pg_db}

# ─── Internal Service URLs (Docker network) ──────────────────
DATABASE_URL=${database_url}
REDIS_URL=redis://redis:${redis_port}
ENVEOF

  echo ""
  info "config/infra.env を保存しました。"
}

# ─── Step 2: Secrets (Infisical) ────────────────────────────

setup_secrets() {
  step "Step 2/2: シークレット管理 (Infisical)"
  echo ""

  if [ -f "$SECRETS_ENV" ]; then
    info "既存の .env.secrets が見つかりました。"
    # Show masked client ID
    local existing_id
    existing_id=$(grep -E '^INFISICAL_CLIENT_ID=' "$SECRETS_ENV" 2>/dev/null | cut -d= -f2 || echo "")
    if [ -n "$existing_id" ]; then
      info "  Client ID: ${existing_id:0:8}..."
    fi
    echo ""

    if ! ask_yn "Infisical の設定を変更しますか?" "n"; then
      info "スキップしました。"
      return
    fi
  fi

  if ! ask_yn "Infisical でシークレットを管理しますか?" "y"; then
    warn "スキップしました。環境変数フォールバックモードで動作します。"
    warn ".env ファイルに JWT_SECRET 等を直接設定してください。"
    return
  fi

  # Check if tsx is available
  if ! command -v npx &>/dev/null; then
    err "npx が見つかりません。Node.js をインストールしてください。"
    return 1
  fi

  echo ""
  info "secrets-cli を起動します..."
  echo ""

  # Delegate to the TypeScript CLI for interactive setup
  (cd "$PROJECT_ROOT" && npx tsx scripts/secrets-cli.ts setup)
}

# ─── Step 3: Docker Compose Up ──────────────────────────────

docker_up() {
  local mode="${1:-}"

  step "Docker Compose を起動します..."
  echo ""

  cd "$PROJECT_ROOT"

  if [ "$mode" = "dev" ]; then
    info "開発モード (docker-compose.dev.yaml)"
    docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
  else
    docker compose up -d
  fi

  echo ""
  info "起動完了!"

  # Show access URLs
  local frontend_port backend_port
  frontend_port=$(grep -E '^FRONTEND_PORT=' "$INFRA_ENV" 2>/dev/null | cut -d= -f2 || echo "8080")
  backend_port=$(grep -E '^BACKEND_PORT=' "$INFRA_ENV" 2>/dev/null | cut -d= -f2 || echo "3000")

  echo ""
  echo -e "  ${BOLD}アクセス URL:${RESET}"
  info "  Frontend: http://localhost:${frontend_port}"
  info "  Backend:  http://localhost:${backend_port}"
  info "  API:      http://localhost:${backend_port}/api"
  echo ""
  info "ログ確認: docker compose logs -f"
  info "停止:     docker compose down"
}

# ─── Main ───────────────────────────────────────────────────

main() {
  local no_up=false
  local dev_mode=false

  for arg in "$@"; do
    case "$arg" in
      --no-up)  no_up=true ;;
      --dev)    dev_mode=true ;;
      --help|-h)
        echo "Usage: ./scripts/setup.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --no-up    セットアップのみ (Docker 起動しない)"
        echo "  --dev      開発モードで起動"
        echo "  --help     このヘルプを表示"
        exit 0
        ;;
    esac
  done

  header

  # Step 1: Infrastructure
  setup_infra

  echo ""

  # Step 2: Secrets
  setup_secrets

  echo ""

  # Step 3: Docker
  if [ "$no_up" = true ]; then
    step "セットアップ完了"
    info "Docker を起動するには: docker compose up -d"
  else
    if [ "$dev_mode" = true ]; then
      docker_up "dev"
    else
      docker_up
    fi
  fi
}

main "$@"
