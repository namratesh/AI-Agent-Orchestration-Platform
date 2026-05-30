"""
HTTP Bearer-token authentication dependency for FastAPI routes.

When ``API_SECRET_KEY`` is set in the environment, every protected route must
supply a matching ``Authorization: Bearer <key>`` header.  When the setting is
empty the dependency is a no-op, allowing the platform to run without auth in
local development or trusted internal networks.
"""
from __future__ import annotations

from fastapi import Header, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> str:
    """FastAPI dependency — verifies the Bearer token matches API_SECRET_KEY.

    Returns the validated token so downstream handlers can log or audit it.
    Returns an empty string when ``API_SECRET_KEY`` is not configured, allowing
    the platform to work out-of-the-box in local development without any setup.

    Raises:
        HTTPException: 401 if a key is configured but the request omits or
            provides an incorrect token.
    """
    if not settings.API_SECRET_KEY:
        return ""
    if credentials is None or credentials.credentials != settings.API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return credentials.credentials
