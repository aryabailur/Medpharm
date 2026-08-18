#!/usr/bin/env bash
# MedTrack — one-shot dev environment init.
# Installs deps for root workspaces, mobile, and nidana; brings up Postgres; runs migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Checking required tools"
for cmd in node npm docker python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required tool: $cmd" >&2
    exit 1
  fi
done

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "    Fill in secrets in .env before running the backend."
else
  echo "==> .env already exists, leaving as-is"
fi

echo "==> Installing root workspace dependencies (frontend + backend)"
npm install

echo "==> Installing mobile dependencies"
(cd mobile && npm install --legacy-peer-deps)

echo "==> Setting up nidana (Python) virtualenv"
if [ ! -d backend/nidana/.venv ]; then
  python3 -m venv backend/nidana/.venv
fi
# shellcheck disable=SC1091
source backend/nidana/.venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -r backend/nidana/requirements.txt
deactivate

echo "==> Starting Postgres (docker compose)"
npm run db:up

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -q 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "==> Running Prisma migrations"
npm run db:generate
npm run db:migrate

cat <<'EOF'

==> Setup complete.

Next steps:
  npm run dev:backend            # vayu-api :4000, dhanvantari-api :4001
  (cd backend/nidana && source .venv/bin/activate && uvicorn main:app --reload --port 8000)
  npm run dev:frontend           # vayu-web :3000, dhanvantari-web :3001
  (cd mobile && npx expo start)  # mobile app

EOF
