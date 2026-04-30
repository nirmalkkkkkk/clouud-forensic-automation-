"""
=============================================================
   CLOUD FORENSICS AUTOMATION - HEALTHCARE EDITION
   Database Models (SQLAlchemy + SQLite)

=============================================================
"""
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# ─── User Model ──────────────────────────────────────────── #
class User(UserMixin, db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role          = db.Column(db.String(20), default="analyst")   # admin | analyst
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {"id": self.id, "username": self.username, "role": self.role}


# ─── Scan Session Model ───────────────────────────────────── #
class ScanSession(db.Model):
    __tablename__ = "scan_sessions"

    id            = db.Column(db.Integer, primary_key=True)
    case_id       = db.Column(db.String(50))
    investigator  = db.Column(db.String(80))
    directory     = db.Column(db.String(500))
    total_files   = db.Column(db.Integer, default=0)
    critical_risk = db.Column(db.Integer, default=0)
    high_risk     = db.Column(db.Integer, default=0)
    medium_risk   = db.Column(db.Integer, default=0)
    low_risk      = db.Column(db.Integer, default=0)
    anomalies     = db.Column(db.Integer, default=0)
    duration      = db.Column(db.Float, default=0.0)
    scanned_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # relationship
    evidence = db.relationship("EvidenceRecord", backref="session",
                               lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id"           : self.id,
            "case_id"      : self.case_id,
            "investigator" : self.investigator,
            "directory"    : self.directory,
            "total_files"  : self.total_files,
            "critical_risk": self.critical_risk,
            "high_risk"    : self.high_risk,
            "medium_risk"  : self.medium_risk,
            "low_risk"     : self.low_risk,
            "anomalies"    : self.anomalies,
            "duration"     : self.duration,
            "scanned_at"   : self.scanned_at.strftime("%Y-%m-%d %H:%M:%S"),
        }


# ─── Evidence Record Model ───────────────────────────────── #
class EvidenceRecord(db.Model):
    __tablename__ = "evidence_records"

    id              = db.Column(db.Integer, primary_key=True)
    session_id      = db.Column(db.Integer, db.ForeignKey("scan_sessions.id"), nullable=False)
    file_name       = db.Column(db.String(255))
    file_path       = db.Column(db.String(1000))
    file_type       = db.Column(db.String(20))
    file_size_kb    = db.Column(db.Float)
    created_time    = db.Column(db.String(30))
    modified_time   = db.Column(db.String(30))
    accessed_time   = db.Column(db.String(30))
    permissions     = db.Column(db.String(100))
    anomaly_flag    = db.Column(db.String(100))
    sha256_hash     = db.Column(db.String(64))
    md5_hash        = db.Column(db.String(32))
    status          = db.Column(db.String(50))
    risk_level      = db.Column(db.String(20))
    risk_score      = db.Column(db.Integer, default=0)
    category        = db.Column(db.String(80))
    entropy         = db.Column(db.Float, default=0.0)
    timestomping    = db.Column(db.Boolean, default=False)
    collected_at    = db.Column(db.String(30))

    def to_dict(self):
        return {
            "id"            : self.id,
            "session_id"    : self.session_id,
            "file_name"     : self.file_name,
            "file_path"     : self.file_path,
            "file_type"     : self.file_type,
            "file_size_kb"  : self.file_size_kb,
            "created_time"  : self.created_time,
            "modified_time" : self.modified_time,
            "accessed_time" : self.accessed_time,
            "permissions"   : self.permissions,
            "anomaly_flag"  : self.anomaly_flag,
            "sha256_hash"   : self.sha256_hash,
            "md5_hash"      : self.md5_hash,
            "status"        : self.status,
            "risk_level"    : self.risk_level,
            "risk_score"    : self.risk_score,
            "category"      : self.category,
            "entropy"       : round(self.entropy, 4) if self.entropy else 0,
            "timestomping"  : self.timestomping,
            "collected_at"  : self.collected_at,
        }
