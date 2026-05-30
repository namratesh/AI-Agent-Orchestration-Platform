"""
Symmetric encryption helpers for API key storage.

Tool API keys are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before
being persisted to the database.  The encryption key is read from the
``TOOL_ENCRYPTION_KEY`` environment variable, which must be a valid 32-byte
URL-safe base64 string generated with::

    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

The Fernet instance is lazily initialised and cached in a module-level singleton
so the key is only loaded once per process.

Important:
  - Changing ``TOOL_ENCRYPTION_KEY`` will invalidate all previously stored keys.
  - Empty plaintext is stored as an empty string without encryption so that
    tools without API keys do not trigger the key requirement at startup.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from core.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Return the cached Fernet instance, initialising it on first call.

    Raises:
        RuntimeError: If ``TOOL_ENCRYPTION_KEY`` is not set in the environment.
    """
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
    """Fernet-encrypt a plaintext API key for database storage.

    Args:
        plaintext: The raw API key string.

    Returns:
        URL-safe base64-encoded ciphertext, or an empty string if ``plaintext``
        is empty (tools without API keys are stored as-is).
    """
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted API key for use in HTTP requests.

    Args:
        ciphertext: The encrypted value as stored in the database.

    Returns:
        The original plaintext API key, or an empty string if ``ciphertext``
        is empty.

    Raises:
        RuntimeError: If decryption fails — typically because ``TOOL_ENCRYPTION_KEY``
            was rotated after the key was stored.
    """
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt API key — key may have changed") from exc
