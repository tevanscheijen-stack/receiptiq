#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
DATABASE_FILE="$BACKEND_DIR/receiptiq.sqlite3"
LOG_DIR="$ROOT_DIR/.receiptiq/logs"
RESET_LOG="$LOG_DIR/reset_database.log"

mkdir -p "$LOG_DIR"
: >"$RESET_LOG"

fail() {
  printf "\nThe ReceiptIQ database could not be reset.\n\n"
  printf "%s\n\n" "$1"
  if [ "${DEBUG:-false}" = "true" ]; then
    cat "$RESET_LOG"
  else
    printf "A detailed log was saved here:\n%s\n" "$RESET_LOG"
  fi
  exit 1
}

if [ ! -x "$BACKEND_DIR/.venv/bin/alembic" ]; then
  fail "ReceiptIQ has not been set up yet.

Run:
  ./scripts/setup_mac.sh"
fi

"$ROOT_DIR/scripts/stop_mac.sh" >>"$RESET_LOG" 2>&1 || fail "ReceiptIQ could not be stopped before resetting the database."

if [ -f "$DATABASE_FILE" ]; then
  rm "$DATABASE_FILE" || fail "The database file could not be deleted. Please stop ReceiptIQ and try again."
fi

if ! (cd "$BACKEND_DIR" && "$BACKEND_DIR/.venv/bin/alembic" upgrade head) >>"$RESET_LOG" 2>&1; then
  fail "ReceiptIQ could not create a fresh database."
fi

cat <<'MESSAGE'

ReceiptIQ database reset complete.

The local SQLite database was deleted and created again from migrations.
MESSAGE
