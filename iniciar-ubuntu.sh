#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Necesitas Node.js 20 o posterior instalado.' >&2
  exit 1
fi
echo 'Abre http://localhost:4173 en el navegador. Para detener, pulsa Ctrl+C.'
node server.js
