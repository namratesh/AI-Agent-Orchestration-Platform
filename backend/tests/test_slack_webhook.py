"""Tests for the Slack Events API webhook endpoint."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from unittest.mock import patch

from api.slack import _verify_signature


# ── Unit: signature verification ─────────────────────────────────────────────

def test_valid_signature():
    secret = "test-signing-secret"
    body = b'{"type":"event_callback"}'
    ts = str(int(time.time()))
    sig_base = f"v0:{ts}:{body.decode()}"
    sig = "v0=" + hmac.new(
        secret.encode(), sig_base.encode(), hashlib.sha256
    ).hexdigest()
    assert _verify_signature(body, ts, sig, secret) is True


def test_invalid_signature():
    assert _verify_signature(b"body", str(int(time.time())), "v0=bad", "secret") is False


def test_stale_timestamp_rejected():
    secret = "s"
    body = b"x"
    old_ts = str(int(time.time()) - 400)  # 400 s ago — older than 300 s window
    sig_base = f"v0:{old_ts}:{body.decode()}"
    sig = "v0=" + hmac.new(secret.encode(), sig_base.encode(), hashlib.sha256).hexdigest()
    assert _verify_signature(body, old_ts, sig, secret) is False


# ── Integration: URL verification challenge ───────────────────────────────────

def test_url_verification_challenge(client):
    payload = {"type": "url_verification", "challenge": "my-challenge-token"}
    resp = client.post("/slack/events", json=payload)
    assert resp.status_code == 200
    assert resp.json() == {"challenge": "my-challenge-token"}


# ── Integration: message with no mapping silently ignored ─────────────────────

def test_message_no_mapping_returns_ok(client):
    event_body = {
        "type": "event_callback",
        "event": {
            "type": "message",
            "channel": "C_UNMAPPED",
            "text": "hello",
            "ts": "12345.67890",
        },
    }
    resp = client.post("/slack/events", json=event_body)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ── Integration: bot messages are ignored ─────────────────────────────────────

def test_bot_message_ignored(client):
    event_body = {
        "type": "event_callback",
        "event": {
            "type": "message",
            "bot_id": "BABC123",  # present → skip
            "channel": "C12345",
            "text": "I am a bot",
            "ts": "12345.67890",
        },
    }
    resp = client.post("/slack/events", json=event_body)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


# ── Integration: valid message triggers workflow (mocked) ─────────────────────

def test_message_triggers_workflow(client):
    """End-to-end: create bot + mapping, post a valid signed Slack message.

    We patch _run_and_reply so no real LLM call happens. The test verifies that
    the webhook accepts the request and returns {"ok": True}.
    """
    agent_id = client.post("/agents", json={
        "name": "Slack Agent", "role": "assistant",
        "system_prompt": "Answer.", "model": "gpt-4-turbo",
        "provider": "openai", "tools": [], "config": {},
    }).json()["id"]

    wf_id = client.post("/workflows", json={
        "name": "Slack WF",
        "definition": {
            "nodes": [{"id": "n1", "type": "AGENT", "agent_id": agent_id, "config": {}}],
            "edges": [], "start_node_id": "n1",
        },
    }).json()["id"]

    signing_secret = "slack-signing-secret-123"
    bot = client.post("/bots", json={
        "name": "Slack Bot",
        "channel_type": "slack",
        "config": {"bot_token": "xoxb-fake", "signing_secret": signing_secret},
    }).json()

    client.post(f"/bots/{bot['id']}/slack-mappings", json={
        "channel_id": "C_TEST_CHANNEL2",
        "workflow_id": wf_id,
    })

    body_bytes = json.dumps({
        "type": "event_callback",
        "event": {
            "type": "message",
            "channel": "C_TEST_CHANNEL2",
            "text": "Run the report",
            "ts": "123456.789",
        },
    }).encode()

    ts = str(int(time.time()))
    sig_base = f"v0:{ts}:{body_bytes.decode()}"
    sig = "v0=" + hmac.new(
        signing_secret.encode(), sig_base.encode(), hashlib.sha256
    ).hexdigest()

    # Patch _run_and_reply so the background task doesn't attempt real LLM calls.
    with patch("api.slack._run_and_reply"):
        resp = client.post(
            "/slack/events",
            content=body_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Slack-Request-Timestamp": ts,
                "X-Slack-Signature": sig,
            },
        )

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
