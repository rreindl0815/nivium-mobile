#!/usr/bin/env python3
"""
Skeena Snow Profile Engine (v0.9) — PRINTSAFE (locked)

Changes vs v0.7:
- One font size for ALL user-entered text (profile + metadata + callouts): 18 pt.
- Narrow-layer vertical alignment:
    * Thin (<5 cm): suppress internal text, use callouts.
    * Narrow (=5 cm): render text on the BOTTOM boundary line (not centered).
- Callouts: leader starts at END of callout text and lands at the divider between Comments and Grain Size
  at the chosen boundary (top or bottom).
- Stability tests: if a stability test falls inside a thin (<5 cm) layer, it is rendered as an additional
  callout above/below the layer (choosing the side with more space; the longer callout gets the larger space).

Pipeline (permanent):
- Background = template-only PRINTSAFE PNG exported with Inkscape.
- Draw data on top into ONE PDF.
"""

import os, re, xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import List, Optional, Tuple, Dict

from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

SVG_NS = "http://www.w3.org/2000/svg"
INK_NS = "http://www.inkscape.org/namespaces/inkscape"
def q(t): return f"{{{SVG_NS}}}{t}"

# --- Font sizing (auto) -------------------------------------------------
# We match the permanent metadata label font in the template (e.g., "Date") by reading
# the <tspan> font-size and its parent <text> transform scale, then applying the SVG->PDF scale.
def _auto_font_all(template_svg_path: str, sx: float) -> int:
    """
    Returns a reasonable point size for ALL user-entered text.
    Strategy: find the "Date" label tspan font-size (in SVG units), multiply by its text transform scale,
    then by sx (SVG viewBox -> PDF units). Finally add a small readability bump.
    """
    try:
        tree = ET.parse(template_svg_path); root = tree.getroot()
        # locate <text> whose rendered text is "Date"
        date_text_el = None
        for el in root.iter():
            if el.tag == q('text'):
                txt = " ".join("".join(el.itertext()).split())
                if txt == "Date":
                    date_text_el = el
                    break
        if date_text_el is None:
            return 20  # fallback
        # tspan font-size
        tspan = None
        for ch in list(date_text_el):
            if ch.tag == q('tspan'):
                tspan = ch
                break
        if tspan is None:
            return 20
        style = tspan.attrib.get("style","")
        m = re.search(r'font-size:([0-9.]+)px', style)
        if not m:
            return 20
        fs = float(m.group(1))
        # transform scale
        tr = date_text_el.attrib.get("transform","")
        mm = re.search(r"matrix\(([^)]+)\)", tr)
        scale = 1.0
        if mm:
            vals = [float(v) for v in mm.group(1).split(",")]
            if len(vals) == 6:
                scale = vals[0]  # a
        size_svg = fs * scale
        size_pdf = size_svg * sx
        # bump slightly for field readability, clamp
        return int(max(16, min(34, round(size_pdf))))
    except Exception:
        return 20

FONT_ALL = 18  # placeholder; overwritten per-render

def svg_viewbox(svg_path: str) -> Tuple[float,float,float,float]:
    tree = ET.parse(svg_path); root = tree.getroot()
    vb = root.attrib.get("viewBox","").strip()
    if vb:
        x,y,w,h = [float(v) for v in vb.split()]
        return x,y,w,h
    w = float(root.attrib.get("width","1000").replace("px",""))
    h = float(root.attrib.get("height","1400").replace("px",""))
    return 0.0,0.0,w,h

def find_layer(root, label=None, id_=None):
    for el in root.iter():
        if el.tag == q('g'):
            if id_ and el.attrib.get('id') == id_:
                return el
            if label and el.attrib.get(f'{{{INK_NS}}}label') == label:
                return el
    return None

def parse_anchors(svg_path: str) -> Dict[str, Tuple[float,float]]:
    tree = ET.parse(svg_path); root = tree.getroot()
    anchors = {}
    for el in root.iter():
        if el.tag in (q('circle'), q('ellipse')):
            id_ = el.attrib.get('id','')
            if id_.startswith("anchor_meta_") and id_.endswith("_center"):
                cx = float(el.attrib.get('cx', el.attrib.get('x', 0)))
                cy = float(el.attrib.get('cy', el.attrib.get('y', 0)))
                anchors[id_] = (cx, cy)
            elif id_ == "anchor_notes_text_start":
                cx = float(el.attrib.get('cx', el.attrib.get('x', 0)))
                cy = float(el.attrib.get('cy', el.attrib.get('y', 0)))
                anchors[id_] = (cx, cy)

    # Compatibility: some templates use a text element as the Run Name anchor
    # e.g. <text id="run_name_anchor" x="..." y="...">. Map it to the
    # engine's expected key anchor_meta_run_name_center.
    def _xy_from_text(text_el):
        mat = _parse_matrix(text_el.attrib.get("transform", ""))
        if mat:
            _, _, _, _, e, f = mat
            return float(e), float(f)
        x = float(text_el.attrib.get('x', '0') or 0)
        y = float(text_el.attrib.get('y', '0') or 0)
        return x, y

    for el in root.iter():
        if el.tag == q('text') and el.attrib.get('id', '') == 'run_name_anchor':
            anchors['anchor_meta_run_name_center'] = _xy_from_text(el)
            break

    # Prefer deriving metadata anchors from the visible underline geometry in the
    # canonical template. This keeps the renderer aligned even if the invisible
    # helper circles drift out of date during Inkscape edits.
    meta_fields_by_column = [
        ["date", "time", "observer", "org"],
        ["elevation", "aspect", "slope_angle", "lat_long"],
        ["air_temp", "sky_cover", "precip", "wind"],
        ["total_hs", "surface_grain", "foot_pen", "ski_pen"],
    ]
    meta_paths = []
    for el in root.iter():
        if el.tag != q('path'):
            continue
        d = el.attrib.get("d", "")
        m = re.search(r"m\s*([0-9.+-]+),([0-9.+-]+)\s+h\s*([0-9.+-]+)(?:\s+([0-9.+-]+))?", d)
        if not m:
            continue
        x = float(m.group(1))
        y = float(m.group(2))
        w1 = float(m.group(3))
        w2 = float(m.group(4)) if m.group(4) is not None else 0.0
        w = abs(w1) + abs(w2)
        if 880 <= y <= 980 and 40 <= w <= 130 and x >= 120:
            meta_paths.append((x, y, w))

    if len(meta_paths) >= 16:
        cols = {}
        for x, y, w in sorted(meta_paths, key=lambda t: (t[0], t[1])):
            key = round(x, 1)
            cols.setdefault(key, []).append((x, y, w))
        if len(cols) >= 4:
            for col_index, key in enumerate(sorted(cols.keys())[:4]):
                rows = sorted(cols[key], key=lambda t: t[1])[:4]
                for row_index, (x, y, w) in enumerate(rows):
                    field = meta_fields_by_column[col_index][row_index]
                    anchors[f"anchor_meta_{field}_center"] = (x + (w / 2.0), y)
    return anchors

def detect_profile_frame_svg(svg_path: str) -> Tuple[float,float,float,float]:
    tree = ET.parse(svg_path); root = tree.getroot()
    template = find_layer(root, label="Template") or find_layer(root, id_="layer2")
    candidates = []
    def walk(el):
        for c in list(el):
            if c.tag == q('rect'):
                x=float(c.attrib.get('x',0)); y=float(c.attrib.get('y',0))
                w=float(c.attrib.get('width',0)); h=float(c.attrib.get('height',0))
                if w>200 and h>200:
                    candidates.append((w*h, x,y,w,h))
            walk(c)
    if template is not None:
        walk(template)
    if not candidates:
        _,_,w,h = svg_viewbox(svg_path)
        return (0.0,0.0,w,h)
    candidates.sort(reverse=True, key=lambda t:t[0])
    for _,x,y,w,h in candidates:
        if x>300:
            return (x,y,x+w,y+h)
    _,x,y,w,h = candidates[0]
    return (x,y,x+w,y+h)

def _parse_matrix(tr: str):
    m = re.search(r"matrix\(([^)]+)\)", tr or "")
    if not m:
        return None
    vals = [float(v) for v in m.group(1).split("," )]
    return vals if len(vals)==6 else None

def extract_tick_positions(svg_path: str):
    tree=ET.parse(svg_path); root=tree.getroot()
    hard_labels={"F","4F","1F","P","K","I"}
    temp_labels={str(v) for v in [0,-2,-4,-6,-8,-10,-12,-14,-16,-18,-20,-22]}
    hardness_x={}
    temp_x={}
    for el in root.iter():
        if el.tag != q('text'):
            continue
        txt="".join(el.itertext()).strip()
        if txt not in hard_labels and txt not in temp_labels:
            continue
        mat=_parse_matrix(el.attrib.get("transform",""))
        if mat:
            _,_,_,_,e,f = mat
            x=e; y=f
        else:
            x=float(el.attrib.get("x","0") or 0)
            y=float(el.attrib.get("y","0") or 0)
        if txt in hard_labels:
            if (txt not in hardness_x) or (y > hardness_x[txt][1]):
                hardness_x[txt]=(x,y)
        else:
            tv=int(txt)
            temp_x[tv]=(x,y)
    hardness_x={k:v[0] for k,v in hardness_x.items()}
    temp_x={k:v[0] for k,v in temp_x.items()}
    return hardness_x, temp_x

