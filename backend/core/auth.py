from __future__ import annotations

from fastapi import Header, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> str:
    """FastAPI dependency — verifies the Bearer token matches API_SECRET_KEY.

    Skipped (returns empty string) when API_SECRET_KEY is not configured so the
    platform works out-of-the-box in local development without any setup.
    """
    if not settings.API_SECRET_KEY:
        return ""
    if credentials is None or credentials.credentials != settings.API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return credentials.credentials
