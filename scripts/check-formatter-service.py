#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class CaseResult:
    name: str
    passed: bool
    details: str


def post_format(endpoint: str, raw_notes: str, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    payload = {
        "rawNotes": raw_notes,
        "source": "raw-notes-ai",
        "formatterVersion": "nivium-ai-v1",
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            parsed = json.loads(body)
            return resp.status, parsed, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = None
        return e.code, parsed, body


def ensure_contains(text: str, needles: list[str]) -> list[str]:
    errs: list[str] = []
    for needle in needles:
        if needle not in text:
            errs.append(f"missing expected text: {needle}")
    return errs


def ensure_not_contains(text: str, needles: list[str]) -> list[str]:
    errs: list[str] = []
    for needle in needles:
        if needle in text:
            errs.append(f"found forbidden text: {needle}")
    return errs


def run_case(
    endpoint: str,
    timeout: float,
    runs: int,
    case: dict[str, Any],
    strict_identical: bool,
) -> CaseResult:
    name = str(case.get("name", "unnamed-case"))
    raw_notes = str(case.get("rawNotes", "")).strip()
    if not raw_notes:
        return CaseResult(name, False, "rawNotes missing")

    expected_status = int(case.get("expectedStatus", 200))
    must_contain = [str(x) for x in case.get("mustContain", [])]
    must_not_contain = [str(x) for x in case.get("mustNotContain", [])]

    outputs: list[str] = []
    run_errors: list[str] = []

    for idx in range(runs):
        status, parsed, body = post_format(endpoint, raw_notes, timeout)
        if status != expected_status:
            run_errors.append(f"run {idx+1}: expected HTTP {expected_status}, got {status}. body={body}")
            continue
        if not parsed or not isinstance(parsed, dict):
            run_errors.append(f"run {idx+1}: non-JSON response body={body}")
            continue
        formatted = str(parsed.get("formattedText", "")).strip()
        if not formatted:
            run_errors.append(f"run {idx+1}: empty formattedText")
            continue

        local_errors = []
        local_errors.extend(ensure_contains(formatted, must_contain))
        local_errors.extend(ensure_not_contains(formatted, must_not_contain))
        if local_errors:
            run_errors.append(
                f"run {idx+1}: " + "; ".join(local_errors) + "\nformattedText:\n" + formatted
            )
        outputs.append(formatted)

    if strict_identical and len(outputs) > 1:
        first = outputs[0]
        for i, out in enumerate(outputs[1:], start=2):
            if out != first:
                run_errors.append(
                    f"run {i}: formattedText drifted from run 1\nrun1:\n{first}\n\nrun{i}:\n{out}"
                )

    if run_errors:
        return CaseResult(name, False, "\n".join(run_errors))

    return CaseResult(name, True, f"passed ({runs}/{runs})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Regression check for Nivium formatter service.")
    parser.add_argument(
        "--cases",
        default="./scripts/formatter-service-regression-cases.json",
        help="Path to regression case JSON file.",
    )
    parser.add_argument(
        "--endpoint",
        default="http://127.0.0.1:8788/format",
        help="Formatter service endpoint.",
    )
    parser.add_argument("--runs", type=int, default=3, help="Runs per case.")
    parser.add_argument("--timeout", type=float, default=90.0, help="Request timeout in seconds.")
    parser.add_argument(
        "--strict-identical",
        action="store_true",
        help="Fail if output differs across runs for a case.",
    )
    args = parser.parse_args()

    case_path = Path(args.cases)
    if not case_path.exists():
        print(f"Case file not found: {case_path}", file=sys.stderr)
        return 2

    data = json.loads(case_path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        print("Case file must be a non-empty JSON array.", file=sys.stderr)
        return 2

    print(f"Formatter regression: {len(data)} cases, {args.runs} run(s) each")
    print(f"Endpoint: {args.endpoint}")

    failures: list[CaseResult] = []
    for case in data:
        result = run_case(
            endpoint=args.endpoint,
            timeout=args.timeout,
            runs=args.runs,
            case=case,
            strict_identical=args.strict_identical,
        )
        status = "PASS" if result.passed else "FAIL"
        print(f"[{status}] {result.name} - {result.details.splitlines()[0] if result.details else ''}")
        if not result.passed:
            failures.append(result)

    if failures:
        print("\nRegression failures:")
        for failure in failures:
            print(f"\n--- {failure.name} ---")
            print(failure.details)
        return 1

    print("\nAll formatter service regression checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
