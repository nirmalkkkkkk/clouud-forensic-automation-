"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Central Configuration

=============================================================
"""
import os
from datetime import datetime

# ─── Case / Investigation Details ────────────────────────── #
CASE_ID        = "HC-2026-001"
INVESTIGATOR   = "Nirmal"
SYSTEM_NAME    = "Healthcare Cloud Storage System"
BREACH_DATE    = datetime(2026, 4, 9)

# ─── Paths ───────────────────────────────────────────────── #
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
LOG_PATH       = os.path.join(BASE_DIR, "logs", "forensic_activity.log")
REPORT_CSV     = os.path.join(BASE_DIR, "reports", "evidence_report.csv")
REPORT_XLSX    = os.path.join(BASE_DIR, "reports", "evidence_report.xlsx")
REPORT_PDF     = os.path.join(BASE_DIR, "reports", "evidence_report.pdf")
DB_PATH        = os.path.join(BASE_DIR, "forensics.db")
UPLOAD_FOLDER  = os.path.join(BASE_DIR, "uploads")

# ─── Flask ───────────────────────────────────────────────── #
SECRET_KEY     = "forensics-prjn26-148-secret-key-2026"
DATABASE_URI   = f"sqlite:///{DB_PATH}"

# ─── Default Credentials ─────────────────────────────────── #
DEFAULT_USER   = "nirmal"
DEFAULT_PASS   = "admin"

# ─── Scanner ─────────────────────────────────────────────── #
SKIP_EXTENSIONS = {'.pyc', '.log', '.tmp', '.bak', '.swp', '.DS_Store'}
SKIP_FOLDERS    = {'__pycache__', '.git', 'logs', 'reports', 'modules',
                   'static', 'templates', 'uploads', '.gemini'}
