#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.receiptiq"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"

stop_process() {
  local label="$1"
  local pid_file="$2"

  if [ ! -f "$pid_file" ]; then
    printf "%s was not running.\n" "$label"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$pid_file"
    printf "%s was already stopped.\n" "$label"
    return 0
  fi

  printf "Stopping %s...\n" "$label"
  kill "$pid" >/dev/null 2>&1 || true

  local attempts=20
  local attempt=1
  while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempt" -le "$attempts" ]; do
    sleep 0.5
    attempt=$((attempt + 1))
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    printf "%s did not stop gracefully. Please close it from Activity Monitor or run with DEBUG=true for details.\n" "$label"
    return 1
  fi

  rm -f "$pid_file"
  printf "%s stopped.\n" "$label"
}

stop_process "Frontend" "$FRONTEND_PID"
stop_process "Backend" "$BACKEND_PID"

printf "\nReceiptIQ stopped.\n"

