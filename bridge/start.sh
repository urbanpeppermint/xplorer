#!/usr/bin/env bash
# Peak path: on-device Specs testing
#   ./start.sh --probe   → prove Specs can reach this Mac (no vacuum keys)
#   ./start.sh           → live Tuya control (needs config.json)
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  . .venv/bin/activate
  pip install -r requirements.txt
else
  . .venv/bin/activate
fi

MODE="${1:-}"
if [[ "$MODE" == "--probe" ]]; then
  echo "Starting PROBE bridge for Specs↔Mac device test…"
  exec python server.py --probe
fi

if [[ ! -f config.json ]]; then
  cp config.example.json config.json
  echo "No vacuum keys yet."
  echo "  A) Device network peak first:  ./start.sh --probe"
  echo "  B) Then fill config.json via tinytuya wizard and: ./start.sh"
  exit 1
fi
exec python server.py
