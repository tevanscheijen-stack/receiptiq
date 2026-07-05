#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../backend"
ruff check .
black --check .
pytest

cd ../frontend
pnpm run lint
pnpm run test
pnpm run build
