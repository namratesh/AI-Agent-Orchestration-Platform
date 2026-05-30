"""
External tool management API router.

Tools are reusable HTTP integrations that workflow TOOL nodes can call at
runtime.  Each tool stores:
  - An HTTP method, URL, headers, and a body template with ``{{variable}}``
    placeholders that are substituted at call time.
  - An encrypted API key stored via Fernet encryption (see ``services.crypto``).

API keys are never returned in plaintext — list and get responses replace the
stored value with a fixed mask string.  When updating, the client must send a
new plaintext key to change it; sending the mask string leaves the existing
value unchanged.

The ``/tools/templates`` endpoint provides prebuilt tool definitions that users
can import as a starting point without manually filling in URLs and headers.
"""
from __future__ import annotations
import re
import time
from typing import Dict, List
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.logging_config import get_logger
from db.db import (create_tool, delete_tool, get_db, get_tool, list_tools,
                   update_tool)
from schemas.models import (Tool, ToolCreate, ToolTestRequest, ToolTestResponse,
                             ToolUpdate)
from services.crypto import decrypt_api_key, encrypt_api_key

router = APIRouter(prefix="/tools", tags=["tools"])
logger = get_logger(__name__)

_VAR_RE = re.compile(r"\{\{(\w+)\}\}")
_MASKED = "••••••"

# ── Prebuilt tool templates ────────────────────────────────────────────────────

PREBUILT_TEMPLATES = [
    {
        "slug": "tavily_search",
        "name": "Tavily Web Search",
        "description": (
            "Real-time web search powered by Tavily AI. "
            "Returns top results with titles, content snippets, and source URLs. "
            "Use {{query}} as a placeholder for the search term."
        ),
        "method": "POST",
        "url": "https://api.tavily.com/search",
        "headers": {"Content-Type": "application/json"},
        "body_template": '{"query": "{{query}}", "max_results": 5, "search_depth": "basic"}',
        "api_key": "",
        "api_key_header": "Authorization",
        "api_key_prefix": "Bearer",
        "timeout_seconds": 30,
        "setup_hint": "Get a free API key at tavily.com — supports 1 000 free searches/month.",
        "docs_url": "https://docs.tavily.com",
    },
]


def _substitute(text: str, variables: Dict[str, str]) -> str:
    """Replace ``{{variable}}`` placeholders in ``text`` with values from ``variables``.

    Unknown placeholders are left unchanged.
    """
    return _VAR_RE.sub(lambda m: variables.get(m.group(1), m.group(0)), text)


def _to_schema(row) -> Tool:
    """Convert an ORM tool row to a Pydantic schema, masking the stored API key."""
    t = Tool.model_validate(row)
    t.api_key = _MASKED if row.api_key else ""
    return t


@router.get("/templates")
def list_templates():
    """Return static prebuilt tool templates.

    Purely informational — no auth required.  Templates provide a starting
    point for common integrations (e.g. Tavily web search) without requiring
    users to fill in all fields manually.
    """
    return PREBUILT_TEMPLATES


@router.post("", response_model=Tool, status_code=201)
def create_tool_endpoint(payload: ToolCreate, db: Session = Depends(get_db)):
    """Create a new tool, encrypting the API key before storage.

    Returns 409 if a tool with the same name already exists.
    """
    try:
        row = create_tool(
            db,
            name=payload.name, description=payload.description, method=payload.method,
            url=payload.url, headers=payload.headers, body_template=payload.body_template,
            api_key=encrypt_api_key(payload.api_key),
            api_key_header=payload.api_key_header,
            api_key_prefix=payload.api_key_prefix,
            timeout_seconds=payload.timeout_seconds,
        )
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"A tool named '{payload.name}' already exists.")
    logger.info("tool_created", tool_id=str(row.id), name=row.name)
    return _to_schema(row)


@router.get("", response_model=List[Tool])
def list_tools_endpoint(db: Session = Depends(get_db)):
    """Return all tools with API keys masked."""
    return [_to_schema(r) for r in list_tools(db)]


@router.get("/{tool_id}", response_model=Tool)
def get_tool_endpoint(tool_id: UUID, db: Session = Depends(get_db)):
    """Return a single tool by ID with its API key masked.

    Returns 404 if not found.
    """
    row = get_tool(db, tool_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    return _to_schema(row)


@router.put("/{tool_id}", response_model=Tool)
def update_tool_endpoint(tool_id: UUID, payload: ToolUpdate, db: Session = Depends(get_db)):
    """Update a tool's configuration.

    If the client sends the mask string as ``api_key``, the existing encrypted
    key is preserved.  Any other non-empty string is re-encrypted and stored.

    Returns 404 if not found, 409 on name collision.
    """
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}

    # Only re-encrypt if the client sent a real key (not the mask placeholder).
    if "api_key" in updates:
        raw = updates["api_key"]
        updates["api_key"] = "" if raw == _MASKED else encrypt_api_key(raw)

    try:
        row = update_tool(db, tool_id, **updates)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail=f"A tool named '{updates.get('name')}' already exists.")
    if row is None:
        raise HTTPException(status_code=404, detail="Tool not found")
    logger.info("tool_updated", tool_id=str(tool_id))
    return _to_schema(row)


@router.delete("/{tool_id}", status_code=204)
def delete_tool_endpoint(tool_id: UUID, db: Session = Depends(get_db)):
    """Delete a tool.

    Returns 404 if not found.
    """
    if not delete_tool(db, tool_id):
        raise HTTPException(status_code=404, detail="Tool not found")
    logger.info("tool_deleted", tool_id=str(tool_id))


@router.post("/{tool_id}/test", response_model=ToolTestResponse)
def test_tool_endpoint(tool_id: UUID, payload: ToolTestRequest,
                       db: Session = Depends(get_db)):
    """Execute a live HTTP test call using the tool's configuration.

    Variable placeholders in the URL, headers, and body are substituted from
    ``payload.variables`` before the request is sent.  The stored API key is
    decrypted and injected into the appropriate header.

    Returns the HTTP status code, response body, headers, and elapsed time.
    On network or timeout errors, returns status 0 with the error message.

    Returns 404 if the tool is not found.
    """
    row = get_tool(db, tool_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Tool not found")

    variables = payload.variables
    resolved_url = _substitute(row.url, variables)

    resolved_headers: Dict[str, str] = {
        k: _substitute(v, variables) for k, v in (row.headers or {}).items()
    }

    # Decrypt the stored key and inject it into the request headers.
    plain_key = decrypt_api_key(row.api_key)
    if plain_key:
        prefix = row.api_key_prefix.strip()
        key_value = f"{prefix} {plain_key}" if prefix else plain_key
        resolved_headers[row.api_key_header] = key_value

    raw_body = payload.body_override if payload.body_override is not None else row.body_template
    resolved_body = _substitute(raw_body, variables) if raw_body else None

    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=row.timeout_seconds) as client:
            response = client.request(
                method=row.method.upper(),
                url=resolved_url,
                headers=resolved_headers,
                params=payload.params or None,
                content=resolved_body.encode() if resolved_body else None,
            )
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.info("tool_test_ok", tool_id=str(tool_id),
                    status=response.status_code, duration_ms=round(duration_ms, 1))
        return ToolTestResponse(
            status_code=response.status_code,
            response_body=response.text,
            response_headers=dict(response.headers),
            duration_ms=round(duration_ms, 1),
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000
        logger.warning("tool_test_error", tool_id=str(tool_id), error=str(exc))
        return ToolTestResponse(
            status_code=0, response_body="", response_headers={},
            duration_ms=round(duration_ms, 1), error=str(exc),
        )
