#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null 2>&1 || { echo "uv is required to provision the VIGIA runtime." >&2; exit 2; }
uv venv --python 3.12 --allow-existing .venv
uv pip install --python .venv/bin/python -r workers/geospatial/requirements.txt -r scripts/requirements.txt
.venv/bin/python scripts/geo_doctor.py
