#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "[setup] node_modules não encontrado. Executando npm install..."
  npm install
fi

echo "[build] Gerando site estático..."
npm run build
echo "[ok] Build atualizado em ./build"

if [[ "${1:-}" == "--serve" ]]; then
  PORT="${2:-8080}"
  echo "[serve] Servindo em http://localhost:${PORT}"

  if command -v python3 >/dev/null 2>&1; then
    cd build
    python3 -m http.server "$PORT"
  elif command -v npx >/dev/null 2>&1; then
    npx --yes serve build -l "$PORT"
  else
    echo "[erro] Não encontrei python3 nem npx para subir servidor local."
    exit 1
  fi
fi
