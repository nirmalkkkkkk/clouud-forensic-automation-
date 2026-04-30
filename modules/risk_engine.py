"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Advanced Risk Scoring Engine

=============================================================
"""
from datetime import datetime

# ─── Sensitive file type weights ─────────────────────────── #
SENSITIVE_TYPES = {
    # Databases & structured data — highest risk
    ".db": 30, ".sqlite": 30, ".sqlite3": 30, ".mdb": 30,
    ".csv": 28, ".xlsx": 28, ".xls": 26,
    # Documents with PHI potential
    ".pdf": 22, ".docx": 20, ".doc": 20,
    # XML / JSON health data
    ".xml": 18, ".json": 18, ".hl7": 30, ".dicom": 30, ".dcm": 30,
    # Text / config
    ".txt": 10, ".cfg": 12, ".ini": 12, ".env": 25,
    # Executables — suspicious in health data
    ".exe": 25, ".bat": 25, ".sh": 22, ".ps1": 22,
    # Images — could be radiology
    ".png": 8, ".jpg": 8, ".jpeg": 8, ".tiff": 12,
}

BREACH_DATE = datetime(2026, 4, 9)


def compute_risk_score(metadata: dict) -> tuple[int, str]:
    """
    Compute a weighted risk score (0-100) and return (score, level).

    Scoring breakdown:
      • Modified after breach date  : up to 40 pts
      • File type sensitivity        : up to 30 pts
      • File size anomaly            : up to 20 pts
      • Shannon entropy anomaly      : up to 10 pts
    """
    score = 0

    # ── 1. Breach timeline (40 pts) ──────────────────────── #
    modified_str = metadata.get("Modified Time", "")
    try:
        if isinstance(modified_str, datetime):
            mod_dt = modified_str
        else:
            mod_dt = datetime.strptime(str(modified_str), "%Y-%m-%d %H:%M:%S")
        if mod_dt > BREACH_DATE:
            score += 40
    except (ValueError, TypeError):
        pass

    # ── 2. File type sensitivity (30 pts) ────────────────── #
    file_type = metadata.get("File Type", "").lower()
    score += SENSITIVE_TYPES.get(file_type, 5)

    # ── 3. File size anomaly (20 pts) ────────────────────── #
    size_kb = float(metadata.get("File Size (KB)", 0) or 0)
    if size_kb == 0:
        score += 20          # zero-byte — possible wipe
    elif size_kb > 102400:   # >100 MB
        score += 15
    elif size_kb > 10240:    # >10 MB
        score += 10
    elif size_kb > 1024:     # >1 MB
        score += 5

    # ── 4. Shannon entropy anomaly (10 pts) ──────────────── #
    entropy = float(metadata.get("Entropy", 0) or 0)
    if entropy > 7.5:
        score += 10          # strongly encrypted / compressed
    elif entropy > 6.5:
        score += 5

    # ── Cap & categorise ─────────────────────────────────── #
    score = min(score, 100)

    if score >= 40:
        level = "High"
    else:
        level = "Low"

    return score, level


def compute_status(metadata: dict) -> str:
    """Return a human-readable status string based on modification time."""
    modified_str = metadata.get("Modified Time", "")
    try:
        if isinstance(modified_str, datetime):
            mod_dt = modified_str
        else:
            mod_dt = datetime.strptime(str(modified_str), "%Y-%m-%d %H:%M:%S")
        if mod_dt > BREACH_DATE:
            return "Modified After Breach"
    except (ValueError, TypeError):
        pass
    return "Normal"
