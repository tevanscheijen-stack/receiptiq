#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.receiptiq/logs"
SETUP_LOG="$LOG_DIR/setup.log"

mkdir -p "$LOG_DIR"
: >"$SETUP_LOG"

info() {
  printf "%s\n" "$1"
}

fail() {
  printf "\nReceiptIQ setup could not continue.\n\n"
  printf "%s\n\n" "$1"
  if [ "${DEBUG:-false}" = "true" ]; then
    printf "Debug log:\n"
    cat "$SETUP_LOG"
  else
    printf "A detailed log was saved here:\n%s\n" "$SETUP_LOG"
    printf "Run again with DEBUG=true if you want to see the technical details.\n"
  fi
  exit 1
}

find_python() {
  local candidate
  for candidate in python3.13 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 13) else 1)' >/dev/null 2>&1; then
        printf "%s" "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js 22 or newer is missing.

Install it with Homebrew:
  brew install node

If you do not have Homebrew, install Node.js from:
  https://nodejs.org/"
  fi

  local version
  version="$(node -v | sed 's/^v//')"
  local major
  major="${version%%.*}"
  if [ "$major" -lt 22 ]; then
    fail "Node.js is installed, but it is too old. ReceiptIQ needs Node.js 22 or newer.

Installed version: $version

Update it with:
  brew upgrade node"
  fi
}

check_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    fail "pnpm is missing.

Install it with:
  corepack enable
  corepack prepare pnpm@11.7.0 --activate

If that does not work, install it with Homebrew:
  brew install pnpm"
  fi
}

run_logged() {
  local message="$1"
  shift
  info "$message"
  if ! "$@" >>"$SETUP_LOG" 2>&1; then
    fail "This step failed: $message"
  fi
}

info "Setting up ReceiptIQ for macOS..."

PYTHON_BIN="$(find_python || true)"
if [ -z "$PYTHON_BIN" ]; then
  fail "Python 3.13 or newer is missing.

Install it with Homebrew:
  brew install python@3.13

If you do not have Homebrew, install Python from:
  https://www.python.org/downloads/macos/"
fi

check_node
check_pnpm

run_logged "Creating the private ReceiptIQ Python environment..." "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"

# shellcheck disable=SC1091
source "$BACKEND_DIR/.venv/bin/activate"

run_logged "Updating Python packaging tools..." python -m pip install --upgrade pip
run_logged "Installing ReceiptIQ backend..." python -m pip install -e "$BACKEND_DIR"
run_logged "Installing ReceiptIQ frontend..." pnpm --dir "$FRONTEND_DIR" install --frozen-lockfile
run_logged "Preparing the local database..." bash -c "cd '$BACKEND_DIR' && '$BACKEND_DIR/.venv/bin/alembic' upgrade head"

cat <<'MESSAGE'

=================================================

✅ ReceiptIQ is ready.

Run:

./scripts/start_mac.sh

=================================================
MESSAGE
