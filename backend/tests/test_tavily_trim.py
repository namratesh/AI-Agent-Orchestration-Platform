"""Tests for the Tavily query-trimming logic in services/executor.py."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


def _call_web_search(query: str, api_key: str = "tvly-test"):
    from services.executor import web_search

    mock_client = MagicMock()
    mock_client.search.return_value = {
        "results": [{"title": "T", "content": "C", "url": "http://example.com"}]
    }

    with patch("services.executor.settings") as mock_settings, \
         patch("tavily.TavilyClient", return_value=mock_client):
        mock_settings.TAVILY_API_KEY = api_key
        result = web_search(query)

    return result, mock_client


def test_long_query_trimmed_to_400_chars():
    """Queries over 400 chars must be cut to ≤ 400 before hitting Tavily."""
    _, mock_client = _call_web_search("x" * 500)
    sent = mock_client.search.call_args[0][0]
    assert len(sent) <= 400


def test_sentence_boundary_trim():
    """When a sentence boundary exists within 400 chars, trim there."""
    query = "First sentence. " + "y" * 500
    _, mock_client = _call_web_search(query)
    sent = mock_client.search.call_args[0][0]
    # The trim code cuts at the separator position, so the period is not included.
    assert sent == "First sentence"


def test_short_query_passed_unchanged():
    """Queries under 400 chars should reach Tavily unmodified."""
    query = "What is LangGraph?"
    _, mock_client = _call_web_search(query)
    sent = mock_client.search.call_args[0][0]
    assert sent == query


def test_missing_api_key_returns_config_message():
    """No Tavily key → return a user-friendly message, never raise."""
    from services.executor import web_search

    with patch("services.executor.settings") as mock_settings:
        mock_settings.TAVILY_API_KEY = None
        result = web_search("anything")

    assert isinstance(result, str)
    assert len(result) > 0


def test_tavily_exception_returns_error_string():
    """Tavily 4xx/5xx errors must be caught and returned as a string."""
    from services.executor import web_search

    mock_client = MagicMock()
    mock_client.search.side_effect = Exception("status 400")

    with patch("services.executor.settings") as mock_settings, \
         patch("tavily.TavilyClient", return_value=mock_client):
        mock_settings.TAVILY_API_KEY = "tvly-test"
        result = web_search("query that triggers error")

    assert "Web search error" in result
    assert "status 400" in result
