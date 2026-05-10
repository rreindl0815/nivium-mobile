#!/usr/bin/env bash
set -euo pipefail

AUDIO_PATH="${1:-/Users/robertreindl/Desktop/Nivium Workspace/03 Audio Regression Files/nivium-test.m4a}"
RUNS="${2:-5}"
ENDPOINT="${3:-https://api.nivium.ca/transcribe-format}"
REPORT_DIR="${4:-/tmp/nivium-audio-regression}"

mkdir -p "$REPORT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_FILE="${REPORT_DIR}/audio-regression-${STAMP}.log"

echo "Audio regression starting..."
echo "Audio:    ${AUDIO_PATH}"
echo "Runs:     ${RUNS}"
echo "Endpoint: ${ENDPOINT}"
echo "Report:   ${REPORT_FILE}"
echo

python3 ./scripts/check-transcribe-audio.py \
  --audio "${AUDIO_PATH}" \
  --endpoint "${ENDPOINT}" \
  --runs "${RUNS}" \
  --strict-identical | tee "${REPORT_FILE}"
