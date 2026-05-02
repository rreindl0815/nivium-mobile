#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /absolute/path/to/audio.m4a [runs]"
  exit 1
fi

AUDIO_PATH="$1"
RUNS="${2:-5}"
ENDPOINT="${NIVIUM_FORMATTER_ENDPOINT:-https://api.nivium.ca/transcribe-format}"

if [[ ! -f "$AUDIO_PATH" ]]; then
  echo "Audio file not found: $AUDIO_PATH"
  exit 1
fi

echo "Endpoint: $ENDPOINT"
echo "Audio:    $AUDIO_PATH"
echo "Runs:     $RUNS"
echo

for ((i=1; i<=RUNS; i++)); do
  echo "===== RUN $i ====="
  RESPONSE="$(
    curl -sS "$ENDPOINT" \
      -F "audio=@${AUDIO_PATH}" \
      -F "formatterVersion=nivium-ai-v1"
  )"

  # Print formattedText only (fallback to raw response if parse fails).
  python3 - <<'PY' "$RESPONSE"
import json, sys
raw = sys.argv[1]
try:
    obj = json.loads(raw)
except Exception:
    print(raw)
    raise SystemExit(0)

if "error" in obj:
    print("ERROR:", obj["error"])
else:
    print(obj.get("formattedText", "").strip())
PY
  echo
done

