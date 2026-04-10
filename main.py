import os
import logging
from datetime import datetime
import time

from modules.scanner import scan_directory
from modules.metadata import extract_metadata
from modules.hasher import generate_sha256, generate_both_hashes
from modules.reporter import write_csv_report

# ================= CONFIGURATION ================= #
CASE_ID = "HC-2026-001"
INVESTIGATOR = "Nirmal"
SYSTEM_NAME = "Healthcare Cloud Storage System"

BREACH_DATE = datetime(2026, 4, 9)
REPORT_PATH = "reports/evidence_report.csv"
LOG_PATH = "logs/forensic_activity.log"
# ================= LOGGING SETUP ================= #
os.makedirs("logs", exist_ok=True)

logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
# ================= MAIN FUNCTION ================= #
def run_forensic_scan(directory_path, web_mode=False):

    start_time = time.time()

    if not os.path.exists(directory_path):
        print("❌ Directory does not exist.")
        logging.error("Invalid directory path provided.")
        if web_mode:
            return {"success": False, "error": "Invalid directory path provided."}
        return

    logging.info("=== Investigation Started ===")
    logging.info(f"Case ID: {CASE_ID}")
    logging.info(f"Scanning Directory: {directory_path}")

    file_list = scan_directory(directory_path)

    if not file_list:
        print("No files found in directory.")
        logging.warning("No files found during scan.")
        if web_mode:
            return {"success": False, "error": "No files found in directory."}
        return

    evidence_collection = []

    for file_path in file_list:
        try:
            metadata = extract_metadata(file_path)

            # ===== Add SHA256 and MD5 Hash =====
            hashes = generate_both_hashes(file_path)
            metadata["SHA256 Hash"] = hashes["SHA256 Hash"]
            metadata["MD5 Hash"]    = hashes["MD5 Hash"]

            # ===== Breach Timeline Analysis =====
            if metadata["Modified Time"] > BREACH_DATE:
                metadata["Status"] = "Modified After Breach"
                metadata["Risk Level"] = "High"
            else:
                metadata["Status"] = "Normal"
                metadata["Risk Level"] = "Low"

            # ===== Healthcare Category Detection =====
            lower_path = file_path.lower()
            lower_name = metadata["File Name"].lower()

            if "ehr" in lower_path or "electronic" in lower_path:
                metadata["Category"] = "Electronic Health Record"
            elif "billing" in lower_path or "invoice" in lower_name or "payment" in lower_name:
                metadata["Category"] = "Billing & Financial"
            elif "lab" in lower_path or "test" in lower_name or "result" in lower_name:
                metadata["Category"] = "Laboratory Report"
            elif "radiology" in lower_path or "xray" in lower_name or "scan" in lower_name:
                metadata["Category"] = "Radiology & Imaging"
            elif "prescription" in lower_path or "pharmacy" in lower_name or "drug" in lower_name:
                metadata["Category"] = "Pharmacy & Prescription"
            elif "patient" in lower_path or "patient" in lower_name:
                metadata["Category"] = "Patient Record"
            elif "report" in lower_name or "summary" in lower_name:
                metadata["Category"] = "Medical Report"
            elif metadata["File Type"] in [".xlsx", ".csv"]:
                metadata["Category"] = "Structured Healthcare Dataset"
            else:
                metadata["Category"] = "General / Unclassified"

            # ===== Case Documentation Info =====
            metadata["Case ID"] = CASE_ID
            metadata["Investigator"] = INVESTIGATOR
            metadata["System Name"] = SYSTEM_NAME
            metadata["Evidence Collected On"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # ===== Convert Timestamps for Report =====
            metadata["Created Time"] = metadata["Created Time"].strftime("%Y-%m-%d %H:%M:%S")
            metadata["Modified Time"] = metadata["Modified Time"].strftime("%Y-%m-%d %H:%M:%S")
            metadata["Accessed Time"] = metadata["Accessed Time"].strftime("%Y-%m-%d %H:%M:%S")

            evidence_collection.append(metadata)

            logging.info(f"Scanned Successfully: {file_path}")

        except Exception as e:
            logging.error(f"Error scanning file {file_path}: {str(e)}")

    if evidence_collection:
        write_csv_report(REPORT_PATH, evidence_collection)

        end_time = time.time()
        duration = round(end_time - start_time, 2)

        total_files = len(evidence_collection)
        high_risk = sum(1 for file in evidence_collection if file["Risk Level"] == "High")

        print("\n" + "=" * 60)
        print("   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION")
        print("=" * 60)
        print(f"Case ID: {CASE_ID}")
        print(f"Investigator: {INVESTIGATOR}")
        print(f"Total Files Scanned: {total_files}")
        print(f"High Risk Files: {high_risk}")
        print(f"Scan Duration: {duration} seconds")
        print(f"Report Saved At: {REPORT_PATH.replace('.csv', '.xlsx')}")
        print("=" * 60)

        logging.info("Evidence report generated successfully.")
        logging.info("=== Investigation Completed Successfully ===")

        if web_mode:
            return {
                "success": True,
                "case_id": CASE_ID,
                "investigator": INVESTIGATOR,
                "total_files": total_files,
                "high_risk": high_risk,
                "duration": duration,
                "report_path": REPORT_PATH.replace('.csv', '.xlsx'),
                "evidence": evidence_collection
            }

    else:
        print("No evidence collected.")
        if web_mode:
            return {"success": False, "error": "No evidence collected."}
# ================= PROGRAM ENTRY ================= #
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("      CLOUD FORENSICS AUTOMATION SYSTEM")
    print("=" * 60)

    directory_input = input("Enter directory path to scan: ").strip()
    run_forensic_scan(directory_input)