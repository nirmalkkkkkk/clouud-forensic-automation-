"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Flask Application  |  SSE + Auth + DB + API

=============================================================
"""
import os, json, queue, threading, time, logging
from datetime import datetime
from functools import wraps

from flask import (Flask, render_template, request, jsonify,
                   send_file, abort, redirect, url_for,
                   session as flask_session, Response, stream_with_context) # type: ignore
from flask_login import (LoginManager, login_user, logout_user,
                         login_required, current_user) # type: ignore
from werkzeug.utils import secure_filename

import config
from database import db, User, ScanSession, EvidenceRecord
from main import run_forensic_scan

# ─────────────────────────────────────────────────────────── #
#  APP FACTORY
# ─────────────────────────────────────────────────────────── #
from flask import Request

class CustomRequest(Request):
    max_form_parts = 100000  # Allow up to 100,000 files in a single folder upload
    max_form_memory_size = 2 * 1024 * 1024 * 1024 # 2 GB

app = Flask(__name__)
app.request_class = CustomRequest
app.secret_key = config.SECRET_KEY
app.config["SQLALCHEMY_DATABASE_URI"]        = config.DATABASE_URI
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["UPLOAD_FOLDER"]                  = config.UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"]             = 2 * 1024 * 1024 * 1024   # 2 GB

db.init_app(app)

login_manager = LoginManager(app)
login_manager.login_view = "login"

os.makedirs("logs",            exist_ok=True)
os.makedirs("reports",         exist_ok=True)
os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "txt","csv","xlsx","xls","pdf","docx","doc",
    "json","xml","db","sqlite","sqlite3","log",
    "png","jpg","jpeg","tiff","dcm","hl7",
}

# ── SSE scan-event queues keyed by session_id ────────────── #
_sse_queues: dict[str, queue.Queue] = {}

# ─────────────────────────────────────────────────────────── #
#  DB INIT + DEFAULT USER
# ─────────────────────────────────────────────────────────── #
with app.app_context():
    db.create_all()
    if not User.query.filter_by(username=config.DEFAULT_USER).first():
        admin = User(username=config.DEFAULT_USER, role="admin")
        admin.set_password(config.DEFAULT_PASS)
        db.session.add(admin)
        db.session.commit()
        logging.info("Default admin user created: %s", config.DEFAULT_USER)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


# ─────────────────────────────────────────────────────────── #
#  HELPERS
# ─────────────────────────────────────────────────────────── #
def _safe_path(raw: str) -> str | None:
    """Validate and sanitise a directory path. Returns None if unsafe."""
    if not raw:
        return None
    # Resolve to absolute path to prevent traversal
    abs_path = os.path.realpath(os.path.abspath(raw))
    # Allow any real directory (no strict allow-list for flexibility)
    if os.path.isdir(abs_path):
        return abs_path
    return None


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _send_sse(q: queue.Queue, event: str, data: dict):
    q.put(f"event: {event}\ndata: {json.dumps(data)}\n\n")


# ─────────────────────────────────────────────────────────── #
#  AUTH ROUTES
# ─────────────────────────────────────────────────────────── #
@app.route("/login", methods=["GET","POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    error = None
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""

        if not username or not password:
            error = "Username and password are required."
        else:
            user = User.query.filter_by(username=username).first()
            if user and user.check_password(password):
                login_user(user, remember=True)
                logging.info("Login: %s (%s)", username, request.remote_addr)
                return redirect(url_for("index"))
            error = "Invalid credentials. Please try again."
            logging.warning("Failed login attempt: %s", username)

    return render_template("login.html", error=error)


@app.route("/logout")
@login_required
def logout():
    logging.info("Logout: %s", current_user.username)
    logout_user()
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    error = None
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        confirm_password = request.form.get("confirm_password") or ""

        if not username or not password or not confirm_password:
            error = "All fields are required."
        elif password != confirm_password:
            error = "Passwords do not match."
        else:
            existing_user = User.query.filter_by(username=username).first()
            if existing_user:
                error = "Username already exists. Please choose another one."
            else:
                new_user = User(username=username, role="analyst")
                new_user.set_password(password)
                db.session.add(new_user)
                db.session.commit()
                logging.info("New user registered: %s (%s)", username, request.remote_addr)
                return redirect(url_for("login"))

    return render_template("register.html", error=error)


# ─────────────────────────────────────────────────────────── #
#  MAIN DASHBOARD
# ─────────────────────────────────────────────────────────── #
@app.route("/")
@login_required
def index():
    return render_template("index.html",
                           user=current_user.to_dict(),
                           case_id=config.CASE_ID,
                           investigator=config.INVESTIGATOR)


# ─────────────────────────────────────────────────────────── #
#  API: STATS
# ─────────────────────────────────────────────────────────── #
@app.route("/api/stats")
@login_required
def api_stats():
    sessions = ScanSession.query.order_by(ScanSession.scanned_at.desc()).all()
    total_sessions = len(sessions)
    total_files    = sum(s.total_files   for s in sessions)
    total_high     = sum(s.high_risk     for s in sessions)
    recent         = [s.to_dict() for s in sessions[:5]]

    return jsonify({
        "case_id"       : config.CASE_ID,
        "investigator"  : config.INVESTIGATOR,
        "system_name"   : config.SYSTEM_NAME,
        "total_scans"   : total_sessions,
        "total_files"   : total_files,
        "total_high"    : total_high,
        "report_exists" : os.path.exists(config.REPORT_CSV),
        "recent_scans"  : recent,
    })


# ─────────────────────────────────────────────────────────── #
#  API: SCAN (SSE-streamed progress)
# ─────────────────────────────────────────────────────────── #
@app.route("/api/scan/stream")
@login_required
def api_scan_stream():
    """SSE endpoint — streams real-time scan progress."""
    raw_path = request.args.get("path", "").strip()

    # Input validation
    if not raw_path:
        return jsonify({"error": "No path provided"}), 400
    safe_path = _safe_path(raw_path)
    if not safe_path:
        # Try relative path from project root
        candidate = os.path.realpath(os.path.join(
            os.path.dirname(__file__), raw_path))
        if os.path.isdir(candidate):
            safe_path = candidate
        else:
            return jsonify({"error": f"Directory not found: {raw_path}"}), 400

    scan_queue: queue.Queue = queue.Queue()
    scan_id = str(int(time.time()))
    _sse_queues[scan_id] = scan_queue

    # ── Progress callback ─────────────────────────────────── #
    def progress_cb(done, total, msg):
        pct = int(done * 100 / max(total, 1))
        _send_sse(scan_queue, "progress", {
            "done": done, "total": total, "pct": pct, "msg": msg
        })

    # ── Run scan in background thread ─────────────────────── #
    def _run():
        try:
            results = run_forensic_scan(safe_path, web_mode=True, progress_cb=progress_cb)

            if results.get("success"):
                evidence = results.pop("evidence", [])

                # Save to database
                sess = ScanSession(
                    case_id       = results["case_id"],
                    investigator  = results["investigator"],
                    directory     = safe_path,
                    total_files   = results["total_files"],
                    high_risk     = results["high_risk"],
                    low_risk      = results["low_risk"],
                    anomalies     = results.get("anomalies", 0),
                    duration      = results["duration"],
                )
                with app.app_context():
                    db.session.add(sess)
                    db.session.flush()

                    for rec in evidence:
                        er = EvidenceRecord(
                            session_id    = sess.id,
                            file_name     = rec.get("File Name",""),
                            file_path     = rec.get("File Path",""),
                            file_type     = rec.get("File Type",""),
                            file_size_kb  = rec.get("File Size (KB)",0),
                            created_time  = rec.get("Created Time",""),
                            modified_time = rec.get("Modified Time",""),
                            accessed_time = rec.get("Accessed Time",""),
                            permissions   = rec.get("Permissions",""),
                            anomaly_flag  = rec.get("Anomaly Flag","None"),
                            sha256_hash   = rec.get("SHA256 Hash",""),
                            md5_hash      = rec.get("MD5 Hash",""),
                            status        = rec.get("Status",""),
                            risk_level    = rec.get("Risk Level",""),
                            risk_score    = rec.get("Risk Score",0),
                            category      = rec.get("Category",""),
                            entropy       = rec.get("Entropy",0.0),
                            timestomping  = bool(rec.get("Timestomping",False)),
                            collected_at  = rec.get("Evidence Collected On",""),
                        )
                        db.session.add(er)

                    db.session.commit()
                    results["session_id"] = sess.id
                    results["evidence"]   = [r.to_dict() for r in sess.evidence]

                _send_sse(scan_queue, "complete", results)
            else:
                _send_sse(scan_queue, "error", {"message": results.get("error","Unknown error")})

        except Exception as ex:
            logging.exception("SSE scan error")
            _send_sse(scan_queue, "error", {"message": str(ex)})
        finally:
            scan_queue.put(None)   # sentinel

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    # ── SSE generator ─────────────────────────────────────── #
    def event_stream():
        while True:
            item = scan_queue.get()
            if item is None:
                break
            yield item
        _sse_queues.pop(scan_id, None)

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


# ─────────────────────────────────────────────────────────── #
#  API: PAST SCANS LIST
# ─────────────────────────────────────────────────────────── #
@app.route("/api/scans")
@login_required
def api_scans():
    sessions = ScanSession.query.order_by(ScanSession.scanned_at.desc()).all()
    return jsonify({"scans": [s.to_dict() for s in sessions]})


# ─────────────────────────────────────────────────────────── #
#  API: EVIDENCE FOR A SPECIFIC SCAN SESSION
# ─────────────────────────────────────────────────────────── #
@app.route("/api/scans/<int:scan_id>/evidence")
@login_required
def api_scan_evidence(scan_id):
    sess = db.session.get(ScanSession, scan_id)
    if not sess:
        return jsonify({"error": "Scan session not found"}), 404
    return jsonify({
        "session": sess.to_dict(),
        "evidence": [r.to_dict() for r in sess.evidence],
    })


# ─────────────────────────────────────────────────────────── #
#  API: TIMELINE DATA (file modifications over time)
# ─────────────────────────────────────────────────────────── #
@app.route("/api/timeline")
@login_required
def api_timeline():
    """Return modification timestamps bucketed by date for Chart.js."""
    scan_id = request.args.get("session_id", type=int)
    query   = EvidenceRecord.query
    if scan_id:
        query = query.filter_by(session_id=scan_id)

    records  = query.all()
    buckets  = {}
    for r in records:
        try:
            date = r.modified_time[:10]   # "YYYY-MM-DD"
            if date not in buckets:
                buckets[date] = {"date": date, "total": 0, "high": 0, "low": 0}

            buckets[date]["total"] += 1
            risk = (r.risk_level or "low").capitalize()
            if risk == "High":
                buckets[date]["high"] += 1
            elif risk == "Low":
                buckets[date]["low"] += 1
        except Exception:
            pass

    sorted_buckets = sorted(buckets.values(), key=lambda x: x["date"])
    return jsonify({"timeline": sorted_buckets})


# ─────────────────────────────────────────────────────────── #
#  API: SYSTEM LOGS
# ─────────────────────────────────────────────────────────── #
@app.route("/api/logs")
@login_required
def api_logs():
    if not os.path.exists(config.LOG_PATH):
        return jsonify({"lines": []})
    with open(config.LOG_PATH, "r", errors="replace") as f:
        lines = f.readlines()
    return jsonify({"lines": [l.rstrip() for l in lines[-200:]]})


# ─────────────────────────────────────────────────────────── #
#  API: FILE UPLOAD
# ─────────────────────────────────────────────────────────── #
@app.route("/api/upload", methods=["POST"])
@login_required
def api_upload():
    if "files" not in request.files:
        return jsonify({"success": False, "error": "No files provided"}), 400
    files   = request.files.getlist("files")
    saved   = []
    errors  = []

    upload_dir = os.path.join(config.UPLOAD_FOLDER,
                              datetime.now().strftime("%Y%m%d_%H%M%S"))
    os.makedirs(upload_dir, exist_ok=True)

    for f in files:
        if f and _allowed_file(f.filename):
            parts = f.filename.replace('\\', '/').split('/')
            safe_parts = [secure_filename(p) for p in parts if p]
            
            if not safe_parts:
                errors.append(f.filename)
                continue
                
            fname = safe_parts[-1]
            if not fname:
                errors.append(f.filename)
                continue
                
            rel_dir = os.path.join(*safe_parts[:-1]) if len(safe_parts) > 1 else ""
            full_dir = os.path.join(upload_dir, rel_dir)
            os.makedirs(full_dir, exist_ok=True)
            
            dest = os.path.join(full_dir, fname)
            f.save(dest)
            saved.append(f.filename)
        else:
            errors.append(f.filename)

    return jsonify({
        "success"     : bool(saved),
        "saved_files" : saved,
        "errors"      : errors,
        "upload_dir"  : upload_dir,
        "message"     : f"Saved {len(saved)} files. Use '{upload_dir}' as scan path.",
    })


# ─────────────────────────────────────────────────────────── #
#  API: DOWNLOADS
# ─────────────────────────────────────────────────────────── #
@app.route("/api/download-csv")
@login_required
def api_download_csv():
    if not os.path.exists(config.REPORT_CSV):
        abort(404, description="No CSV report found. Run a scan first.")
    return send_file(os.path.abspath(config.REPORT_CSV), as_attachment=True,
                     download_name=f"forensic_{datetime.now():%Y%m%d_%H%M%S}.csv")


@app.route("/api/download-xlsx")
@login_required
def api_download_xlsx():
    if not os.path.exists(config.REPORT_XLSX):
        abort(404, description="No XLSX report found. Run a scan first.")
    return send_file(os.path.abspath(config.REPORT_XLSX), as_attachment=True,
                     download_name=f"forensic_{datetime.now():%Y%m%d_%H%M%S}.xlsx")


@app.route("/api/download-pdf")
@login_required
def api_download_pdf():
    if not os.path.exists(config.REPORT_PDF):
        abort(404, description="No PDF report found. Run a scan first.")
    return send_file(os.path.abspath(config.REPORT_PDF), as_attachment=True,
                     download_name=f"forensic_{datetime.now():%Y%m%d_%H%M%S}.pdf")


# ─────────────────────────────────────────────────────────── #
#  API: CLEAR SCAN HISTORY
# ─────────────────────────────────────────────────────────── #
@app.route("/api/clear-history", methods=["POST"])
@login_required
def api_clear_history():
    if current_user.role != "admin":
        return jsonify({"success": False, "error": "Admin only"}), 403
    EvidenceRecord.query.delete()
    ScanSession.query.delete()
    db.session.commit()
    logging.warning("Scan history cleared by: %s", current_user.username)
    return jsonify({"success": True})


# ─────────────────────────────────────────────────────────── #
#  RUN
# ─────────────────────────────────────────────────────────── #
if __name__ == "__main__":
    print("\n" + "="*60)
    print("   CLOUD FORENSICS AUTOMATION  |  Healthcare Edition")
    print(f"   Case: {config.CASE_ID}  |  Investigator: {config.INVESTIGATOR}")
    print("="*60)
    print("   Web UI  ->  http://127.0.0.1:5000")
    print(f"   Login   ->  {config.DEFAULT_USER} / {config.DEFAULT_PASS}")
    print("="*60 + "\n")
    app.run(debug=True, port=5000, threaded=True)
