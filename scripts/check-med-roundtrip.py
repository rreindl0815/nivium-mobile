#!/usr/bin/env python3
import json
import re
from pathlib import Path

CASES_PATH = Path(__file__).with_name("med-roundtrip-cases.json")


def parse_formatted_profile(formatted_text: str):
    metadata, layers, temperatures, stability_tests, notes = [], [], [], [], []
    stability_pattern = re.compile(
        r"\b(?:CT(?:E|M|H)?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|"
        r"ECT[PNX]?\d*(?:\s+(?:SP|SC|PC|RP|BRK))?\s*(?:at\s+\d+(?:\.\d+)?\s*cm)?|"
        r"PST\s+\d+(?:\.\d+)?/\d+(?:\.\d+)?(?:\s+(?:END|ARR|SF))?\s+at\s+\d+(?:\.\d+)?\s*cm|"
        r"HS\s+(?:easy|moderate|hard)\s+at\s+\d+(?:\.\d+)?\s*cm|"
        r"SS\s+(?:easy|moderate|hard)(?:\s+(?:SP|SC|PC|RP|BRK))?\s+at\s+\d+(?:\.\d+)?\s*cm|"
        r"RB\d+\s+at\s+\d+(?:\.\d+)?\s*cm)\b",
        re.I,
    )

    for line in [x.strip() for x in formatted_text.splitlines() if x.strip()]:
        md = re.match(r"^([^:]+):\s*(.+)$", line)
        if md:
            metadata.append({"label": md.group(1), "value": md.group(2)})
            continue
        if re.match(r"^-?\d+(?:\.\d+)?\s+(?:surface|\d+(?:\.\d+)?cm)$", line, re.I):
            temperatures.append(line)
            continue
        if re.match(r"^(CT|ECT|PST|HS|SS|DT|RB)", line, re.I):
            found = [re.sub(r"\s+", " ", m.group(0)).strip() for m in stability_pattern.finditer(line)]
            (found if found else [line]).__iter__()
            for test in (found if found else [line]):
                stability_tests.append(test)
            continue
        if re.match(r"^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+", line, re.I):
            found = [re.sub(r"\s+", " ", m.group(0)).strip() for m in stability_pattern.finditer(line)]
            cleaned = re.sub(stability_pattern, " ", line)
            cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
            layers.append(cleaned if re.match(r"^\d+(?:\.\d+)?-\d+(?:\.\d+)?\s+", cleaned, re.I) else line)
            for test in found:
                stability_tests.append(test)
            continue
        notes.append(line)

    return {
        "metadata": metadata,
        "layers": layers,
        "temperatures": temperatures,
        "stability_tests": stability_tests,
        "notes": notes,
    }


def parse_legacy_layer_line(line: str):
    m = re.match(r"^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s+(.+)$", line.strip())
    if not m:
        return None
    top, bottom, tail = m.group(1), m.group(2), m.group(3)
    parts = [p.strip() for p in tail.split("|", 1)]
    main = parts[0]
    comment = parts[1] if len(parts) > 1 else ""
    is_red = bool(re.search(r"\bred\b", main, re.I))
    tokens = (
        re.sub(r"\s+", " ", re.sub(r"\s*/\s*", "/", re.sub(r"(\d+(?:\.\d+)?)\s*(mm|cm)\b", r"\1\2", re.sub(r"\bred\b", "", main, flags=re.I))))
        .strip()
        .split(" ")
    )
    grain = next((t for t in tokens if re.match(r"^(PP|DF|RG|FC|FCxr|SH|DH|MF|IF|IFrc|MFcr)(/(PP|DF|RG|FC|FCxr|SH|DH|MF|IF|IFrc|MFcr))?$", t, re.I)), "")
    hardness = next((t for t in tokens if re.match(r"^(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I)(-(F|F\+|4F|4F\+|1F|1F\+|P|P\+|K|K\+|I))?$", t, re.I)), "")
    size = next((t for t in tokens if re.match(r"^\d+(?:\.\d+)?(mm|cm)(/\d+(?:\.\d+)?(mm|cm))?$", t, re.I)), "")
    return {"top": top, "bottom": bottom, "grain": grain, "hardness": hardness, "size": size, "comment": comment, "concern": "yes" if is_red else "no"}


