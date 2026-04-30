"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Directory Scanner (upgraded)

=============================================================
"""
import os
from config import SKIP_EXTENSIONS, SKIP_FOLDERS


def scan_directory(directory_path: str) -> list[str]:
    """
    Recursively scan a directory and return valid healthcare file paths.
    Skips system files, compiled artifacts, and irrelevant folders.
    """
    file_paths = []

    for root, dirs, files in os.walk(directory_path):
        # Prune unwanted sub-directories in-place
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS and not d.startswith(".")]

        for fname in files:
            if fname.startswith("."):
                continue
            ext = os.path.splitext(fname)[1].lower()
            if ext in SKIP_EXTENSIONS:
                continue
            file_paths.append(os.path.join(root, fname))

    return file_paths