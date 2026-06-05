"""Faithful Python port of the Code.gs reference logic (Console.html backend).

Ported routines:
  - DESIGNATION_MAP / level_for       (job title -> designation level/colour/order)
  - compute_experience                (DOJ + prior exp -> SL exp / overall exp)
  - grade_pc                          (CPU/GPU/RAM -> composite score + tier)
  - short_name_for                    (raw tool name -> normalised short name)
  - ORG_PRINCIPALS                    (the 4 fixed principals + brand colours)

Where the SL_PEOPLE_PLAN.md tier table and Code.gs disagree, Code.gs is treated
as authoritative because the plan instructs porting Code.gs verbatim. The one
divergence is the Standard/Basic thresholds: Code.gs uses >=45 / >=30, the plan
prose says >=44 / >=28. We keep Code.gs (>=45 / >=30).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

# ── ORG_CONFIG.principals ─────────────────────────────────────────────────────
ORG_PRINCIPALS: list[dict] = [
    {"name": "Harsh Vardhan", "color": "#244C66"},
    {"name": "Ambrish Arora", "color": "#B75C35"},
    {"name": "Ankur Choksi", "color": "#3F7D62"},
    {"name": "Asha Sairam", "color": "#6B5598"},
]


# ── Designation level mapping ─────────────────────────────────────────────────
@dataclass(frozen=True)
class DesignationLevel:
    order: int
    label: str
    color: str


DESIGNATION_MAP: dict[str, DesignationLevel] = {
    "Principal": DesignationLevel(1, "Principal", "#1A2332"),
    "Associate Principal": DesignationLevel(2, "Associate Principal", "#2E4057"),
    "Senior Associate": DesignationLevel(3, "Senior Associate", "#3F5260"),
    "Sr. Associate": DesignationLevel(3, "Senior Associate", "#3F5260"),
    "Group Leader": DesignationLevel(4, "Group Leader", "#475E4A"),
    "Project Lead": DesignationLevel(4, "Group Leader", "#475E4A"),
    "Associate": DesignationLevel(5, "Associate", "#5D7A52"),
    "Project Architect": DesignationLevel(6, "Project Architect/Designer", "#8A4A35"),
    "Project Designer": DesignationLevel(6, "Project Architect/Designer", "#8A4A35"),
    "Senior Architect": DesignationLevel(7, "Senior Architect/Designer", "#A4853D"),
    "Sr. Architect": DesignationLevel(7, "Senior Architect/Designer", "#A4853D"),
    "Senior Designer": DesignationLevel(7, "Senior Architect/Designer", "#A4853D"),
    "Sr. Designer": DesignationLevel(7, "Senior Architect/Designer", "#A4853D"),
    "Architect": DesignationLevel(8, "Architect/Designer", "#5D4156"),
    "Designer": DesignationLevel(8, "Architect/Designer", "#5D4156"),
    "Intern": DesignationLevel(9, "Intern", "#97A0AB"),
}

_SUPPORT = DesignationLevel(99, "Support", "#707A87")


def level_for(title: Optional[str]) -> DesignationLevel:
    """Port of Code.gs levelFor_ — derive designation level from job title."""
    if not title:
        return _SUPPORT
    t = str(title).strip()
    if t in DESIGNATION_MAP:
        return DESIGNATION_MAP[t]
    tl = t.lower()
    if "principal" in tl and "associate" in tl:
        return DESIGNATION_MAP["Associate Principal"]
    if "principal" in tl:
        return DESIGNATION_MAP["Principal"]
    if ("sr." in tl or "senior" in tl) and ("architect" in tl or "designer" in tl):
        return DESIGNATION_MAP["Senior Architect"]
    if "project" in tl and ("architect" in tl or "designer" in tl):
        return DESIGNATION_MAP["Project Architect"]
    if "architect" in tl or "designer" in tl:
        return DESIGNATION_MAP["Architect"]
    if "intern" in tl:
        return DESIGNATION_MAP["Intern"]
    if "lead" in tl:
        return DESIGNATION_MAP["Project Lead"]
    return _SUPPORT


# ── Experience computation ────────────────────────────────────────────────────
@dataclass(frozen=True)
class Experience:
    sl_exp_years: Optional[float]
    o_exp_years: Optional[float]
    sl_exp_display: str
    o_exp_display: str


def _coerce_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:  # ISO with time component
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def compute_experience(doj, prior_exp_years, today: Optional[date] = None) -> Experience:
    """Port of Code.gs computeExperience_. SL exp = years since DOJ; overall = SL + prior."""
    today = today or date.today()
    sl_years: Optional[float] = None
    doj_date = _coerce_date(doj)
    if doj_date:
        yrs = (today - doj_date).days / 365.25
        if yrs >= 0:
            sl_years = yrs

    prior: Optional[float] = None
    if prior_exp_years not in (None, ""):
        try:
            prior = float(prior_exp_years)
        except (TypeError, ValueError):
            prior = None

    o_years: Optional[float] = None
    if sl_years is not None and prior is not None:
        o_years = sl_years + prior
    elif sl_years is not None:
        o_years = sl_years
    elif prior is not None:
        o_years = prior

    return Experience(
        sl_exp_years=sl_years,
        o_exp_years=o_years,
        sl_exp_display=(f"{sl_years:.1f} yrs" if sl_years is not None else "—"),
        o_exp_display=(f"{o_years:.1f} yrs" if o_years is not None else "—"),
    )


# ── PC grading ────────────────────────────────────────────────────────────────
def score_cpu(proc: Optional[str]) -> int:
    if not proc:
        return 30
    p = re.sub(r"\s+", " ", str(proc).upper().replace("®", "").replace("™", " ")).strip()

    ultra = re.search(r"(?:CORE\s*)?ULTRA\s*([579])\s*(\d{3})?", p)
    if ultra:
        tier = int(ultra.group(1))
        model = int(ultra.group(2) or 100)
        score = 86 + (tier - 5) * 4
        if model >= 200:
            score += 5
        return max(0, min(100, score))

    m = re.search(r"(?:CORE\s*)?I([3579])[\s-]*(\d{3,5})", p)
    if m:
        tier = int(m.group(1))
        model = m.group(2)
        gen = 0
        if len(model) == 5:
            gen = int(model[:2])
        elif len(model) == 4:
            gen = int(model[:1])
        if gen >= 14:
            score = 92
        elif gen >= 13:
            score = 88
        elif gen >= 12:
            score = 82
        elif gen >= 11:
            score = 74
        elif gen >= 10:
            score = 68
        elif gen >= 9:
            score = 58
        elif gen >= 8:
            score = 52
        elif gen >= 6:
            score = 40
        elif gen >= 4:
            score = 28
        else:
            score = 22
        if tier == 3:
            score -= 16
        elif tier == 5:
            score -= 8
        elif tier == 9:
            score += 5
        return max(0, min(100, score))

    ryzen = re.search(r"RYZEN\s*(?:THREADRIPPER\s*)?([3579])\s*(\d{3,5})?", p)
    if ryzen:
        tier = int(ryzen.group(1))
        model = ryzen.group(2) or ""
        gen = int(model[:1]) if model else 4
        if gen >= 9:
            score = 92
        elif gen >= 7:
            score = 86
        elif gen >= 5:
            score = 74
        elif gen >= 3:
            score = 58
        else:
            score = 40
        if tier == 3:
            score -= 12
        elif tier == 7:
            score += 4
        elif tier == 9:
            score += 8
        if "THREADRIPPER" in p:
            score = max(score, 92)
        return max(0, min(100, score))

    if "M4" in p:
        return 92 if "MAX" in p or "PRO" in p else 84
    if "M3" in p:
        return 88 if "MAX" in p or "PRO" in p else 78
    if "M2" in p:
        return 80 if "MAX" in p or "PRO" in p else 70
    if "M1" in p:
        return 72 if "MAX" in p or "PRO" in p else 62

    if "XEON" in p:
        if re.search(r"\b(W-[23]\d{3}|SILVER|GOLD|PLATINUM)\b", p):
            return 58
        return 35
    return 30


def score_gpu(gpu: Optional[str]) -> int:
    if not gpu:
        return 10
    g = re.sub(r"\s+", " ", str(gpu).upper().replace(" ", " ").replace("®", "").replace("™", " ")).strip()
    if "NO GRAPHIC" in g or g == "" or "NO GPU" in g or "INTEGRATED" in g or "UHD" in g:
        return 5
    table = [
        ("RTX 5090", 100), ("RTX 5080", 97), ("RTX 5070", 90), ("RTX 5060", 82),
        ("RTX 4090", 98), ("RTX 4080", 93), ("RTX 4070", 87), ("RTX 4060", 76),
    ]
    for token, value in table:
        if token in g:
            if "TI" in g or "SUPER" in g:
                return min(100, value + 4)
            return value
    quadro_table = [
        ("RTX A6000", 95), ("RTX A5000", 88), ("RTX A4500", 84), ("RTX A4000", 78),
        ("RTX A3000", 68), ("RTX A2000", 58), ("QUADRO RTX 6000", 88),
        ("QUADRO RTX 5000", 80), ("QUADRO RTX 4000", 70), ("T1000", 38), ("T600", 28),
    ]
    for token, value in quadro_table:
        if token in g:
            return value
    if "RTX 3090" in g or "RTX 3080" in g:
        return 88
    if "RTX 3070" in g:
        return 80
    if "RTX 3060" in g:
        return 70
    if "RTX 2080" in g:
        return 68
    if "RTX 2070" in g:
        return 62
    if "RTX 2060" in g:
        return 55
    for token, value in [
        ("1660", 48), ("1650", 40), ("1080", 50), ("1070", 45),
        ("1060", 38), ("1050", 28),
    ]:
        if token in g:
            return value
    if "GTX 980" in g:
        return 32
    if "GTX 970" in g:
        return 28
    if "GTX 750" in g:
        return 18
    if "QUADRO K" in g or "QUARDO K" in g:
        return 20
    if "QUADRO" in g:
        return 45
    radeon = re.search(r"(?:RX|RADEON)\s*(\d{4})", g)
    if radeon:
        model = int(radeon.group(1))
        if model >= 7900:
            return 90
        if model >= 7800:
            return 82
        if model >= 7700:
            return 74
        if model >= 6800:
            return 78
        if model >= 6700:
            return 68
        if model >= 6600:
            return 58
        if model >= 580:
            return 34
    if "IRIS XE" in g:
        return 18
    if "VEGA" in g:
        return 16
    return 25


def parse_ram_gb(ram_str: Optional[str]) -> int:
    if not ram_str:
        return 0
    m = re.search(r"(\d+)", str(ram_str))
    return int(m.group(1)) if m else 0


def score_ram(gb: int) -> int:
    if gb >= 64:
        return 100
    if gb >= 48:
        return 90
    if gb >= 32:
        return 80
    if gb >= 24:
        return 62
    if gb >= 16:
        return 50
    if gb >= 8:
        return 28
    return 12


@dataclass(frozen=True)
class PcGrade:
    cpu_score: int
    gpu_score: int
    ram_score: int
    ram_gb: int
    score: int
    tier: str
    capability: str
    suggestion: str


def grade_pc(proc: Optional[str], gpu: Optional[str], ram_str: Optional[str]) -> PcGrade:
    """Port of Code.gs gradePc_. composite = CPU*0.32 + GPU*0.40 + RAM*0.28."""
    cpu_s = score_cpu(proc)
    gpu_s = score_gpu(gpu)
    ram_gb = parse_ram_gb(ram_str)
    ram_s = score_ram(ram_gb)
    composite = round(cpu_s * 0.32 + gpu_s * 0.40 + ram_s * 0.28)

    if composite >= 80:
        tier = "Workstation"
        capability = "Heavy rendering & viz (V-Ray, Enscape, Corona, Lumion, 3ds Max)"
    elif composite >= 62:
        tier = "Performance"
        capability = "3D modelling + light rendering (Revit, Rhino, SketchUp, real-time viz)"
    elif composite >= 45:
        tier = "Standard"
        capability = "2D CAD + 3D modelling (AutoCAD, SketchUp; not for heavy rendering)"
    elif composite >= 30:
        tier = "Basic"
        capability = "2D drafting & docs (AutoCAD LT, Office). Struggles with 3D."
    else:
        tier = "Entry"
        capability = "Docs & admin only (Office, email, PDF). Not for design work."

    suggestions: list[str] = []
    if ram_gb and ram_gb < 16:
        suggestions.append(f"Upgrade RAM to at least 16GB (currently {ram_gb}GB)")
    elif ram_gb and ram_gb < 32 and gpu_s >= 70:
        suggestions.append(
            f"GPU is capable but RAM ({ram_gb}GB) bottlenecks rendering — add to 32GB"
        )
    if gpu_s < 30 and cpu_s >= 60:
        suggestions.append("Strong CPU paired with weak GPU — add an RTX 4060+ for viz")
    if gpu_s < 20:
        suggestions.append("GPU cannot drive modern 3D — replace with RTX 4060 or better")
    if cpu_s < 40 and gpu_s >= 60:
        suggestions.append("Modern GPU bottlenecked by old CPU — plan full refresh")

    final = suggestions
    if cpu_s < 30 and gpu_s < 30 and ram_s < 30:
        final = ["Fully obsolete for design — retire or reassign to docs-only role"]

    if not final:
        if composite >= 80:
            suggestion = "No upgrade needed — top tier"
        elif composite >= 62:
            suggestion = "Solid — no upgrade needed for current workload"
        else:
            suggestion = "Adequate for its tier — monitor"
    else:
        suggestion = " · ".join(final)

    return PcGrade(cpu_s, gpu_s, ram_s, ram_gb, composite, tier, capability, suggestion)


# ── License short-name normalisation ──────────────────────────────────────────
def short_name_for(raw: Optional[str]) -> str:
    """Port of Code.gs shortNameFor_."""
    n = str(raw or "").upper()
    if "AUTOCAD" in n:
        return "AutoCAD LT"
    if "3DS MAX" in n or "3DSMAX" in n:
        return "3ds Max"
    if "SKETCHUP" in n:
        return "SketchUp Pro"
    if "ENSCAPE" in n:
        return "Enscape"
    if "CORONA" in n:
        return "Corona Renderer"
    if "LUMION" in n:
        return "Lumion Pro"
    if "PHOTOSHOP" in n:
        return "Adobe Photoshop"
    if "ILLUSTRATOR" in n:
        return "Adobe Illustrator"
    if "INDESIGN" in n:
        return "Adobe InDesign"
    if "ACROBAT" in n:
        return "Adobe Acrobat"
    if "OFFICE 365" in n and "STANDARD" in n:
        return "MS Office 365 Standard"
    if "OFFICE 365" in n or "365APP" in n:
        return "MS Office 365 Apps"
    return str(raw or "").strip()
