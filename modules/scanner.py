import os

# ===== FILE TYPES TO SKIP (not healthcare data) =====
SKIP_EXTENSIONS = {'.pyc', '.log', '.tmp', '.bak', '.swp', '.DS_Store'}
SKIP_FOLDERS    = {'__pycache__', '.git', 'logs', 'reports', 'modules'}

def scan_directory(directory_path):
    """
    Recursively scans a directory and returns only valid
    healthcare data file paths. Skips system files,
    compiled files, and irrelevant folders.
    """
    file_paths = []

    for root, dirs, files in os.walk(directory_path):

        # Remove folders we want to skip
        # (modifies in-place so os.walk won't go inside them)
        dirs[:] = [d for d in dirs if d not in SKIP_FOLDERS]

        for file in files:

            # Skip hidden files (files starting with a dot)
            if file.startswith('.'):
                continue

            # Skip unwanted extensions
            ext = os.path.splitext(file)[1].lower()
            if ext in SKIP_EXTENSIONS:
                continue

            full_path = os.path.join(root, file)
            file_paths.append(full_path)

    return file_paths