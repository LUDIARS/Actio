#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Schedula — Docker 起動前セットアップスクリプト
#
# フロー:
#   1. secrets-cli setup  → Infisical 認証情報を .env.secrets に保存
#   2. secrets-cli env    → Infisical → Docker 用 .env を生成
#   3. docker compose up  → .env を読んで起動
#
# Usage:
#   ./scripts/setup.sh          # セットアップ → docker compose up
#   ./scripts/setup.sh --no-up  # セットアップのみ (Docker 起動しない)
#   ./scripts/setup.sh --dev    # 開発モードで docker compose up
#   ./scripts/setup.sh --env    # .env 再生成のみ (setup スキップ)
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SECRETS_ENV="$PROJECT_ROOT/.env.secrets"
DOTENV="$PROJECT_ROOT/.env"

# Colors (disabled if not a TTY)
if [ -t 1 ]; then
  BOLD="\033[1m" GREEN="\033[32m" YELLOW="\033[33m"
  CYAN="\033[36m" RED="\033[31m" RESET="\033[0m"
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

step() { echo -e "${BOLD}${GREEN}▸ $1${RESET}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${RESET}"; }
info() { echo -e "  ${CYAN}$1${RESET}"; }
err()  { echo -e "${RED}  ✗ $1${RESET}"; }

ask_yn() {
  local prompt="$1" default="${2:-y}" result
  if [ "$default" = "y" ]; then
    read -rp "  $prompt [Y/n]: " result; result="${result:-y}"
  else
    read -rp "  $prompt [y/N]: " result; result="${result:-n}"
  fi
  [[ "$result" =~ ^[Yy] ]]
}

require_npx() {
  if ! command -v npx &>/dev/null; then
    err "npx が見つかりません。Node.js をインストールしてください。"
    exit 1
  fi
}

# ─── Step 1: Infisical Setup ───────────────────────────────

setup_infisical() {
  step "Step 1/2: Infisical 認証設定"
  echo ""

  if [ -f "$SECRETS_ENV" ]; then
    info "既存の .env.secrets が見つかりました。"
    local existing_id
    existing_id=$(grep -E '^INFISICAL_CLIENT_ID=' "$SECRETS_ENV" 2>/dev/null | cut -d= -f2 || echo "")
    if [ -n "$existing_id" ]; then
      info "  Client ID: ${existing_id:0:8}..."
    fi
    echo ""

    if ! ask_yn "Infisical の設定を変更しますか?" "n"; then
      info "既存の設定を使用します。"
      return 0
    fi
  fi

  require_npx
  echo ""
  (cd "$PROJECT_ROOT" && npx tsx packages/env-cli/src/cli.ts setup)
}

# ─── Step 2: Generate .env ─────────────────────────────────

generate_dotenv() {
  step "Step 2/2: .env 生成 (Infisical → Docker 用)"
  echo ""

  if [ ! -f "$SECRETS_ENV" ]; then
    err ".env.secrets が見つかりません。先に Infisical のセットアップを実行してください。"
    exit 1
  fi

  require_npx
  (cd "$PROJECT_ROOT" && npx tsx packages/env-cli/src/cli.ts env)
}

# ─── Step 3: Docker Compose Up ──────────────────────────────

docker_up() {
  local mode="${1:-}"

  if [ ! -f "$DOTENV" ]; then
    err ".env が見つかりません。先に env を実行してください。"
    exit 1
  fi

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
  frontend_port=$(grep -E '^FRONTEND_PORT=' "$DOTENV" 2>/dev/null | cut -d= -f2 || echo "8080")
  backend_port=$(grep -E '^BACKEND_PORT=' "$DOTENV" 2>/dev/null | cut -d= -f2 || echo "3000")

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
  local no_up=false dev_mode=false env_only=false

  for arg in "$@"; do
    case "$arg" in
      --no-up)   no_up=true ;;
      --dev)     dev_mode=true ;;
      --env)     env_only=true ;;
      --help|-h)
        echo "Usage: ./scripts/setup.sh [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  (default)    Infisical 設定 → .env 生成 → Docker 起動"
        echo "  --no-up      セットアップのみ (Docker 起動しない)"
        echo "  --dev        開発モードで起動"
        echo "  --env        .env 再生成のみ (Infisical 設定スキップ)"
        echo "  --help       このヘルプを表示"
        exit 0
        ;;
    esac
  done

  header

  if [ "$env_only" = true ]; then
    # .env 再生成のみ
    generate_dotenv
  else
    # Full setup
    setup_infisical
    echo ""
    generate_dotenv
  fi

  echo ""

  if [ "$no_up" = true ] || [ "$env_only" = true ]; then
    step "完了"
    info "Docker を起動するには: docker compose up -d"
  elif [ "$dev_mode" = true ]; then
    docker_up "dev"
  else
    docker_up
  fi
}

main "$@"