@dataclass
class Layer:
    top: float
    bottom: float
    hardness: str
    grain: str
    grain2: Optional[str]=None
    size_mm: Optional[float]=None
    size2_mm: Optional[float]=None
    is_crust: bool=False
    is_red: bool=False
    comment: Optional[str]=None

@dataclass
class Stability:
    code: str
    depth_cm: float

@dataclass
class ProfileData:
    metadata: Dict[str,str]
    total_hs_cm: float
    layers: List[Layer]
    temps: List[Tuple[float,float]]
    stabs: List[Stability]
    notes: Optional[str] = None

GRAIN_MAP = {
    "pp":"PP","pps":"PP","ppp":"PP","stellars":"PP","stellar":"PP","ppsd":"PP",
    "df":"DF","ef":"DF","decomposing":"DF","decomposing fragments":"DF","fragments":"DF",
    "rg":"RG","rgs":"RG","rounds":"RG","rounded":"RG","round":"RG",
    "fc":"FC","facets":"FC","faceted":"FC","facet":"FC",
    "fcxr":"FCxr","rounding facets":"FCxr","rounding facet":"FCxr",
    "dh":"DH","depth hoar":"DH",
    "sh":"SH","surface hoar":"SH",
    "mf":"MF","melt forms":"MF","meltform":"MF",
    "if":"IF","ice":"IF","ice formations":"IF","ice formation":"IF",
}
CRUST_MAP = {"rain crust":"IFrc","drizzle crust":"IFrc","sun crust":"MFcr"}

def norm(s:str)->str:
    return re.sub(r'\s+',' ', s.strip().lower())

def parse_temps(text: str) -> List[Tuple[float,float]]:
    """Parse engine-style snow temperature lines without reading layer ranges as temperatures."""
    temps: List[Tuple[float,float]] = []
    for raw in text.splitlines():
        line = re.sub(r'\s+', ' ', raw.strip().lower()).strip(' ,;')
        if not line:
            continue
        if line in {"temperature profile", "temperature profile:", "temperature", "temperature:"}:
            continue

        # surface: "-12 surface" / "-12 at surface"
        ms=re.fullmatch(r'(?:temperature\s*:?\s*)?(?:minus\s*)?(-?\s*[0-9]+(?:\.[0-9]+)?)\s*(?:at\s*)?surface', line)
        if ms:
            temps.append((0.0, -abs(float(ms.group(1)))))
            continue

        # temp-first: "-10 30cm" / "minus 10 30 cm"
        mt=re.fullmatch(r'(?:temperature\s*:?\s*)?(?:minus\s*)?(-?\s*[0-9]+(?:\.[0-9]+)?)\s+(\d+(?:\.\d+)?)\s*cm', line)
        if mt:
            temp=-abs(float(mt.group(1)))
            depth=float(mt.group(2))
            if 0 <= depth <= 600 and abs(temp) <= 60:
                temps.append((depth,temp))
            continue

        # depth-first: "30cm minus 8" / "30 cm -8"
        md=re.fullmatch(r'(?:temperature\s*:?\s*)?(\d+(?:\.\d+)?)\s*cm\s*(?:-|minus)\s*([0-9]+(?:\.\d+)?)', line)
        if md:
            depth=float(md.group(1))
            temp=-abs(float(md.group(2)))
            if 0 <= depth <= 600 and abs(temp) <= 60:
                temps.append((depth,temp))

    dedup: Dict[float,float] = {}
    for d,t in temps:
        dedup[d]=t
    return sorted(dedup.items(), key=lambda x:x[0])


def parse_layer_hardness(line: str) -> str:
    s = norm(line).replace("plus","+")
    def tok(x):
        x=x.strip()
        if x in ("fist","f"): return "F"
        if x in ("four finger","4f","forefinger"): return "4F"
        if x in ("one finger","1f"): return "1F"
        if x in ("pencil","p"): return "P"
        if x in ("knife","k"): return "K"
        if x in ("ice","i"): return "I"
        if x.upper() in ("F","4F","1F","P","K","I"): return x.upper()
        return ""

    # --- transitions (top->bottom hardness) ---
    # Accept: "4F to 1F", "4F-1F", "4F / 1F", "4F–1F", "4F->1F", with optional + on either side.
    s2 = s.replace("–","-").replace("—","-").replace("→","->")
    trans = re.search(
        r'(fist|four finger|4f|one finger|1f|pencil|knife|ice|\b[fpki]\b)\s*(\+)?\s*(?:to|[-/]|->)\s*'
        r'(fist|four finger|4f|one finger|1f|pencil|knife|ice|\b[fpki]\b)\s*(\+)?',
        s2
    )
    if trans:
        a = tok(trans.group(1)); b = tok(trans.group(3))
        if a and b:
            # keep + on the side it belongs to (affects block extent), then render as arrow for downstream drawing
            a_plus = "+" if (trans.group(2) or "") else ""
            b_plus = "+" if (trans.group(4) or "") else ""
            return f"{a}{a_plus}→{b}{b_plus}"

    # single (incl bare letters with +)
    m = re.search(r'\b(4f|1f|f|p|k|i|fist|pencil|knife|ice|one finger|four finger|forefinger)\b\s*(\+)?', s)
    if m:
        h=tok(m.group(1))
        plus=m.group(2) or ""
        return h+plus
    m = re.search(r'\b(4F|1F|F|P|K|I)\s*(\+)?\b', line)
    if m:
        return m.group(1) + (m.group(2) or "")
    if "ice hardness" in s:
        return "I"
    return ""
    # transition
    m = re.search(r'(fist|four finger|4f|one finger|1f|pencil|knife|ice|\b[fpki]\b)\s*\+?\s*to\s*(fist|four finger|4f|one finger|1f|pencil|knife|ice|\b[fpki]\b)', s)
    if m:
        a=tok(m.group(1)); b=tok(m.group(2))
        if a and b:
            return f"{a}→{b}"
    # single incl bare letters with +
    m = re.search(r'\b(4f|1f|f|p|k|i|fist|pencil|knife|ice|one finger|four finger|forefinger)\b\s*(\+)?', s)
    if m:
        h=tok(m.group(1))
        plus=m.group(2) or ""
        return h+plus
    m = re.search(r'\b(4F|1F|F|P|K|I)\s*(\+)?\b', line)
    if m:
        return m.group(1) + (m.group(2) or "")
    if "ice hardness" in s:
        return "I"
    return ""

