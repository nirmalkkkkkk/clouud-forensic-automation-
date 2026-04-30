"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Core Forensic Engine (upgraded)

=============================================================
"""
import os
import logging
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import (CASE_ID, INVESTIGATOR, SYSTEM_NAME, BREACH_DATE,
                    LOG_PATH, REPORT_CSV, REPORT_XLSX, REPORT_PDF,
                    SKIP_EXTENSIONS, SKIP_FOLDERS)
from modules.scanner   import scan_directory
from modules.metadata  import extract_metadata
from modules.hasher    import generate_both_hashes
from modules.reporter  import write_csv_report, write_xlsx_report, write_pdf_report
from modules.risk_engine  import compute_risk_score, compute_status
from modules.classifier   import classify_file

# ─── Logging setup ───────────────────────────────────────── #
os.makedirs("logs", exist_ok=True)
logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)


# ─── Process a single file ───────────────────────────────── #
def _process_file(file_path: str, progress_cb=None) -> dict | None:
    """Extract metadata + hashes + risk for one file. Returns dict or None."""
    try:
        metadata = extract_metadata(file_path)

        # Hashes
        hashes = generate_both_hashes(file_path)
        metadata["SHA256 Hash"] = hashes["SHA256 Hash"]
        metadata["MD5 Hash"]    = hashes["MD5 Hash"]

        # Risk scoring
        risk_score, risk_level = compute_risk_score(metadata)
        metadata["Risk Score"]  = risk_score
        metadata["Risk Level"]  = risk_level
        metadata["Status"]      = compute_status(metadata)

        # Healthcare category
        metadata["Category"] = classify_file(file_path, metadata["File Type"])

        # Case documentation
        metadata["Case ID"]               = CASE_ID
        metadata["Investigator"]          = INVESTIGATOR
        metadata["System Name"]           = SYSTEM_NAME
        metadata["Evidence Collected On"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Serialise datetime objects
        for key in ("Created Time", "Modified Time", "Accessed Time"):
            if isinstance(metadata[key], datetime):
                metadata[key] = metadata[key].strftime("%Y-%m-%d %H:%M:%S")

        logging.info(f"[OK] Scanned: {file_path} | Risk: {risk_level} ({risk_score})")
        return metadata

    except Exception as e:
        logging.error(f"[ERROR] {file_path}: {e}")
        return None


# ─── Main scan entry point ───────────────────────────────── #
def run_forensic_scan(directory_path: str, web_mode: bool = False,
                      progress_cb=None) -> dict:
    """
    Perform a full forensic scan of directory_path.

    Args:
        directory_path: Absolute or relative path to scan.
        web_mode:       If True, return structured dict instead of printing.
        progress_cb:    Optional callable(current, total, msg) for real-time updates.

    Returns:
        dict with keys: success, total_files, critical_risk, high_risk,
        medium_risk, low_risk, anomalies, duration, evidence (list of dicts)
    """
    start = time.time()

    if not os.path.exists(directory_path):
        logging.error("Invalid directory: %s", directory_path)
        return {"success": False, "error": f"Directory not found: {directory_path}"}

    logging.info("=== Investigation Started === Case: %s | Dir: %s", CASE_ID, directory_path)

    if progress_cb:
        progress_cb(0, 1, "Scanning directory structure...")

    file_list = scan_directory(directory_path)

    if not file_list:
        logging.warning("No files found in: %s", directory_path)
        return {"success": False, "error": "No files found in directory."}

    total = len(file_list)
    logging.info("Files discovered: %d", total)

    if progress_cb:
        progress_cb(0, total, f"Discovered {total} files. Extracting metadata...")

    evidence_collection = []

    # ── Parallel processing ───────────────────────────────── #
    with ThreadPoolExecutor(max_workers=min(8, os.cpu_count() or 4)) as ex:
        futures = {ex.submit(_process_file, fp): fp for fp in file_list}
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            result = future.result()
            if result:
                evidence_collection.append(result)
            if progress_cb:
                pct = int(done_count * 100 / total)
                progress_cb(done_count, total,
                            f"Processing file {done_count}/{total} [{pct}%]")

    if not evidence_collection:
        return {"success": False, "error": "No evidence could be collected."}

    # ── Write reports ─────────────────────────────────────── #
    if progress_cb:
        progress_cb(total, total, "Generating reports...")

    write_csv_report(REPORT_CSV, evidence_collection)
    write_xlsx_report(REPORT_XLSX, evidence_collection)
    write_pdf_report(REPORT_PDF, evidence_collection,
                     CASE_ID, INVESTIGATOR, directory_path)

    duration = round(time.time() - start, 2)

    # ── Counters ─────────────────────────────────────────── #
    def _cnt(lvl): return sum(1 for f in evidence_collection if f.get("Risk Level") == lvl)

    high     = _cnt("High")
    low      = _cnt("Low")
    anomalies = sum(1 for f in evidence_collection if f.get("Anomaly Flag", "None") != "None")

    logging.info("=== Scan Complete === Files: %d | High: %d | Duration: %.2fs",
                 len(evidence_collection), high, duration)

    if not web_mode:
        print(f"\n{'='*60}")
        print("   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION")
        print(f"{'='*60}")
        print(f"Case ID: {CASE_ID}")
        print(f"Total Files: {len(evidence_collection)}")
        print(f"High: {high}  Low: {low}")
        print(f"Duration: {duration}s")
        print(f"Reports: {REPORT_CSV}, {REPORT_XLSX}, {REPORT_PDF}")
        print(f"{'='*60}\n")

    return {
        "success"      : True,
        "case_id"      : CASE_ID,
        "investigator" : INVESTIGATOR,
        "total_files"  : len(evidence_collection),
        "high_risk"    : high,
        "low_risk"     : low,
        "anomalies"    : anomalies,
        "duration"     : duration,
        "evidence"     : evidence_collection,
    }


# ─── CLI entry point ─────────────────────────────────────── #
if __name__ == "__main__":
    print("\n" + "="*60)
    print("      CLOUD FORENSICS AUTOMATION SYSTEM")
    print("="*60)
    directory_input = input("Enter directory path to scan: ").strip()
    run_forensic_scan(directory_input)