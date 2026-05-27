from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.TOOL_ENCRYPTION_KEY
        if not key:
            raise RuntimeError(
                "TOOL_ENCRYPTION_KEY is not set. "
                "Generate one with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_api_key(plaintext: str) -> str:
    """Return empty string for empty input; otherwise Fernet-encrypt and return as str."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Return empty string for empty input; raise RuntimeError on bad token."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt API key — key may have changed") from exc
