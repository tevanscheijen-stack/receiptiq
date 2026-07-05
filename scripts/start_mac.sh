#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUN_DIR="$ROOT_DIR/.receiptiq"
LOG_DIR="$RUN_DIR/logs"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"

fail() {
  printf "\nReceiptIQ could not start.\n\n"
  printf "%s\n\n" "$1"
  if [ "${DEBUG:-false}" = "true" ]; then
    printf "Backend log:\n"
    [ -f "$BACKEND_LOG" ] && cat "$BACKEND_LOG"
    printf "\nFrontend log:\n"
    [ -f "$FRONTEND_LOG" ] && cat "$FRONTEND_LOG"
  else
    printf "Logs were saved here:\n%s\n" "$LOG_DIR"
    printf "Run again with DEBUG=true if you want to see the technical details.\n"
  fi
  exit 1
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1
}

wait_for_service() {
  local label="$1"
  local url="$2"
  local pid_file="$3"
  local attempts=60
  local attempt=1

  while [ "$attempt" -le "$attempts" ]; do
    if ! is_running "$pid_file"; then
      rm -f "$pid_file"
      fail "$label stopped before it was ready."
    fi
    if "$BACKEND_DIR/.venv/bin/python" -c "import urllib.request; urllib.request.urlopen('$url', timeout=1).read()" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  fail "$label did not become ready in time."
}

if [ ! -x "$BACKEND_DIR/.venv/bin/python" ]; then
  fail "ReceiptIQ has not been set up yet.

Run:
  ./scripts/setup_mac.sh"
fi

if ! command -v pnpm >/dev/null 2>&1; then
  fail "pnpm is missing. Run setup again:
  ./scripts/setup_mac.sh"
fi

if ! is_running "$BACKEND_PID"; then
  : >"$BACKEND_LOG"
  nohup bash -c 'cd "$1" && "$1/.venv/bin/alembic" upgrade head && exec "$1/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000' bash "$BACKEND_DIR" >>"$BACKEND_LOG" 2>&1 &
  printf "%s\n" "$!" >"$BACKEND_PID"
fi

if ! is_running "$FRONTEND_PID"; then
  : >"$FRONTEND_LOG"
  nohup bash -c 'cd "$1" && exec pnpm run dev --host 127.0.0.1 --port 5173' bash "$FRONTEND_DIR" >>"$FRONTEND_LOG" 2>&1 &
  printf "%s\n" "$!" >"$FRONTEND_PID"
fi

wait_for_service "Backend" "http://127.0.0.1:8000/health" "$BACKEND_PID"
wait_for_service "Frontend" "http://127.0.0.1:5173" "$FRONTEND_PID"

if command -v open >/dev/null 2>&1; then
  open "http://localhost:5173" >/dev/null 2>&1 || fail "ReceiptIQ is running, but macOS could not open the browser automatically.

Open this address manually:
  http://localhost:5173"
  BROWSER_STATUS="Browser opened"
else
  BROWSER_STATUS="Open http://localhost:5173"
fi

cat <<MESSAGE

========================================

ReceiptIQ running

Backend OK

Frontend OK

$BROWSER_STATUS

========================================
MESSAGE