def parse_stability(text: str) -> List[Stability]:
    """Parse stability tests.

    Supports both spoken forms ("compression test easy 4 taps at 47 cm") and
    compact code forms ("CTE7 SP at 67 cm", "CTE9 at 43 cm").

    Conservative: we only emit tests that include an explicit depth.
    """

    stabs: List[Stability] = []

    # 1) Line-based parsing for code-style entries (allows multiple tests)
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        l = re.sub(r'\s+', ' ', line)

        # NOTE: use word-boundaries (\b). A previous patch accidentally introduced
        # a literal backspace character (\x08) which prevented all matches.

        # --- CT (Compression Test) ---
        # Examples:
        #   CTE7 at 67 cm
        #   CTE7 SP at 67 cm
        m = re.search(
            r'\bCT\s*([EMH])\s*([0-9]{1,2})\s*(?:([A-Z]{2,3})\s*)?(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            res = m.group(1).upper()
            taps = m.group(2)
            fc = (m.group(3) or '').upper()
            depth = float(m.group(4))
            code = f"CT{res}{taps}" + (f" {fc}" if fc else "")
            stabs.append(Stability(code=code.strip(), depth_cm=depth))
            continue

        # --- ECT (Extended Column Test) ---
        # Industry-standard codes:
        #   ECTP12 at 45 cm
        #   ECTP12 SP at 45 cm
        #   ECTN22 at 80 cm
        #   ECTX at 60 cm
        m = re.search(
            r'\bECT\s*([PNX])\s*(?:([0-9]{1,2})\s*)?(?:([A-Z]{2,3})\s*)?(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            kind = m.group(1).upper()
            taps = (m.group(2) or '').strip()
            fc = (m.group(3) or '').upper()
            depth = float(m.group(4))
            code = f"ECT{kind}{taps}".strip() + (f" {fc}" if fc else "")
            stabs.append(Stability(code=code, depth_cm=depth))
            continue

        # --- PST (Propagation Saw Test) ---
        # Standard reporting examples:
        #   PST 30/100 END at 120 cm
        #   PST 40/100 ARR at 95 cm
        # Accept also spoken-ish: "PST 30 of 100 end at 120 cm"
        m = re.search(
            r'\bPST\s*([0-9]{1,3})\s*(?:/|of)\s*([0-9]{1,3})\s*([A-Z]{2,4})\s*(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            cut = m.group(1)
            total = m.group(2)
            outcome = m.group(3).upper()
            depth = float(m.group(4))
            code = f"PST {cut}/{total} {outcome}".strip()
            stabs.append(Stability(code=code, depth_cm=depth))
            continue

        # --- RB (Rutschblock) ---
        # Examples:
        #   RB5 at 42 cm
        #   RB5 SP at 42 cm
        #   RB RB5 at 42 cm
        m = re.search(
            r'\bRB\s*(?:\s*(RB)?\s*)?([1-7])\s*(?:([A-Z]{2,3})\s*)?(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            score = m.group(2)
            fc = (m.group(3) or '').upper()
            depth = float(m.group(4))
            code = f"RB{score}" + (f" {fc}" if fc else "")
            stabs.append(Stability(code=code.strip(), depth_cm=depth))
            continue

        # --- HS / SS (Hand Shear / Shovel Shear) ---
        # Support easy/moderate/hard (and optional fracture character for SS).
        # Examples:
        #   HS easy at 40 cm
        #   SS hard SP at 70 cm
        m = re.search(
            r'\b(HS|SS)\s*(easy|moderate|hard|e|m|h)\s*(?:([A-Z]{2,3})\s*)?(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            test = m.group(1).upper()
            strength = m.group(2).lower()
            fc = (m.group(3) or '').upper()
            depth = float(m.group(4))
            if strength in ('e', 'easy'):
                s_code = 'E'
            elif strength in ('m', 'moderate'):
                s_code = 'M'
            else:
                s_code = 'H'
            code = f"{test} {s_code}" + (f" {fc}" if (test == 'SS' and fc) else "")
            stabs.append(Stability(code=code.strip(), depth_cm=depth))
            continue

        # --- DT (Deep Tap) ---
        m = re.search(
            r'\bDT\s*([0-9]{1,2})\s*(?:at|@)\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*cm\b',
            l,
            flags=re.I,
        )
        if m:
            taps = m.group(1)
            depth = float(m.group(2))
            stabs.append(Stability(code=f"DT{taps}", depth_cm=depth))
            continue

    if stabs:
        return stabs

    # 2) Spoken compression test forms (legacy, single test)
    t = norm(text)

    # compression test easy four taps at 36 cm
    m = re.search(r'compression test\s*(easy|moderate|hard)\s*([0-9]+)\s*taps?\s*at\s*([0-9]+)', t)
    if m:
        res = m.group(1)
        taps = int(m.group(2))
        depth = float(m.group(3))
        code = 'CT' + res[0].upper() + str(taps)
        return [Stability(code=code, depth_cm=depth)]

    # compression test easy at 73 cm, 9 taps
    m = re.search(r'compression test\s*(easy|moderate|hard)\s*at\s*([0-9]+)\s*(?:cm|centimet(?:er|re)s)?\s*[, ]*\s*([0-9]+)\s*taps?', t)
    if m:
        res = m.group(1)
        depth = float(m.group(2))
        taps = int(m.group(3))
        code = 'CT' + res[0].upper() + str(taps)
        return [Stability(code=code, depth_cm=depth)]

    return []



def parse_dictation(text:str)->ProfileData:
    t=text.replace("centimeters","cm").replace("centimeter","cm").replace("meters","m").replace("meter","m")
    lines=[l.strip() for l in t.splitlines() if l.strip()]
    full=" | ".join(lines)
    md={}
    layers=[]

    # Build tokens so comma-separated dictation doesn't explode into every field
    tokens=[]
    for l in lines:
        l2=re.sub(r'(\d),(?=\d{3}\b)', r'\1', l)

        # Keep complete Lat/Long metadata lines intact so coordinate commas
        # are never split away from the second coordinate.
        if re.match(r'^\s*Lat\s*/?\s*Long\b', l2, flags=re.I):
            tokens.append(l2.strip())
            continue

        # Protect the comma between latitude and longitude so comma-splitting doesn't split coords
        # Example: 'lat, long 56°08\'19", -127°54\'38"' -> keep the coord comma intact.
        if re.search(r'\blat\b', l2, flags=re.I) and re.search(r'\b(long|lon)\b', l2, flags=re.I):
            l2 = re.sub(r'(\d["”]?)\s*,\s*(-?\d)', r'\1§§\2', l2, count=1)

        parts=[p.strip() for p in l2.split(",") if p.strip()]
        parts=[p.replace("§§", ", ") for p in parts]
        tokens.extend(parts)

    def grab_token(label, key):
        # accept "Label value" or "Label: value"
        for tok in tokens:
            m=re.match(rf'^\s*{label}\s*:?\s*(.+)$', tok, flags=re.I)
            if m:
                md[key]=m.group(1).strip(" ,.;")
                return

    grab_token("Date","date"); grab_token("Time","time"); grab_token("Observer","observer"); grab_token("Organization","org")
    grab_token("Run Name","run_name")
    for tok in tokens:
        m=re.search(r'\bElevation\b\s*:?\s*([0-9,]+)\s*(m|meter|meters|metre|metres|ft|feet|foot)\b', tok, flags=re.I)
        if m:
            unit = "ft" if re.match(r'^(?:ft|feet|foot)$', m.group(2), flags=re.I) else "m"
            md["elevation"]=m.group(1).replace(",","")+f" {unit}"
        m=re.search(r'\bAspect\b\s*:?\s*([A-Za-z]+)', tok, flags=re.I)
        if m: md["aspect"]=m.group(1).capitalize()
        m=re.search(r'\bSlope\s*angle\b\s*:?\s*([0-9]+)', tok, flags=re.I)
        if m: md["slope_angle"]=m.group(1)
        # Lat/Long (accept "Lat/Long:", "Lat Long", "lat, long", "latitude ... longitude ...")
        m=re.search(r'\bLat\s*/?\s*Long\b\s*:?\s*(.+)$', tok, flags=re.I)
        if m:
            val=m.group(1).strip(" ,.;")
            # normalize common separators
            val=re.sub(r'\s*[,;]\s*', ' ', val)
            md["lat_long"]=val
        else:
            m=re.search(r'\blat(?:itude)?\b\s*:?\s*([^,;]+)[,; ]+\blon(?:gitude)?\b\s*:?\s*(.+)$', tok, flags=re.I)
            if m:
                lat=m.group(1).strip(" ,.;")
                lon=m.group(2).strip(" ,.;")
                md["lat_long"]=f"{lat} {lon}"

        m=re.search(r'\bAir\s*temperature\b\s*:?\s*(?:minus\s*)?(-?[0-9\.]+)', tok, flags=re.I)
        if m:
            val=str(m.group(1)).replace(" ","")
            if not val.startswith("-"): val="-"+val
            md["air_temp"]=val
        m=re.search(r'\bSky\b\s*:?\s*([A-Za-z]+)', tok, flags=re.I)
        if m: md["sky_cover"]=m.group(1)
        m=re.search(r'\bPrecip\b\s*:?\s*(.+)$', tok, flags=re.I)
        if m: md["precip"]=m.group(1).strip(" ,.;")

        m=re.match(r'^\s*Wind\b\s*:?\s*(.+)$', tok, flags=re.I)
        if m: md["wind"]=m.group(1).strip(" ,.;")

        m=re.search(r'\bTotal\s*HS\b\s*:?\s*([0-9,]+)\s*cm\b', tok, flags=re.I)
        if m: md["total_hs"]=m.group(1).replace(",","")
        m=re.search(r'\bSurface\s*grain\b\s*:?\s*(.+)$', tok, flags=re.I)
        if m: md["surface_grain"]=m.group(1).strip(" ,.;")
        m=re.search(r'\bFoot\s*pen\b\s*:?\s*([0-9,]+)\s*cm\b', tok, flags=re.I)
        if m: md["foot_pen"]=m.group(1).replace(",","")
        m=re.search(r'\bSki\s*pen\b\s*:?\s*([0-9,]+)\s*cm\b', tok, flags=re.I)
        if m: md["ski_pen"]=m.group(1).replace(",","")

    m=re.search(r'\bTotal\s*HS\b\s*:?\s*([0-9,]+)', " ".join(tokens), flags=re.I)
    total_hs=float(m.group(1).replace(",","")) if m else 0.0
    def parse_layer_line(line: str):
        """Accept many guide variations."""
        raw=line.strip()
        if not raw:
            return None

        # Guard: never treat metadata (e.g., "Date:") or other key:value lines as layers.
        # This prevents ISO dates like "2026-01-18" from being mis-parsed as a depth range.
        if ":" in raw:
            return None

        # Optional per-layer comment after a pipe. Example:
        # 64-85 IFrc I crust | deteriorating crust
        # The comment is not included in the grain/hardness parsing.
        comment_txt = None
        if "|" in raw:
            left, right = raw.split("|", 1)
            raw = left.strip()
            comment_txt = right.strip() or None

        raw_dash = raw.replace("–","-").replace("—","-")
        s_norm = norm(raw_dash)

        # Depth range must be at the beginning of the line (layers are formatted as "0-5 ...").
        m=re.search(r'^\s*(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\b', raw_dash, flags=re.I)
        if not m:
            return None
        top=float(m.group(1)); bottom=float(m.group(2))

        is_red=(" red" in s_norm) or ("layer of concern" in s_norm) or ("highlight" in s_norm)

        # crust detection: ANY "crust" triggers crust fill
        is_crust=False; grain=""
        if "crust" in s_norm:
            is_crust=True
            if "sun crust" in s_norm:
                grain="MFcr"
            elif "drizzle crust" in s_norm or "rain crust" in s_norm:
                grain="IFrc"
            else:
                grain="IFrc"
        else:
            for k,v in CRUST_MAP.items():
                if k in s_norm:
                    is_crust=True; grain=v; break
        if not grain:
            # accept direct ICSSG crust tokens even if the word 'crust' is not spoken
            m_icssg = re.search(r'\b(IFrc|MFcr|IFRC|MFCR)\b', raw_dash)
            if m_icssg:
                grain = m_icssg.group(1)
                # normalize casing to match engine conventions
                grain = 'IFrc' if grain.lower()=='ifrc' else 'MFcr'
                is_crust = True

        if not grain:
            for k,v in GRAIN_MAP.items():
                if re.search(rf'\b{re.escape(k)}\b', s_norm):
                    grain=v; break

        
        def _map_grain(graw: str) -> str:
            gnorm = norm(graw)
            # accept direct ICSSG-like tokens
            up = graw.upper()
            if up in ("PP","DF","RG","FC","FCXR","DH","SH","MF","IF","IFRC","MFCR"):
                return up if up not in ("FCXR",) else "FCxr"
            # map via dict
            for k,v in GRAIN_MAP.items():
                if gnorm == k:
                    return v
            return up

        # dual-grain parsing
        grain2=None
        size=None
        size2=None

        # 1) Compact format without sizes: "PP/FC" or "RG/FC"
        mslash = re.search(r'\b(?P<g1>[A-Za-z]{1,8}(?:xr|cr|rc)?)\s*/\s*(?P<g2>[A-Za-z]{1,8}(?:xr|cr|rc)?)\b', raw_dash, flags=re.I)
        if mslash and not is_crust:
            grain = _map_grain(mslash.group('g1').strip())
            grain2 = _map_grain(mslash.group('g2').strip())

        # 1b) Compact dual-size format: "FC/DF 2mm/1mm" or "PP/FC 3cm/5cm"
        mcompact_dual = re.search(
            r'\b(?P<g1>[A-Za-z]{1,8}(?:xr|cr|rc)?)\s*/\s*(?P<g2>[A-Za-z]{1,8}(?:xr|cr|rc)?)\b'
            r'(?:\s+(?:F|4F|1F|P|K|I)\+?(?:-(?:F|4F|1F|P|K|I)\+?)?)?'
            r'\s+(?P<s1>[0-9]+(?:\.[0-9]+)?)\s*(?:mm|cm)\s*/\s*(?P<s2>[0-9]+(?:\.[0-9]+)?)\s*(?:mm|cm)\b',
            raw_dash,
            flags=re.I,
        )
        if mcompact_dual and not is_crust:
            grain = _map_grain(mcompact_dual.group('g1').strip())
            grain2 = _map_grain(mcompact_dual.group('g2').strip())
            size = float(mcompact_dual.group('s1'))
            size2 = float(mcompact_dual.group('s2'))

        # 2) Preferred format with sizes: "G1 1mm / G2 2mm" or "G1 3 cm / G2 5 cm"
        mdual = re.search(
            r'\b(?P<g1>[A-Za-z]{1,8}(?:xr|cr|rc)?)\b\s*(?P<s1>[0-9]+(?:\.[0-9]+)?)\s*(?:mm|cm)\s*[/+]+\s*\b(?P<g2>[A-Za-z]{1,8}(?:xr|cr|rc)?)\b\s*(?P<s2>[0-9]+(?:\.[0-9]+)?)\s*(?:mm|cm)\b',
            raw_dash,
            flags=re.I,
        )
        if mdual and not is_crust:
            g1_raw = mdual.group('g1').strip()
            g2_raw = mdual.group('g2').strip()
            s1 = float(mdual.group('s1'))
            s2 = float(mdual.group('s2'))
            grain = _map_grain(g1_raw)
            grain2 = _map_grain(g2_raw)
            size = s1
            size2 = s2

# size parsing: "5mm", "5 mm", "3 cm"
        msz=re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:mm|cm)\b', raw_dash, flags=re.I)
        if msz and size is None:
            size=float(msz.group(1))
        else:
            msz=re.search(r'\b([0-9]+(?:\.[0-9]+)?)\b\s*(millimeter|millimeters|centimeter|centimeters|centimetre|centimetres)\b', s_norm, flags=re.I)
            if msz and size is None:
                size=float(msz.group(1))

        hardness=parse_layer_hardness(raw_dash)
        return Layer(
            top=top,
            bottom=bottom,
            hardness=hardness,
            grain=grain,
            grain2=grain2,
            size_mm=size,
            size2_mm=size2,
            is_crust=is_crust,
            is_red=is_red,
            comment=comment_txt,
        )

    for line in lines:
        ly = parse_layer_line(line)
        if not ly:
            continue
        layers.append(ly)
        total_hs=max(total_hs, ly.bottom)

    # Layer comments (optional): e.g., "Comment 95 to 217: very long text ..."
    comment_map = {}
    for line in lines:
        mcom = re.search(r'^(comment|comments)\s+(\d+)\s*(?:to|-)\s*(\d+)\s*[:,-]\s*(.+)$', line.strip(), flags=re.I)
        if mcom:
            a=float(mcom.group(2)); b=float(mcom.group(3)); txt=mcom.group(4).strip()
            comment_map[(a,b)] = txt

    # attach comments to exact matching layers
    if comment_map:
        for i,ly in enumerate(layers):
            key=(ly.top, ly.bottom)
            if key in comment_map:
                layers[i].comment = comment_map[key]
    notes_lines: List[str] = []
    for line in lines:
        mnotes = re.search(r'^(extra\s+notes?|general\s+notes?|notes?)\s*:\s*(.+)$', line.strip(), flags=re.I)
        if mnotes:
            txt = mnotes.group(2).strip()
            if txt:
                notes_lines.append(txt)

    notes_txt = " ".join(notes_lines).strip() or None
    temps=parse_temps(text)
    stabs=parse_stability(text)
    return ProfileData(md,total_hs,layers,temps,stabs,notes_txt)

def render_printsafe_pdf(profile:ProfileData, template_svg:str, background_png:str, out_pdf:str):
    # Drawing scale uses dug depth (max layer bottom), not Total HS metadata
    hs_draw_cm = max([ly.bottom for ly in profile.layers], default=profile.total_hs_cm)
    _,_,vb_w,vb_h = svg_viewbox(template_svg)
    bg = ImageReader(background_png)
    _iw, _ih = bg.getSize()
    iw, ih = vb_w, vb_h
    c = canvas.Canvas(out_pdf, pagesize=(iw, ih))
    c.drawImage(background_png, 0, 0, width=iw, height=ih, mask='auto')

    sx = iw / vb_w
    sy = ih / vb_h

    global FONT_ALL
    FONT_ALL = _auto_font_all(template_svg, sx)

    fx1, fy1, fx2, fy2 = detect_profile_frame_svg(template_svg)
    fx1p = fx1*sx
    fx2p = fx2*sx

    # columns offsets
    comments_left = fx1 - 360
    comments_size = fx1 - 190
    size_grain    = fx1 - 110
    grain_depth   = fx1 - 50
    depth_profile = fx1

    x_size_c     = (comments_size + size_grain)/2
    x_grain_c    = (size_grain + grain_depth)/2
    x_depth_c    = (grain_depth + depth_profile)/2
    x_divider = comments_size  # comments|size divider in svg units

    hardness_x, temp_x = extract_tick_positions(template_svg)
    hard_order=["F","4F","1F","P","K","I"]
    hard_ticks=[(h, hardness_x[h]) for h in hard_order if h in hardness_x]
    hard_ticks.sort(key=lambda t:t[1])
    hard_end={}
    for i,(h,x) in enumerate(hard_ticks):
        hard_end[h]=( (x+hard_ticks[i+1][1])/2 if i < len(hard_ticks)-1 else fx2 )


    # Map hardness labels to x positions. Base labels sit on their tick.
    # A trailing "+" means halfway toward the next harder tick.
    hard_index = {h:i for i,h in enumerate(hard_order)}
    def _hard_x(label: str) -> float:
        lab = (label or "").strip()
        if not lab:
            return fx1
        is_plus = lab.endswith("+")
        base = lab[:-1] if is_plus else lab
        base = base.strip()
        if base not in hardness_x:
            return fx1
        x_base = hardness_x[base]
        if not is_plus:
            return x_base
        i = hard_index.get(base)
        if i is None:
            return x_base
        # "+" is halfway to the next harder tick (clamp at the hardest)
        if i >= len(hard_order)-1:
            return x_base
        nxt = hard_order[i+1]
        if nxt not in hardness_x:
            return x_base
        return (x_base + hardness_x[nxt]) / 2.0
    x0 = temp_x.get(0, fx1)
    x22 = temp_x.get(-22, fx2)
    def x_temp(temp_c: float) -> float:
        t=max(-22.0, min(0.0, temp_c))
        return x0 + (t/ -22.0) * (x22 - x0)

    def y_at(depth_cm:float)->float:
        if hs_draw_cm <= 0:
            return fy1*sy
        y_svg = fy1 + (depth_cm / hs_draw_cm) * (fy2 - fy1)
        return y_svg * sy

    def set_fill(hexstr):
        hexstr=hexstr.lstrip("#")
        c.setFillColorRGB(int(hexstr[0:2],16)/255.0,int(hexstr[2:4],16)/255.0,int(hexstr[4:6],16)/255.0)

    def set_stroke(hexstr, w=1.0):
        hexstr=hexstr.lstrip("#")
        c.setStrokeColorRGB(int(hexstr[0:2],16)/255.0,int(hexstr[2:4],16)/255.0,int(hexstr[4:6],16)/255.0)
        c.setLineWidth(w)

    fill_normal="#9E9E9E"
    fill_crust="#4F4F4F"
    fill_red="#F02E2E"

    # Thin layer set (<5 cm) for callouts and bottom-depth suppression
    thin_layers=[ly for ly in profile.layers if (ly.bottom-ly.top) < 5.0]
    suppressed=set(ly.bottom for ly in thin_layers)

    # Fill hardness polygons only
    for ly in profile.layers:
        ytop=y_at(ly.top); ybot=y_at(ly.bottom)
        if ybot-ytop < 1:
            continue
        if "→" in ly.hardness:
            a,b=ly.hardness.split("→",1)
            h_top=a.strip()
            h_bot=b.strip()
        else:
            h_top=ly.hardness.strip()
            h_bot=h_top
        if not h_top:
            continue
        x_top=_hard_x(h_top)
        x_bot=_hard_x(h_bot) if h_bot else x_top
        fill = fill_red if ly.is_red else (fill_crust if ly.is_crust else fill_normal)
        set_fill(fill)
        p=c.beginPath()
        p.moveTo(fx1p, ih - ytop)
        p.lineTo(x_top*sx, ih - ytop)
        p.lineTo(x_bot*sx, ih - ybot)
        p.lineTo(fx1p, ih - ybot)
        p.close()
        # Fill + stroke (enclose each layer block). Stroke matches depth line thickness.
        set_stroke("000000", w=1.0)
        c.drawPath(p, stroke=1, fill=1)

    # Boundary lines across columns + into profile frame (stop at hardness end at that depth)
    set_stroke("000000", w=1.0)
    x_left = comments_left * sx
    depths=set()
    for ly in profile.layers:
        depths.add(ly.top); depths.add(ly.bottom)
    sorted_depths=sorted(depths)

    # Precompute x_end for each layer (top/bottom) in SVG units
    layer_x_ends=[]
    for ly in profile.layers:
        # parse hardness (supports transitions like '1F→P' and '+' midpoints)
        if "→" in ly.hardness:
            a,b = ly.hardness.split("→",1)
            h_top = a.strip()
            h_bot = b.strip()
        else:
            h_top = ly.hardness.strip()
            h_bot = h_top
        if not h_top:
            continue
        x_top = _hard_x(h_top)
        x_bot = _hard_x(h_bot) if h_bot else x_top
        layer_x_ends.append((ly.top, ly.bottom, x_top, x_bot))

    for d in sorted_depths:
        y = y_at(d)
        # Draw depth lines only across the columns up to the profile frame.
        # The profile itself is enclosed by stroked layer polygons, so we avoid double-stroking.
        c.line(x_left, ih - y, fx1p, ih - y)

    # Global font
    c.setFillColorRGB(0,0,0)
    c.setFont("Helvetica", FONT_ALL)

    # Depth labels (no 0; suppress thin-layer bottoms). Baseline sits on line (tiny lift = 1px)
    baseline_lift = 2
    for d in sorted_depths:
        if abs(d-0.0) < 0.001:
            continue
        if d in suppressed:
            continue
        y=y_at(d)
        c.drawCentredString(x_depth_c*sx, ih - (y - baseline_lift), str(int(d) if float(d).is_integer() else d))

    def draw_centered_on_line(txt, x_svg, y_line_px):
        c.drawCentredString(x_svg*sx, ih - (y_line_px - baseline_lift), txt)

    def draw_centered_mid(txt, x_svg, y_mid_px):
        c.drawCentredString(x_svg*sx, ih - y_mid_px, txt)

    def draw_centered_near_bottom(txt, x_svg, y_bottom_px, rise_px=0.0):
        c.drawCentredString(x_svg*sx, ih - ((y_bottom_px - rise_px) - baseline_lift), txt)

    # Callout placer
    # --- Text wrapping / auto-fit -----------------------------------------
    def _wrap_lines(text: str, font_name: str, font_size: int, max_width: float):
        paragraphs = str(text).splitlines() or [""]
        lines = []
        for para in paragraphs:
            words = para.split()
            if not words:
                lines.append("")
                continue
            cur = words[0]
            for w in words[1:]:
                trial = cur + " " + w
                if c.stringWidth(trial, font_name, font_size) <= max_width:
                    cur = trial
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        return lines or [""]

    def _fit_wrapped(text: str, max_width: float, max_height: float, font_name="Helvetica", start_size=FONT_ALL, min_size=10, leading_factor=1.15):
        fs = start_size
        while fs >= min_size:
            leading = fs * leading_factor
            lines = _wrap_lines(text, font_name, fs, max_width)
            if len(lines) * leading <= max_height:
                return fs, lines, leading
            fs -= 1
        fs = min_size
        leading = fs * leading_factor
        lines = _wrap_lines(text, font_name, fs, max_width)
        max_lines = max(1, int(max_height/leading))
        return fs, lines[:max_lines], leading
    # Track callout vertical occupancy in the Comments column.
    # NOTE: We deliberately avoid *all* overlaps, even between an "above" callout from a
    # lower thin-layer and a "below" callout from an upper thin-layer.
    occupied_callouts = []  # list of (y_min, y_max) in px

    # --- Callout "free-space" slots --------------------------------------
    # Treat every drawn horizontal depth/boundary line as a barrier and place
    # callout text inside the vertical gaps between adjacent lines.
    # This prevents callout text from sitting directly on a grid/boundary line.
    _line_pad = 8  # px clearance above/below a horizontal line
    _header_floor = 206.0 * sy  # keep callouts below the column-header band
    _line_ys = sorted({y_at(d) for d in sorted_depths})
    _slots = []  # list of (slot_top, slot_bottom) in px
    if len(_line_ys) >= 2:
        for a, b in zip(_line_ys[:-1], _line_ys[1:]):
            top = a + _line_pad
            bot = b - _line_pad
            if bot > top:
                _slots.append((top, bot))

    def _candidate_slots(min_top: Optional[float]=None, max_bottom: Optional[float]=None):
        out = []
        for st, sb in _slots:
            if min_top is not None and sb < min_top:
                continue
            if max_bottom is not None and st > max_bottom:
                continue
            slot_st = max(st, min_top) if min_top is not None else st
            slot_st = max(slot_st, _header_floor)
            slot_sb = min(sb, max_bottom) if max_bottom is not None else sb
            if slot_sb > slot_st:
                out.append((slot_st, slot_sb))
        return out

    def _pick_slot_top(initial_top: float, block_h: float, min_top: Optional[float]=None, max_bottom: Optional[float]=None):
        """Return a y_start (top of block) that fits inside a free-space slot."""
        if not _slots:
            return initial_top

        def _overlaps(ymin, ymax, ranges):
            for r0, r1 in ranges:
                if not (ymax < r0 or ymin > r1):
                    return True
            return False

        slots = _candidate_slots(min_top=min_top, max_bottom=max_bottom)
        scored = []
        for slot_st, slot_sb in slots:
            usable = (slot_sb - slot_st)
            if usable < block_h:
                continue
            y0 = min(max(initial_top, slot_st), slot_sb - block_h)
            scored.append((abs(y0 - initial_top), slot_st, slot_sb))
        scored.sort(key=lambda t: t[0])

        pad = max(2.0, block_h * 0.05)
        for _, st, sb in scored:
            y0 = min(max(initial_top, st), sb - block_h)
            y0 = max(y0, _header_floor)
            ymin = y0 - pad
            ymax = y0 + block_h + pad
            if not _overlaps(ymin, ymax, occupied_callouts):
                return y0
        if slots:
            slot_st, slot_sb = min(
                slots,
                key=lambda t: abs(min(max(initial_top, t[0]), t[1]) - initial_top)
            )
            return min(max(initial_top, slot_st), max(slot_st, slot_sb - block_h))
        return max(initial_top, _header_floor)

    def _draw_callout_arrowhead(x_tip: float, y_tip: float, size: float = 5.5):
        # Arrowhead points right, toward the layer body.
        c.line(x_tip - size, ih - (y_tip - size * 0.55), x_tip, ih - y_tip)
        c.line(x_tip - size, ih - (y_tip + size * 0.55), x_tip, ih - y_tip)

    def draw_callout(txt, anchor_y_px, side: str, max_height_px: float, y_top_override=None):
        """
        Wrapped callout confined to Comments column width, with overlap avoidance.

        side="below" => text below anchor; leader goes up
        side="above" => text above anchor; leader goes down

        Leader starts at end of LAST line and lands at divider at anchor_y_px.
        """
        x_anchor = x_divider * sx
        x_text = (comments_left * sx) + 6
        max_w = (x_anchor - 6) - x_text

        def overlaps(ymin, ymax, ranges):
            for a, b in ranges:
                if not (ymax < a or ymin > b):
                    return True
            return False

        if side == "below":
            band_min = anchor_y_px
            band_max = anchor_y_px + max_height_px + _line_pad
        else:
            band_min = anchor_y_px - max_height_px - _line_pad
            band_max = anchor_y_px

        candidate_slots = _candidate_slots(min_top=band_min, max_bottom=band_max)
        callout_fs = max(9, FONT_ALL - 3)

        def fit_for_slot(slot_st: float, slot_sb: float):
            usable_h = max(8.0, slot_sb - slot_st)
            fs, lines, leading = _fit_wrapped(
                txt,
                max_w,
                usable_h,
                font_name="Helvetica",
                start_size=callout_fs,
                min_size=6,
                leading_factor=1.0,
            )
            ascent = fs * 0.75
            descent = fs * 0.25
            block_h = ascent + descent if len(lines) <= 1 else ascent + descent + (len(lines) - 1) * leading
            pad = max(2.0, leading * 0.35)
            return fs, lines, leading, ascent, descent, block_h, pad

        def choose_slot(initial_top: float):
            scored = []
            for slot_st, slot_sb in candidate_slots:
                fs, lines, leading, ascent, descent, block_h, pad = fit_for_slot(slot_st, slot_sb)
                if block_h > (slot_sb - slot_st):
                    continue
                y0 = min(max(initial_top, slot_st), slot_sb - block_h)
                ymin = y0 - pad
                ymax = y0 + block_h + pad
                penalty = 0 if not overlaps(ymin, ymax, occupied_callouts) else 1000000
                score = penalty + abs(y0 - initial_top)
                scored.append((score, y0, fs, lines, leading, ascent, block_h, pad))
            if scored:
                scored.sort(key=lambda t: t[0])
                return scored[0]
            return None

        # If caller provides an explicit y_top (stacked placement), skip the local sliding search.
        if y_top_override is not None:
            if isinstance(y_top_override, (tuple, list)) and len(y_top_override) >= 3:
                slot_st = float(y_top_override[0])
                slot_sb = float(y_top_override[1])
                seed_y = float(y_top_override[2])
                fs, lines, leading, ascent, _descent, block_h, pad = fit_for_slot(slot_st, slot_sb)
                y_top = min(max(seed_y, slot_st), max(slot_st, slot_sb - block_h))
                chosen = (0.0, y_top, fs, lines, leading, ascent, block_h, pad)
            else:
                chosen = choose_slot(float(y_top_override))
            if chosen is None:
                chosen = (0.0, max(float(y_top_override), _header_floor), callout_fs, [txt], callout_fs, callout_fs * 0.75, callout_fs, 2.0)
            _, y_top, fs, lines, leading, ascent, block_h, pad = chosen
            ymin = y_top - pad
            ymax = y_top + block_h + pad
            occupied_callouts.append((ymin, ymax))
            y_lines = [y_top + ascent + i * leading for i in range(len(lines))]
            c.setFillColorRGB(0,0,0)
            c.setFont("Helvetica", fs)
            for line, y in zip(lines, y_lines):
                c.drawString(x_text, ih - y, line)
            # Short elbow leader reduces crossovers and keeps the text visually tied
            # to the nearest boundary slot instead of creating long diagonals.
            last = lines[-1]
            tw = c.stringWidth(last, "Helvetica", fs)
            x_start = x_text + tw + 6
            y_lead = y_lines[-1]
            set_stroke("000000", 1.0)
            lane_offset = (len(occupied_callouts) % 4) * 9
            x_elbow = min(x_anchor - 8, x_start + 18 + lane_offset)
            c.line(x_start, ih - y_lead, x_elbow, ih - y_lead)
            c.line(x_elbow, ih - y_lead, x_elbow, ih - anchor_y_px)
            c.line(x_elbow, ih - anchor_y_px, x_anchor, ih - anchor_y_px)
            _draw_callout_arrowhead(x_anchor, anchor_y_px)
            c.setFont("Helvetica", FONT_ALL)
            return (ymin, ymax)

        if side == "below":
            initial_top = anchor_y_px + 4
        else:
            initial_top = anchor_y_px - 10

        chosen = choose_slot(initial_top if side == "below" else initial_top - 20)
        if chosen is None:
            chosen = (0.0, max(initial_top, _header_floor), callout_fs, [txt], callout_fs, callout_fs * 0.75, callout_fs, 2.0)
        _, y_top, fs, lines, leading, ascent, block_h, pad = chosen
        ymin = y_top - pad
        ymax = y_top + block_h + pad
        y_lines = [y_top + ascent + i * leading for i in range(len(lines))]

        # mark occupied
        occupied_callouts.append((ymin, ymax))

        c.setFillColorRGB(0,0,0)
        c.setFont("Helvetica", fs)
        for line, y in zip(lines, y_lines):
            c.drawString(x_text, ih - y, line)

        last = lines[-1]
        tw = c.stringWidth(last, "Helvetica", fs)
        x_start = x_text + tw + 6
        y_lead = y_lines[-1]
        set_stroke("000000", 1.0)
        lane_offset = (len(occupied_callouts) % 4) * 9
        x_elbow = min(x_anchor - 8, x_start + 18 + lane_offset)
        c.line(x_start, ih - y_lead, x_elbow, ih - y_lead)
        c.line(x_elbow, ih - y_lead, x_elbow, ih - anchor_y_px)
        c.line(x_elbow, ih - anchor_y_px, x_anchor, ih - anchor_y_px)
        _draw_callout_arrowhead(x_anchor, anchor_y_px)

        c.setFont("Helvetica", FONT_ALL)
        return (ymin, ymax)

    # helper: find prev/next boundary for available space (in px)
    def neighbor_space(top_cm, bottom_cm):
        y_top=y_at(top_cm); y_bot=y_at(bottom_cm)
        prev=[d for d in sorted_depths if d < top_cm]
        nxt=[d for d in sorted_depths if d > bottom_cm]
        y_prev=y_at(prev[-1]) if prev else y_top-9999
        y_next=y_at(nxt[0]) if nxt else y_bot+9999
        space_above = y_top - y_prev
        space_below = y_next - y_bot
        return space_above, space_below

    # Map stability tests to containing thin layers
    stabs_by_thin = {id(ly): [] for ly in thin_layers}
    for st in profile.stabs:
        for ly in thin_layers:
            if ly.top <= st.depth_cm <= ly.bottom:
                stabs_by_thin[id(ly)].append(st)
                break

    def _paired_label(a: Optional[str], b: Optional[str]) -> Optional[str]:
        if a and b:
            return f"{a}/{b}"
        return a or b

    def _paired_size_label(a: Optional[float], b: Optional[float]) -> Optional[str]:
        if a is not None and b is not None:
            return f"{a:g}/{b:g}"
        if a is not None:
            return f"{a:g}"
        if b is not None:
            return f"{b:g}"
        return None

    pending_layer_comments = []

    def _draw_layer_comment(comment_text: str, y_top: float, y_bot: float):
        x_left_px = (comments_left * sx) + 6
        x_right_px = (x_divider * sx) - 6
        max_w = x_right_px - x_left_px
        max_h = max(10.0, (y_bot - y_top) - 10)
        comment_fs = max(8, FONT_ALL - 5)
        fs, lines, leading = _fit_wrapped(
            comment_text,
            max_w,
            max_h,
            start_size=comment_fs,
            min_size=7,
            leading_factor=1.0,
        )

        ascent = fs * 0.75
        descent = fs * 0.25
        if len(lines) <= 1:
            block_h = ascent + descent
        else:
            block_h = ascent + descent + (len(lines) - 1) * leading
        pad = max(2.0, leading * 0.35)

        def overlaps(ymin, ymax, ranges):
            for a, b in ranges:
                if not (ymax < a or ymin > b):
                    return True
            return False

        layer_h = y_bot - y_top
        y_top_pref = y_top + min(18.0, max(6.0, layer_h * 0.32))
        y_top_min = y_top + 4
        y_top_max = y_bot - 4 - block_h
        intruding_bottoms = [
            occ_b
            for occ_a, occ_b in occupied_callouts
            if occ_b > y_top and occ_a < y_bot and occ_a < (y_top + max(12.0, layer_h * 0.45))
        ]
        if intruding_bottoms:
            y_top_min = max(y_top_min, min(y_top_max, max(intruding_bottoms) + pad + 4.0))
        if y_top_max < y_top_min:
            y_top_use = y_top_min
        else:
            y_top_pref = max(y_top_pref, y_top_min)
            y_top_use = min(max(y_top_pref, y_top_min), y_top_max)

        y_top_use = _pick_slot_top(y_top_use, block_h, min_top=y_top_min, max_bottom=y_bot - 4)
        ymin = y_top_use - pad
        ymax = y_top_use + block_h + pad

        step = leading
        guard = 0
        while overlaps(ymin, ymax, occupied_callouts) and guard < 250:
            cand_dn = min(y_top_max, y_top_use + step)
            cand_up = max(y_top_min, y_top_use - step)
            placed = False
            for cand in (cand_dn, cand_up):
                cand = _pick_slot_top(cand, block_h, min_top=y_top_min, max_bottom=y_bot - 4)
                cmin = cand - pad
                cmax = cand + block_h + pad
                if not overlaps(cmin, cmax, occupied_callouts):
                    y_top_use = cand
                    ymin, ymax = cmin, cmax
                    placed = True
                    break
            if placed:
                break
            y_top_use = _pick_slot_top(cand_dn, block_h, min_top=y_top_min, max_bottom=y_bot - 4)
            ymin = y_top_use - pad
            ymax = y_top_use + block_h + pad
            guard += 1

        occupied_callouts.append((ymin, ymax))
        y_lines = [y_top_use + ascent + i * leading for i in range(len(lines))]
        c.setFillColorRGB(0,0,0)
        c.setFont("Helvetica", fs)
        for line, y in zip(lines, y_lines):
            c.drawString(x_left_px, ih - y, line)
        c.setFont("Helvetica", FONT_ALL)

    # Render grain/size on the same lower boundary baseline used by depth labels.
    for ly in profile.layers:
        thickness = ly.bottom - ly.top
        if thickness < 5.0:
            continue  # handled as callout(s)
        y_top=y_at(ly.top); y_bot=y_at(ly.bottom)
        upper_gap = max(10.0, FONT_ALL * 0.95)
        y_up = max(y_top + 5.0, y_bot - upper_gap)
        if thickness < 10.0 and getattr(ly, "grain2", None):
            grain_label = _paired_label(ly.grain, ly.grain2)
            size_label = _paired_size_label(ly.size_mm, ly.size2_mm)
            narrow_fs = max(9, FONT_ALL - 4) if thickness < 8.0 else FONT_ALL
            c.saveState()
            c.setFont("Helvetica", narrow_fs)
            if grain_label:
                draw_centered_on_line(grain_label, x_grain_c, y_bot)
            if size_label:
                draw_centered_on_line(size_label, x_size_c, y_bot)
            c.restoreState()
        elif abs(thickness-5.0) < 1e-6:  # exactly 5 cm => bottom aligned
            if getattr(ly, "grain2", None):
                draw_centered_on_line(ly.grain2, x_grain_c, y_bot)
                if ly.size2_mm is not None:
                    draw_centered_on_line(f"{ly.size2_mm:g}", x_size_c, y_bot)
                if ly.grain:
                    draw_centered_on_line(ly.grain, x_grain_c, y_up)
                if ly.size_mm is not None:
                    draw_centered_on_line(f"{ly.size_mm:g}", x_size_c, y_up)
            else:
                if ly.grain:
                    draw_centered_on_line(ly.grain, x_grain_c, y_bot)
                if ly.size_mm is not None:
                    draw_centered_on_line(f"{ly.size_mm:g}", x_size_c, y_bot)
        else:
            if getattr(ly, "grain2", None):
                if ly.grain:
                    draw_centered_on_line(ly.grain, x_grain_c, y_up)
                if ly.size_mm is not None:
                    draw_centered_on_line(f"{ly.size_mm:g}", x_size_c, y_up)
                draw_centered_on_line(ly.grain2, x_grain_c, y_bot)
                if ly.size2_mm is not None:
                    draw_centered_on_line(f"{ly.size2_mm:g}", x_size_c, y_bot)
            else:
                if ly.grain:
                    draw_centered_on_line(ly.grain, x_grain_c, y_bot)
                if ly.size_mm is not None:
                    draw_centered_on_line(f"{ly.size_mm:g}", x_size_c, y_bot)

        if getattr(ly, "comment", None):
            pending_layer_comments.append((ly.comment, y_top, y_bot))

    # Thin layers: decide callout placement for layer info + any stability test callout
    thin_callout_requests = []  # (txt, anchor_y_px, side, max_height_px, priority)
    for ly in thin_layers:
        layer_txt_parts=[f"{int(ly.top)}–{int(ly.bottom)} cm"]
        if ly.grain and getattr(ly, "grain2", None):
            dual_grain = f"{ly.grain}/{ly.grain2}"
            if ly.size_mm is not None and ly.size2_mm is not None:
                layer_txt_parts.append(f"{dual_grain} {ly.size_mm:g}mm/{ly.size2_mm:g}mm")
            elif ly.size_mm is not None:
                layer_txt_parts.append(f"{dual_grain} {ly.size_mm:g}mm")
            else:
                layer_txt_parts.append(dual_grain)
        else:
            if ly.grain: layer_txt_parts.append(ly.grain)
            if ly.size_mm is not None: layer_txt_parts.append(f"{ly.size_mm:g} mm")
        if getattr(ly, "comment", None):
            layer_txt = " ".join(layer_txt_parts)
            layer_txt = f"{layer_txt}\n{ly.comment}".strip()
        else:
            layer_txt = " ".join(layer_txt_parts)
        stabs_here = stabs_by_thin.get(id(ly), [])

        # choose which side has more space
        space_above, space_below = neighbor_space(ly.top, ly.bottom)

        # Candidate entries: keep the layer/comment block and any stability-test
        # callouts separate so a short test label can fall into the next clean
        # comment band instead of crowding a longer layer comment.
        candidates=[]
        for st in stabs_here:
            candidates.append(("stab", f"{st.code} @ {int(st.depth_cm)} cm", float(st.depth_cm)))
        candidates.append(("layer", layer_txt, float(ly.bottom)))

        # primary side = larger space
        primary_side = "above" if space_above >= space_below else "below"
        if ly.top <= 0.001:
            primary_side = "below"
        secondary_side = "below" if primary_side=="above" else "above"

        used_primary=False
        for kind, txt, anchor_depth in candidates:
            # Anchor leader target at the CENTER of the thin layer for layer callouts.
            if kind == "layer":
                anchor_y = y_at((ly.top + ly.bottom) / 2.0)
            else:
                anchor_y = y_at(anchor_depth)
            if not used_primary:
                thin_callout_requests.append((txt, anchor_y, primary_side, space_below if primary_side=="below" else space_above, 0 if kind=="stab" else 1))
                used_primary=True
            else:
                thin_callout_requests.append((txt, anchor_y, secondary_side, space_below if secondary_side=="below" else space_above, 0 if kind=="stab" else 1))

    def _find_layer_for_depth(depth_cm: float):
        tol = 1e-6
        upper_boundary = [ly for ly in profile.layers if abs(depth_cm - ly.bottom) <= tol]
        if upper_boundary:
            return min(upper_boundary, key=lambda ly: (ly.bottom - ly.top))
        candidates = [ly for ly in profile.layers if ly.top <= depth_cm <= ly.bottom]
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        return min(candidates, key=lambda ly: (ly.bottom - ly.top))

    def _draw_inline_test_in_layer(txt: str, layer) -> bool:
        if layer is None:
            return False
        if getattr(layer, "comment", None):
            return False
        y_top = y_at(layer.top)
        y_bot = y_at(layer.bottom)
        layer_h = y_bot - y_top
        if layer_h < 18.0:
            return False

        x_left_px = (comments_left * sx) + 6
        max_w = ((x_divider * sx) - 6) - x_left_px
        max_h = max(10.0, layer_h - 8.0)
        test_fs = max(8, FONT_ALL - 5)
        fs, lines, leading = _fit_wrapped(
            txt,
            max_w,
            max_h,
            start_size=test_fs,
            min_size=7,
            leading_factor=1.0,
        )
        if len(lines) > 1:
            return False

        ascent = fs * 0.75
        descent = fs * 0.25
        block_h = ascent + descent
        pad = max(2.0, leading * 0.35)
        if block_h + (pad * 2.0) > layer_h:
            return False

        y_top_pref = (y_bot - 3.0) - block_h
        y_top_min = y_top + 2.0
        y_top_max = y_bot - 2.0 - block_h
        if y_top_max < y_top_min:
            return False

        y_top_use = min(max(y_top_pref, y_top_min), y_top_max)
        ymin = y_top_use - pad
        ymax = y_top_use + block_h + pad

        def overlaps(ymin, ymax, ranges):
            for a, b in ranges:
                if not (ymax < a or ymin > b):
                    return True
            return False

        if overlaps(ymin, ymax, occupied_callouts):
            return False

        occupied_callouts.append((ymin, ymax))
        c.setFillColorRGB(0,0,0)
        c.setFont("Helvetica", fs)
        c.drawString(x_left_px, ih - (y_top_use + ascent), lines[0])
        c.setFont("Helvetica", FONT_ALL)
        return True

    # Render thin-layer callouts by allocating them into real comment bands with
    # remaining room. This is more stable than per-anchor nudging when several
    # thin layers and tests cluster together.
    comment_bands = [
        {"st": st, "sb": sb}
        for st, sb in _slots
        if st >= _header_floor and (sb - st) >= 12.0
    ]

    def _callout_metrics_for_height(txt, usable_h):
        fs0 = max(9, FONT_ALL - 3)
        max_w = ((x_divider * sx) - 6) - ((comments_left * sx) + 6)
        usable_h = max(8.0, usable_h)
        fs, lines, leading = _fit_wrapped(
            txt,
            max_w,
            usable_h,
            font_name="Helvetica",
            start_size=fs0,
            min_size=8,
            leading_factor=1.0,
        )
        ascent = fs * 0.75
        descent = fs * 0.25
        block_h = ascent + descent if len(lines) <= 1 else ascent + descent + (len(lines) - 1) * leading
        return block_h

    def _free_segments_for_band(band):
        st = band["st"]
        sb = band["sb"]
        overlaps_in_band = []
        for a, b in occupied_callouts:
            if b <= st or a >= sb:
                continue
            overlaps_in_band.append((max(st, a), min(sb, b)))
        overlaps_in_band.sort()
        merged = []
        for a, b in overlaps_in_band:
            if not merged or a > merged[-1][1]:
                merged.append([a, b])
            else:
                merged[-1][1] = max(merged[-1][1], b)
        free = []
        cursor = st + 2.0
        for a, b in merged:
            if a - cursor >= 8.0:
                free.append((cursor, a - 2.0))
            cursor = max(cursor, b + 2.0)
        if sb - cursor >= 8.0:
            free.append((cursor, sb - 2.0))
        return free

    def _band_is_clean(band):
        st = band["st"]
        sb = band["sb"]
        for a, b in occupied_callouts:
            if not (b <= st or a >= sb):
                return False
        return True

    def _segment_matches_side(seg_st, seg_sb, anchor_y_px, preferred_side):
        center = (seg_st + seg_sb) / 2.0
        if preferred_side == "above":
            return center <= anchor_y_px + 1.0
        if preferred_side == "below":
            return center >= anchor_y_px - 1.0
        return True

    def _render_thin_callout_group(requests):
        last_assigned_center = None
        for txt, anchor_y_px, preferred_side, _max_height_px, _priority in requests:
            viable = []
            fallback_viable = []
            for band in comment_bands:
                for seg_st, seg_sb in _free_segments_for_band(band):
                    block_h = _callout_metrics_for_height(txt, seg_sb - seg_st)
                    if block_h <= (seg_sb - seg_st):
                        center = (seg_st + seg_sb) / 2.0
                        edge_distance = min(abs(seg_st - anchor_y_px), abs(seg_sb - anchor_y_px))
                        candidate = (abs(center - anchor_y_px), edge_distance, band, seg_st, seg_sb, block_h)
                        fallback_viable.append(candidate)
                        if _segment_matches_side(seg_st, seg_sb, anchor_y_px, preferred_side):
                            viable.append(candidate)
            if not viable:
                viable = fallback_viable
            if viable:
                ordered_viable = sorted(viable, key=lambda t: t[0])
                chosen = None
                if last_assigned_center is not None:
                    for candidate in ordered_viable:
                        center = (candidate[3] + candidate[4]) / 2.0
                        if center >= last_assigned_center - 1.0:
                            chosen = candidate
                            break
                if chosen is None:
                    chosen = ordered_viable[0]
                _, _, band, seg_st, seg_sb, _block_h = chosen
                seed_y = seg_st
                draw_callout(txt, anchor_y_px, "below", seg_sb - seg_st, y_top_override=(seg_st, seg_sb, seed_y))
                last_assigned_center = (seg_st + seg_sb) / 2.0
            else:
                draw_callout(txt, anchor_y_px, "below", max(12.0, _line_pad * 2.0))

    ordered_requests = sorted(thin_callout_requests, key=lambda r: (r[1], r[4]))
    stab_requests = [request for request in ordered_requests if request[4] == 0]
    layer_requests = [request for request in ordered_requests if request[4] != 0]
    _render_thin_callout_group(stab_requests)
    _render_thin_callout_group(layer_requests)


    # Stability tests that are NOT within a thin layer: render as standalone callouts
    if profile.stabs:
        mapped_ids = set()
        for ly in thin_layers:
            for st in stabs_by_thin.get(id(ly), []):
                mapped_ids.add(id(st))
        standalone = [st for st in profile.stabs if id(st) not in mapped_ids]
        standalone.sort(key=lambda st: st.depth_cm)
        last_standalone_center = None
        for st in standalone:
            txt = f"{st.code} @ {int(st.depth_cm)} cm"
            containing_layer = _find_layer_for_depth(st.depth_cm)
            if _draw_inline_test_in_layer(txt, containing_layer):
                continue
            anchor_y = y_at(st.depth_cm)
            viable = []
            for band in comment_bands:
                for seg_st, seg_sb in _free_segments_for_band(band):
                    block_h = _callout_metrics_for_height(txt, seg_sb - seg_st)
                    if block_h <= (seg_sb - seg_st):
                        center = (seg_st + seg_sb) / 2.0
                        edge_distance = min(abs(seg_st - anchor_y), abs(seg_sb - anchor_y))
                        viable.append((abs(center - anchor_y), edge_distance, seg_st, seg_sb))
            if viable:
                ordered_viable = sorted(viable, key=lambda t: t[0])
                chosen = None
                if last_standalone_center is not None:
                    for candidate in ordered_viable:
                        center = (candidate[2] + candidate[3]) / 2.0
                        if center >= last_standalone_center - 1.0:
                            chosen = candidate
                            break
                if chosen is None:
                    chosen = ordered_viable[0]
                _, _, seg_st, seg_sb = chosen
                draw_callout(txt, anchor_y, "below", seg_sb - seg_st, y_top_override=(seg_st, seg_sb, seg_st))
                last_standalone_center = (seg_st + seg_sb) / 2.0
            else:
                draw_callout(txt, anchor_y, "below", max(12.0, _line_pad * 2.0))

    for comment_text, y_top, y_bot in pending_layer_comments:
        _draw_layer_comment(comment_text, y_top, y_bot)

# Temperature curve + dots
    if profile.temps:
        temp_dot_x_offset_svg = 5.4
        pts=[]
        for depth,temp in profile.temps:
            xpx = (x_temp(temp) + temp_dot_x_offset_svg) * sx
            ypx = y_at(depth)
            pts.append((xpx, ih - ypx))
        pts.sort(key=lambda p:p[1])
        set_stroke("D00000", w=2.8)
        for i in range(len(pts)-1):
            c.line(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1])
        set_fill("D00000")
        for x,y in pts:
            c.circle(x, y, 4.5, stroke=0, fill=1)

    # Anchored metadata (same font size as everything else)
    c.setFillColorRGB(0,0,0)
    anchors=parse_anchors(template_svg)
    ids={
        "date":"anchor_meta_date_center","time":"anchor_meta_time_center","observer":"anchor_meta_observer_center","org":"anchor_meta_org_center","run_name":"anchor_meta_run_name_center",
        "elevation":"anchor_meta_elevation_center","aspect":"anchor_meta_aspect_center","slope_angle":"anchor_meta_slope_angle_center","lat_long":"anchor_meta_lat_long_center",
        "air_temp":"anchor_meta_air_temp_center","sky_cover":"anchor_meta_sky_cover_center","precip":"anchor_meta_precip_center",
        "wind":"anchor_meta_wind_center","total_hs":"anchor_meta_total_hs_center","surface_grain":"anchor_meta_surface_grain_center",
        "foot_pen":"anchor_meta_foot_pen_center","ski_pen":"anchor_meta_ski_pen_center",
    }
    voff=3
    for k,aid in ids.items():
        if k in profile.metadata and aid in anchors:
            ax, ay = anchors[aid]
            txt = str(profile.metadata[k])
            if k == "slope_angle":
                txt = txt.strip()
                if txt and not re.search(r'deg(?:rees?)?$', txt, flags=re.I):
                    txt = f"{txt}deg"
            elif k in ("total_hs", "foot_pen", "ski_pen"):
                txt = txt.strip()
                if txt and not re.search(r'cm$', txt, flags=re.I):
                    txt = f"{txt} cm"
            if k == "lat_long":
                txt = txt.replace(",", " ").strip()
                txt = re.sub(r'deg', '', txt, flags=re.I)
                txt = re.sub(r'\s+', ' ', txt).strip()

            # Fit Lat/Long into its line by shrinking font ONLY for this field (everything else stays FONT_ALL)
            if k == "lat_long":
                # Auto-fit Lat/Long into its underline by shrinking font ONLY for this field.
                # Keep it isolated to avoid font changes bleeding into other metadata.
                # Underline in SVG: <path d="m 301.17097,968.33231 h 94.66667">
                underline_len = 94.66667  # SVG units
                pad = 4.0  # SVG units padding on both sides to avoid icon/neighbor fields
                maxw = max(10.0, (underline_len - 2*pad) * sx)  # in PDF units

                def _fit_font_size(text_, font_, start_fs, min_fs=6.0, step=0.5):
                    fs = float(start_fs)
                    for _ in range(300):
                        if c.stringWidth(text_, font_, fs) <= maxw or fs <= min_fs:
                            return max(fs, min_fs)
                        fs -= step
                    return max(min_fs, fs)

                c.saveState()
                fs = _fit_font_size(txt, "Helvetica", FONT_ALL + 3, min_fs=8.0, step=0.5)
                c.setFont("Helvetica", fs)
                c.drawCentredString(ax*sx, ih - ((ay-voff)*sy), txt)
                c.restoreState()
            elif k == "run_name":
                c.setFont("Helvetica-Bold", FONT_ALL + 4)
                # Position is controlled by the template anchor. Do not apply
                # any hard-coded vertical offsets here.
                c.drawCentredString(ax*sx, ih - ((ay-voff)*sy), txt)
                c.setFont("Helvetica", FONT_ALL)
            else:
                c.setFont("Helvetica", max(9, FONT_ALL - 4))
                c.drawCentredString(ax*sx, ih - ((ay-voff)*sy), txt)
                c.setFont("Helvetica", FONT_ALL)

    # General notes band in the Nivium footer.
    # Use the template anchor so notes follow the editable notes box in the SVG.
    if getattr(profile, "notes", None):
        notes_anchor = anchors.get("anchor_notes_text_start", (95.0, 781.0))
        notes_x1, notes_y1 = notes_anchor
        notes_x2 = 720.0
        notes_y2 = notes_y1 + (17.03 * 2.0)
        max_w = max(20.0, (notes_x2 - notes_x1) * sx)
        max_h = max(10.0, (notes_y2 - notes_y1) * sy)
        fs, lines, _ = _fit_wrapped(
            profile.notes,
            max_width=max_w,
            max_height=max_h,
            font_name="Helvetica",
            start_size=max(12, FONT_ALL - 4),
            min_size=9,
            leading_factor=1.0,
        )
        leading = 17.03 * sy
        c.saveState()
        c.setFillColorRGB(31/255.0, 61/255.0, 91/255.0)
        c.setFont("Helvetica", fs)
        x_left = notes_x1 * sx
        y_top = ih - (notes_y1 * sy)
        for i, line in enumerate(lines):
            c.drawString(x_left, y_top - (i * leading), line)
        c.restoreState()

    c.showPage(); c.save()

def main():
    import argparse
    here = os.path.dirname(os.path.abspath(__file__))
    default_template = os.path.join(here, "Nivium_Profile_Template.svg")
    ap=argparse.ArgumentParser()
    ap.add_argument("--template", default=default_template)
    ap.add_argument("--background", required=True)
    ap.add_argument("--dictation", required=True)
    ap.add_argument("--out", required=True)
    args=ap.parse_args()

    text=open(args.dictation,"r",encoding="utf-8").read()
    profile=parse_dictation(text)
    if not profile.layers or profile.total_hs_cm<=0:
        raise SystemExit("No layers parsed from dictation.")
    render_printsafe_pdf(profile, args.template, args.background, args.out)
    print("Wrote", args.out)

if __name__=="__main__":
    main()
