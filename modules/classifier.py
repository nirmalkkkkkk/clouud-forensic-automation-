"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Healthcare File Classifier

=============================================================
"""
import os

# Keyword maps: (path_keywords, filename_keywords) -> category
CATEGORY_RULES = [
    (["ehr", "electronic", "health_record"],  ["ehr", "electronic"],           "Electronic Health Record"),
    (["billing", "finance", "payment"],        ["invoice", "payment", "bill"],  "Billing & Financial"),
    (["lab", "laboratory", "pathology"],       ["test", "result", "lab", "pathology"], "Laboratory Report"),
    (["radiology", "imaging", "dicom"],        ["xray", "scan", "mri", "ct", "dicom"], "Radiology & Imaging"),
    (["pharmacy", "prescription", "drug"],     ["prescription", "pharmacy", "drug", "medication"], "Pharmacy & Prescription"),
    (["patient"],                              ["patient"],                     "Patient Record"),
    (["report", "summary"],                    ["report", "summary", "diagnostic"], "Medical Report"),
    (["insurance"],                            ["insurance", "claim"],          "Insurance & Claims"),
    (["staff", "hr", "employee"],              ["staff", "employee", "hr"],     "Staff / HR Records"),
]

STRUCTURED_EXTENSIONS = {".xlsx", ".csv", ".xls", ".db", ".sqlite", ".sqlite3"}


def classify_file(file_path: str, file_type: str) -> str:
    """
    Classify a healthcare file into a category based on path/name keywords
    and file extension.  Returns a category string.
    """
    lower_path = file_path.lower()
    lower_name = os.path.basename(file_path).lower()

    for path_kws, name_kws, category in CATEGORY_RULES:
        if any(kw in lower_path for kw in path_kws):
            return category
        if any(kw in lower_name for kw in name_kws):
            return category

    if file_type.lower() in STRUCTURED_EXTENSIONS:
        return "Structured Healthcare Dataset"

    return "General / Unclassified"
