#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
. .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$PWD/.venv/bin" >> "$GITHUB_PATH"
fi

python - <<'PY'
import yaml
print(f"PyYAML {yaml.__version__} available")
PY