def parse_stability_line(line: str):
    normalized = re.sub(r"\s+", " ", line.replace(",", " ")).strip()
    up = normalized.upper()
    if up.startswith("ECT"):
        t = "ECT"
    elif up.startswith("CT"):
        t = "CT"
    elif up.startswith("PST"):
        t = "PST"
    elif up.startswith("SS"):
        t = "SS"
    elif up.startswith("HS"):
        t = "HS"
    elif up.startswith("RB"):
        t = "RB"
    else:
        return None

    depth = (re.search(r"\bat\s+(\d+(?:\.\d+)?)\s*cm\b", normalized, re.I) or [None, ""])[1]
    taps = (re.search(r"\b(\d{1,2})\s*taps?\b", normalized, re.I) or [None, ""])[1]
    character = ((re.search(r"\b(SC|SP|PC|RP|BRK)\b", normalized, re.I) or [None, ""])[1]).upper()
    result, pst_cut, pst_column = "", "", ""

    if t == "CT":
        code = (re.search(r"\bCT([EMH])\b", normalized, re.I) or [None, ""])[1].upper()
        result = {"E": "easy", "M": "moderate", "H": "hard"}.get(code, "")
        if not taps:
            compact = re.search(r"\bCT(?:E|M|H)?\s*(\d{1,2})\b", normalized, re.I)
            if compact:
                taps = compact.group(1)
    elif t == "ECT":
        ect = re.search(r"\bECT([NPX])(\d{1,2})?\b", normalized, re.I)
        if ect:
            result = f"ECT{ect.group(1).upper()}"
            if ect.group(2) and not taps:
                taps = ect.group(2)
    elif t == "PST":
        pst = re.search(r"\b(END|ARR|SF)\b", normalized, re.I)
        if pst:
            result = pst.group(1).capitalize()
        col = re.search(r"\b(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\b", normalized)
        if col:
            pst_cut, pst_column = col.group(1), col.group(2)
    elif t == "RB":
        rb = re.search(r"\b(RB[1-7])\b", normalized, re.I)
        if rb:
            result = rb.group(1).upper()

    return {"type": t, "depth": depth, "taps": taps, "character": character, "result": result, "pst_cut": pst_cut, "pst_column": pst_column}


def serialize_layer(layer):
    main = " ".join([x for x in [f"{layer['top']}-{layer['bottom']}", layer["grain"], layer["hardness"], layer["size"], "red" if layer["concern"] == "yes" else ""] if x]).strip()
    return f"{main} | {layer['comment']}".strip() if layer["comment"] else main


def normalize_line(s: str):
    return re.sub(r"\s+", " ", s).strip().upper()


def run_case(case):
    parsed = parse_formatted_profile(case["formattedText"])
    hydrated_layers = [x for x in (parse_legacy_layer_line(line) for line in parsed["layers"]) if x]
    hydrated_tests = [x for x in (parse_stability_line(line) for line in parsed["stability_tests"]) if x]
    out_layers = [serialize_layer(x) for x in hydrated_layers]
    layer_loss = len(out_layers) != len(parsed["layers"])
    test_loss = len(hydrated_tests) != len(parsed["stability_tests"])
    layer_diff = any(normalize_line(out_layers[i]) != normalize_line(parsed["layers"][i]) for i in range(min(len(out_layers), len(parsed["layers"]))))
    return {
        "name": case["name"],
        "pass": not (layer_loss or test_loss or layer_diff),
        "details": {
            "input_layers": len(parsed["layers"]),
            "output_layers": len(out_layers),
            "input_tests": len(parsed["stability_tests"]),
            "output_tests": len(hydrated_tests),
            "layer_diff": layer_diff,
        },
    }


def main():
    cases = json.loads(CASES_PATH.read_text())
    results = [run_case(c) for c in cases]
    failed = [r for r in results if not r["pass"]]

    print(f"MED roundtrip regression: {len(cases)} case(s)")
    for result in results:
        if result["pass"]:
            print(f"[PASS] {result['name']}")
        else:
            print(f"[FAIL] {result['name']} {result['details']}")

    if failed:
        raise SystemExit(1)
    print("All MED roundtrip checks passed.")


if __name__ == "__main__":
    main()
