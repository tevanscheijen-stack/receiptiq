#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../backend"
ruff check .
black --check .
pytest

cd ../frontend
CI=true pnpm run lint
CI=true pnpm run test
CI=true pnpm run build
