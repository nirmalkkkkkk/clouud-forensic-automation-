"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Flask Web Application Backend
   Case Reference: PRJN26-148
   Investigator: Nirmal
=============================================================
"""
from flask import Flask, render_template, request, jsonify, send_file, abort
import os, json, logging
from datetime import datetime
from main import run_forensic_scan, CASE_ID, INVESTIGATOR, SYSTEM_NAME

app = Flask(__name__)

LOG_PATH      = "logs/forensic_activity.log"
REPORT_PATH   = "reports/evidence_report.xlsx"
ACTIVITY_LOG  = "logs/web_activity.json"

os.makedirs("logs",    exist_ok=True)
os.makedirs("reports", exist_ok=True)

def _append_activity(entry: dict):
    """Append a JSON entry to the web activity log."""
    records = []
    if os.path.exists(ACTIVITY_LOG):
        try:
            with open(ACTIVITY_LOG, "r") as f:
                records = json.load(f)
        except Exception:
            records = []
    records.append(entry)
    with open(ACTIVITY_LOG, "w") as f:
        json.dump(records, f, indent=2)

# ─────────────────────────────────────────────────────────── #
#  MAIN DASHBOARD
# ─────────────────────────────────────────────────────────── #
@app.route("/")
def index():
    return render_template("index.html")

# ─────────────────────────────────────────────────────────── #
#  API: RUN FORENSIC SCAN
# ─────────────────────────────────────────────────────────── #
@app.route("/api/scan", methods=["POST"])
def api_scan():
    try:
        data           = request.get_json(force=True)
        directory_path = (data.get("directory_path") or "").strip()

        if not directory_path:
            return jsonify({"success": False, "error": "No directory path provided."}), 400

        if not os.path.isdir(directory_path):
            return jsonify({"success": False, "error": f"Directory not found: {directory_path}"}), 400

        results = run_forensic_scan(directory_path, web_mode=True)

        if results and results.get("success"):
            _append_activity({
                "type"     : "scan",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "directory": directory_path,
                "files"    : results.get("total_files", 0),
                "high_risk": results.get("high_risk", 0),
            })

        return jsonify(results)

    except Exception as e:
        logging.exception("Scan API error")
        return jsonify({"success": False, "error": str(e)}), 500

# ─────────────────────────────────────────────────────────── #
#  API: DASHBOARD STATS (case info, quick metrics)
# ─────────────────────────────────────────────────────────── #
@app.route("/api/stats", methods=["GET"])
def api_stats():
    activity = []
    if os.path.exists(ACTIVITY_LOG):
        try:
            with open(ACTIVITY_LOG) as f:
                activity = json.load(f)
        except Exception:
            activity = []

    scan_entries = [a for a in activity if a.get("type") == "scan"]
    total_scans  = len(scan_entries)
    total_files  = sum(a.get("files", 0)     for a in scan_entries)
    total_risks  = sum(a.get("high_risk", 0) for a in scan_entries)

    return jsonify({
        "case_id"       : CASE_ID,
        "investigator"  : INVESTIGATOR,
        "system_name"   : SYSTEM_NAME,
        "total_scans"   : total_scans,
        "total_files"   : total_files,
        "total_high_risk": total_risks,
        "report_exists" : os.path.exists(REPORT_PATH),
        "recent_scans"  : scan_entries[-5:][::-1],   # last 5, newest first
    })

# ─────────────────────────────────────────────────────────── #
#  API: FETCH FORENSIC LOG FILE CONTENT
# ─────────────────────────────────────────────────────────── #
@app.route("/api/logs", methods=["GET"])
def api_logs():
    if not os.path.exists(LOG_PATH):
        return jsonify({"lines": []})
    with open(LOG_PATH, "r", errors="replace") as f:
        lines = f.readlines()
    return jsonify({"lines": [l.rstrip() for l in lines[-200:]]})  # last 200 lines

# ─────────────────────────────────────────────────────────── #
#  API: DOWNLOAD XLSX REPORT
# ─────────────────────────────────────────────────────────── #
@app.route("/api/download-report", methods=["GET"])
def api_download_report():
    if not os.path.exists(REPORT_PATH):
        abort(404, description="Report not yet generated. Run a scan first.")
    return send_file(
        os.path.abspath(REPORT_PATH),
        as_attachment=True,
        download_name=f"forensic_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    )

# ─────────────────────────────────────────────────────────── #
#  API: CLEAR ACTIVITY LOG
# ─────────────────────────────────────────────────────────── #
@app.route("/api/clear-activity", methods=["POST"])
def api_clear_activity():
    if os.path.exists(ACTIVITY_LOG):
        os.remove(ACTIVITY_LOG)
    return jsonify({"success": True})


if __name__ == "__main__":
    print("\n" + "="*60)
    print("   CLOUD FORENSICS AUTOMATION  |  Healthcare Edition")
    print("   Case: PRJN26-148  |  Investigator: Nirmal")
    print("="*60)
    print("   Web UI ->  http://127.0.0.1:5000")
    print("="*60 + "\n")
    app.run(debug=True, port=5000)
