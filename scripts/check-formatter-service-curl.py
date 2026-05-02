#!/usr/bin/env python3
import argparse
import json
import subprocess
import time
from pathlib import Path
from typing import Any


def post_format(endpoint: str, raw_notes: str, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    payload = {
        "rawNotes": raw_notes,
        "source": "raw-notes-ai",
        "formatterVersion": "nivium-ai-v1",
    }
    cmd = [
        "curl",
        "-sS",
        "-m",
        str(int(timeout)),
        "-w",
        "\nHTTP_STATUS=%{http_code}\n",
        endpoint,
        "-H",
        "Content-Type: application/json",
        "-d",
        json.dumps(payload),
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


def is_retryable_transport_or_timeout(status: int, body: str) -> bool:
    b = (body or "").lower()
    if status == 0:
        return True
    if status == 500 and "timed out" in b:
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="./scripts/formatter-service-regression-cases.json")
    parser.add_argument("--endpoint", default="https://api.nivium.ca/format")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument("--transport-retries", type=int, default=2)
    parser.add_argument("--strict-identical", action="store_true")
    args = parser.parse_args()

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    print(f"Formatter regression (curl): {len(cases)} cases, {args.runs} run(s) each")
    print(f"Endpoint: {args.endpoint}")
    failed = False

    for case in cases:
        name = str(case.get("name", "unnamed-case"))
        raw_notes = str(case.get("rawNotes", "")).strip()
        expected_status = int(case.get("expectedStatus", 200))
        must_contain = [str(x) for x in case.get("mustContain", [])]
        must_not_contain = [str(x) for x in case.get("mustNotContain", [])]
        errs: list[str] = []
        outputs: list[str] = []

        for i in range(1, args.runs + 1):
            status, parsed, body = post_format(args.endpoint, raw_notes, args.timeout)
            retries_left = max(0, int(args.transport_retries))
            while is_retryable_transport_or_timeout(status, body) and retries_left > 0:
                retries_left -= 1
                time.sleep(0.5)
                status, parsed, body = post_format(args.endpoint, raw_notes, args.timeout)
            if status != expected_status:
                errs.append(f"run {i}: expected HTTP {expected_status}, got {status}. body={body}")
                continue
            if not parsed or not isinstance(parsed, dict):
                errs.append(f"run {i}: non-JSON response body={body}")
                continue
            text = str(parsed.get("formattedText", "")).strip()
            if not text:
                errs.append(f"run {i}: empty formattedText")
                continue
            outputs.append(text)
            for token in must_contain:
                if token not in text:
                    errs.append(f"run {i}: missing expected text: {token}")
            for token in must_not_contain:
                if token in text:
                    errs.append(f"run {i}: found forbidden text: {token}")

        if args.strict_identical and len(outputs) > 1:
            first = outputs[0]
            for i, out in enumerate(outputs[1:], start=2):
                if out != first:
                    errs.append(f"run {i}: formattedText drifted from run 1")

        if errs:
            failed = True
            print(f"[FAIL] {name}")
            for err in errs[:8]:
                print(f"  - {err}")
        else:
            print(f"[PASS] {name} - passed ({args.runs}/{args.runs})")

    if failed:
        print("\nFormatter regression failed.")
        return 1
    print("\nAll formatter regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
