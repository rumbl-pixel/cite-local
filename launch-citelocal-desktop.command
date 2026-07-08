#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js first, then run this launcher again." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run bootstrap
npm run desktop
