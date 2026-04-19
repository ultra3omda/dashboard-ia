"""Password hashing with bcrypt.

passlib's bcrypt backend breaks against bcrypt 4.1+ (wrap-bug detection / 72-byte rules).
Using the bcrypt library directly stays compatible and matches existing $2b$ hashes.
"""
import bcrypt


def _utf8_72(password: str) -> bytes:
    """bcrypt only uses the first 72 bytes of the UTF-8 password."""
    b = password.encode("utf-8")
    return b[:72] if len(b) > 72 else b


def hash_password(password: str) -> str:
    digest = bcrypt.hashpw(_utf8_72(password), bcrypt.gensalt(rounds=12))
    return digest.decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_utf8_72(plain), hashed.encode("ascii"))
    except ValueError:
        return False
