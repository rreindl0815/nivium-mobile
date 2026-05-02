#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def post_transcribe(endpoint: str, audio_path: Path, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    cmd = [
        "curl",
        "-sS",
        "-m",
        str(int(timeout)),
        "-w",
        "\nHTTP_STATUS=%{http_code}\n",
        endpoint,
        "-F",
        f"audio=@{audio_path}",
        "-F",
        "formatterVersion=nivium-ai-v1",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raw_err = (proc.stderr or proc.stdout or "").strip()
        return 0, None, f"curl failed: {raw_err}"

    raw = proc.stdout
    marker = "\nHTTP_STATUS="
    idx = raw.rfind(marker)
    if idx == -1:
        return 0, None, raw
    body = raw[:idx].strip()
    status_str = raw[idx + len(marker):].strip()
    try:
        status = int(status_str)
    except Exception:
        status = 0
    try:
        parsed = json.loads(body)
    except Exception:
        parsed = None
    return status, parsed, body


def parse_sections(formatted: str):
    metadata, layers, temps, stability, notes = [], [], [], [], []
    for line in [x.strip() for x in formatted.splitlines()]:
        if not line:
            continue
        if re.match(r"^[^:]+:\s+.+$", line):
            metadata.append(line)
        elif re.match(r"^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+", line, re.I):
            layers.append(line)
        elif re.match(r"^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$", line, re.I):
            temps.append(line)
        elif re.match(r"^(CT|ECT|PST|HS|SS|RB|DT)\b", line, re.I):
            stability.append(line)
        else:
            notes.append(line)
    return metadata, layers, temps, stability, notes


def serialize_sections(metadata: list[str], layers: list[str], temps: list[str], stability: list[str], notes: list[str]):
    blocks = []
    if metadata:
        blocks.append("\n".join(metadata))
    if layers:
        blocks.append("\n".join(layers))
    if temps:
        blocks.append("\n".join(temps))
    if stability:
        blocks.append("\n".join(stability))
    if notes:
        blocks.append("\n".join(notes))
    return "\n\n".join(blocks).strip()


def normalize_ws(text: str):
    return re.sub(r"\s+", " ", text).strip().upper()


@dataclass
class RunResult:
    ok: bool
    reason: str
    fingerprint: str


def run_single(endpoint: str, audio_path: Path, timeout: float, run_index: int) -> RunResult:
    status, payload, raw = post_transcribe(endpoint, audio_path, timeout)
    if status != 200:
        return RunResult(False, f"run {run_index}: expected HTTP 200, got {status}. body={raw}", "")
    if not payload or not isinstance(payload, dict):
        return RunResult(False, f"run {run_index}: non-JSON body={raw}", "")

    formatted = str(payload.get("formattedText", "")).strip()
    if not formatted:
        return RunResult(False, f"run {run_index}: empty formattedText", "")

    # User sequence simulation:
    # Voice Notes input -> Rendered profile parse -> MED open/hydrate -> tiny MED edit -> re-render text.
    md, layers, temps, stability, notes = parse_sections(formatted)
    if not layers:
        return RunResult(False, f"run {run_index}: no layers parsed from formatter output", "")
    if not stability:
        return RunResult(False, f"run {run_index}: no stability lines parsed from formatter output", "")

    base_layer_count = len(layers)
    base_stability_count = len(stability)

    # Small MED edit simulation: append deterministic note marker.
    edited_notes = list(notes)
    marker = "e2e-med-edit-marker"
    if not any("e2e-med-edit-marker" in line for line in edited_notes):
        edited_notes.append(marker)

    reserialized = serialize_sections(md, layers, temps, stability, edited_notes)
    md2, layers2, temps2, stability2, notes2 = parse_sections(reserialized)

    if len(layers2) != base_layer_count:
        return RunResult(False, f"run {run_index}: layer count changed after MED edit simulation ({base_layer_count} -> {len(layers2)})", "")
    if len(stability2) != base_stability_count:
        return RunResult(False, f"run {run_index}: stability count changed after MED edit simulation ({base_stability_count} -> {len(stability2)})", "")
    if not any("e2e-med-edit-marker" in line for line in notes2):
      return RunResult(False, f"run {run_index}: MED edit marker missing after re-render", "")

    fp = "\n".join(
        [
            "|".join([normalize_ws(x) for x in layers2]),
            "|".join([normalize_ws(x) for x in stability2]),
        ]
    )
    return RunResult(True, "", fp)


def main() -> int:
    parser = argparse.ArgumentParser(description="End-to-end user-sequence regression: voice -> render -> MED edit -> rerender.")
    parser.add_argument("--audio", required=True, help="Absolute path to audio file.")
    parser.add_argument("--endpoint", default="https://api.nivium.ca/transcribe-format", help="Transcribe endpoint.")
    parser.add_argument("--runs", type=int, default=10, help="Number of repeated runs.")
    parser.add_argument("--timeout", type=float, default=90.0, help="Request timeout seconds.")
    parser.add_argument("--strict-identical", action="store_true", help="Fail if layer+stability fingerprint drifts across runs.")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        return 2

    print(f"E2E user-sequence regression: {args.runs} run(s)")
    print(f"Endpoint: {args.endpoint}")
    print(f"Audio:    {audio_path}")

    failures: list[str] = []
    fingerprints: list[str] = []
    for run in range(1, args.runs + 1):
        result = run_single(args.endpoint, audio_path, args.timeout, run)
        if not result.ok:
            failures.append(result.reason)
        else:
            fingerprints.append(result.fingerprint)

    if args.strict_identical and len(fingerprints) > 1:
        first = fingerprints[0]
        for i, fp in enumerate(fingerprints[1:], start=2):
            if fp != first:
                failures.append(f"run {i}: layer/stability fingerprint drifted from run 1")

    if failures:
        print("[FAIL] E2E user-sequence regression")
        for idx, failure in enumerate(failures[:12], start=1):
            print(f"{idx}. {failure}")
        return 1

    print("[PASS] E2E user-sequence regression")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
