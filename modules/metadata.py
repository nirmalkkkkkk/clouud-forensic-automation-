import os
import stat
from datetime import datetime

def extract_metadata(file_path):
    """
    Extracts comprehensive forensic metadata from a file.
    Returns a dictionary with file attributes, permissions,
    and anomaly flags.
    """
    stats = os.stat(file_path)

    # ===== File Permissions =====
    mode = stats.st_mode
    permissions = []
    if mode & stat.S_IRUSR: permissions.append('Owner-Read')
    if mode & stat.S_IWUSR: permissions.append('Owner-Write')
    if mode & stat.S_IXUSR: permissions.append('Owner-Execute')
    permissions_str = ', '.join(permissions) if permissions else 'No Permissions Detected'

    # ===== Anomaly Detection =====
    file_size_kb = round(stats.st_size / 1024, 2)
    anomaly = 'None'
    if stats.st_size == 0:
        anomaly = 'Zero-Byte File (Possible Wipe)'
    elif file_size_kb > 10240:   # Files larger than 10 MB
        anomaly = 'Unusually Large File'

    return {
        "File Name"      : os.path.basename(file_path),
        "File Path"      : file_path,
        "File Type"      : os.path.splitext(file_path)[1].lower(),
        "File Size (KB)" : file_size_kb,
        "Created Time"   : datetime.fromtimestamp(stats.st_ctime),
        "Modified Time"  : datetime.fromtimestamp(stats.st_mtime),
        "Accessed Time"  : datetime.fromtimestamp(stats.st_atime),
        "Permissions"    : permissions_str,
        "Anomaly Flag"   : anomaly
    }