#!/usr/bin/env bash
set -euo pipefail

AUDIO_PATH="${1:-/Users/robertreindl/Desktop/nivium-test.m4a}"
RUNS_PER_CYCLE="${2:-25}"
MAX_CYCLES="${3:-40}"
ENDPOINT="${4:-https://api.nivium.ca/transcribe-format}"
REPORT_DIR="${5:-/tmp/nivium-audio-regression}"

mkdir -p "$REPORT_DIR"

echo "Autonomous audio regression loop"
echo "Audio:           ${AUDIO_PATH}"
echo "Runs per cycle:  ${RUNS_PER_CYCLE}"
echo "Max cycles:      ${MAX_CYCLES}"
echo "Endpoint:        ${ENDPOINT}"
echo

for ((cycle=1; cycle<=MAX_CYCLES; cycle++)); do
  stamp="$(date +%Y%m%d-%H%M%S)"
  report="${REPORT_DIR}/cycle-${cycle}-${stamp}.log"
  echo "=== CYCLE ${cycle}/${MAX_CYCLES} ==="

  if python3 ./scripts/check-transcribe-audio.py \
    --audio "${AUDIO_PATH}" \
    --endpoint "${ENDPOINT}" \
    --runs "${RUNS_PER_CYCLE}" \
    --strict-identical | tee "${report}"; then
    echo
    echo "PASS at cycle ${cycle}. Report: ${report}"
    exit 0
  fi

  echo "Cycle ${cycle} failed. Report: ${report}"
  echo
done

echo "Reached max cycles without pass."
exit 1

