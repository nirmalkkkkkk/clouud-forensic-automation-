"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Metadata Extractor (Upgraded: Entropy + Timestomping)

=============================================================
"""
import os
import stat
import math
from datetime import datetime


def _shannon_entropy(file_path: str) -> float:
    """
    Compute Shannon entropy of a file (0.0 – 8.0).
    High entropy (>7.5) suggests encryption or compression.
    Reads only the first 64 KB for performance.
    """
    try:
        with open(file_path, "rb") as f:
            data = f.read(65536)   # 64 KB sample
        if not data:
            return 0.0
        freq = [0] * 256
        for byte in data:
            freq[byte] += 1
        total = len(data)
        entropy = 0.0
        for count in freq:
            if count:
                p = count / total
                entropy -= p * math.log2(p)
        return round(entropy, 4)
    except Exception:
        return 0.0


def extract_metadata(file_path: str) -> dict:
    """
    Extracts comprehensive forensic metadata from a file.

    Returns a dictionary with:
      - Basic file attributes
      - Permission string
      - Anomaly flag
      - Shannon entropy score
      - Timestomping flag (created_time > modified_time)
    """
    stats = os.stat(file_path)

    # ── Permissions ──────────────────────────────────────── #
    mode = stats.st_mode
    permissions = []
    if mode & stat.S_IRUSR: permissions.append("Owner-Read")
    if mode & stat.S_IWUSR: permissions.append("Owner-Write")
    if mode & stat.S_IXUSR: permissions.append("Owner-Execute")
    permissions_str = ", ".join(permissions) if permissions else "No Permissions Detected"

    # ── Size & Anomaly ───────────────────────────────────── #
    file_size_kb = round(stats.st_size / 1024, 2)
    if stats.st_size == 0:
        anomaly = "Zero-Byte File (Possible Wipe)"
    elif file_size_kb > 102400:
        anomaly = "Extremely Large File (>100 MB)"
    elif file_size_kb > 10240:
        anomaly = "Unusually Large File (>10 MB)"
    else:
        anomaly = "None"

    # ── Timestamps ───────────────────────────────────────── #
    created_dt  = datetime.fromtimestamp(stats.st_ctime)
    modified_dt = datetime.fromtimestamp(stats.st_mtime)
    accessed_dt = datetime.fromtimestamp(stats.st_atime)

    # ── Timestomping Detection ───────────────────────────── #
    # Created time later than modified time → suspicious
    timestomping = created_dt > modified_dt

    # ── Shannon Entropy ──────────────────────────────────── #
    entropy = _shannon_entropy(file_path)

    return {
        "File Name"       : os.path.basename(file_path),
        "File Path"       : file_path,
        "File Type"       : os.path.splitext(file_path)[1].lower(),
        "File Size (KB)"  : file_size_kb,
        "Created Time"    : created_dt,
        "Modified Time"   : modified_dt,
        "Accessed Time"   : accessed_dt,
        "Permissions"     : permissions_str,
        "Anomaly Flag"    : anomaly,
        "Entropy"         : entropy,
        "Timestomping"    : timestomping,
    }