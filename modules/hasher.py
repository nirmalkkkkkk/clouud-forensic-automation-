import hashlib

def _hash_file(file_path, algorithm):
    """Internal helper to hash a file with the given algorithm."""
    hasher = hashlib.new(algorithm)
    try:
        with open(file_path, 'rb') as f:
            while chunk := f.read(4096):
                hasher.update(chunk)
        return hasher.hexdigest()
    except (IOError, OSError) as e:
        return f"ERROR: {str(e)}"


def generate_sha256(file_path):
    """Generate SHA256 hash for a file."""
    return _hash_file(file_path, 'sha256')


def generate_md5(file_path):
    """Generate MD5 hash for a file."""
    return _hash_file(file_path, 'md5')


def generate_both_hashes(file_path):
    """
    Generate both SHA256 and MD5 hashes for a file.
    Returns a dict with both values.
    """
    return {
        "SHA256 Hash" : generate_sha256(file_path),
        "MD5 Hash"    : generate_md5(file_path)
    }