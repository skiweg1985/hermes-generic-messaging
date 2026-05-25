#!/usr/bin/env bash
# Create a project venv and install hermes-generic-messaging (editable).
# Use this on Linux hosts where system pip cannot write site-packages
# or user-site installs are disabled.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
EXTRAS="${EXTRAS:-dev,web}"

echo "Using: $($PYTHON --version)"
$PYTHON -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip setuptools wheel
pip install -e ".[${EXTRAS}]"
echo ""
echo "Done. Activate with:"
echo "  source $ROOT/.venv/bin/activate"
