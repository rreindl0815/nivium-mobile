#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

def post_transcribe(endpoint: str, audio_path: Path, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    # Use curl instead of urllib to avoid local Python SSL CA issues.
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Audio regression check for /transcribe-format.")
    parser.add_argument("--audio", required=True, help="Absolute path to .m4a/.wav test file.")
    parser.add_argument(
        "--cases",
        default="./scripts/transcribe-audio-regression-cases.json",
        help="Path to audio regression case JSON.",
    )
    parser.add_argument(
        "--endpoint",
        default="https://api.nivium.ca/transcribe-format",
        help="Transcribe endpoint.",
    )
    parser.add_argument("--runs", type=int, default=5, help="Number of repeated runs.")
    parser.add_argument("--timeout", type=float, default=90.0, help="Request timeout seconds.")
    parser.add_argument(
        "--strict-identical",
        action="store_true",
        help="Fail if formattedText differs across runs.",
    )
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        return 2

    case_path = Path(args.cases)
    if not case_path.exists():
        print(f"Case file not found: {case_path}")
        return 2

    cases = json.loads(case_path.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        print("Case file must be a non-empty JSON array.")
        return 2

    has_failures = False
    print(f"Audio regression: {len(cases)} case(s), {args.runs} run(s) each")
    print(f"Endpoint: {args.endpoint}")
    print(f"Audio:    {audio_path}")

    for case in cases:
        name = str(case.get("name", "unnamed-audio-case"))
        must_contain = [str(x) for x in case.get("mustContain", [])]
        must_not_contain = [str(x) for x in case.get("mustNotContain", [])]
        expected_status = int(case.get("expectedStatus", 200))

        outputs: list[str] = []
        errors: list[str] = []
        unique: dict[str, int] = {}

        for run in range(1, args.runs + 1):
            status, parsed, raw = post_transcribe(args.endpoint, audio_path, args.timeout)
            if status != expected_status:
                errors.append(f"run {run}: expected HTTP {expected_status}, got {status}. body={raw}")
                continue
            if not parsed or not isinstance(parsed, dict):
                errors.append(f"run {run}: non-JSON response body={raw}")
                continue
            formatted = str(parsed.get("formattedText", "")).strip()
            if not formatted:
                errors.append(f"run {run}: empty formattedText")
                continue

            outputs.append(formatted)
            unique[formatted] = unique.get(formatted, 0) + 1

            for token in must_contain:
                if token not in formatted:
                    errors.append(f"run {run}: missing expected text: {token}")
            for token in must_not_contain:
                if token in formatted:
                    errors.append(f"run {run}: found forbidden text: {token}")

        if args.strict_identical and len(outputs) > 1:
            first = outputs[0]
            for i, out in enumerate(outputs[1:], start=2):
                if out != first:
                    errors.append(f"run {i}: output drifted from run 1")

        if errors:
            has_failures = True
            print(f"\n[FAIL] {name}")
            print(f"- unique outputs: {len(unique)} / {args.runs} runs")
            for idx, err in enumerate(errors[:12], start=1):
                print(f"  {idx}. {err}")
            if unique:
                top = sorted(unique.items(), key=lambda kv: kv[1], reverse=True)[:2]
                print("  top outputs:")
                for text, count in top:
                    print(f"  - count={count}")
                    print("    " + text.replace("\n", "\n    "))
        else:
            print(f"\n[PASS] {name} - stable and matched all constraints")

    if has_failures:
        print("\nAudio regression failed.")
        return 1

    print("\nAll audio regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
