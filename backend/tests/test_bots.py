"""Tests for Bot CRUD and Slack/Telegram mapping endpoints."""
from __future__ import annotations


_SLACK_BOT = {
    "name": "My Slack Bot",
    "channel_type": "slack",
    "config": {
        "bot_token": "xoxb-test-token",
        "signing_secret": "test-signing-secret",
    },
}

_TELEGRAM_BOT = {
    "name": "My Telegram Bot",
    "channel_type": "telegram",
    "config": {
        "bot_token": "1234567890:AAAAAAAAAA",
    },
}

_AGENT_PAYLOAD = {
    "name": "Bot Agent",
    "role": "assistant",
    "system_prompt": "You answer questions.",
    "model": "gpt-4-turbo",
    "provider": "openai",
    "tools": [],
    "config": {},
}

_WF_DEF = lambda agent_id: {  # noqa: E731
    "name": "Bot WF",
    "definition": {
        "nodes": [{"id": "n1", "type": "AGENT", "agent_id": agent_id, "config": {}}],
        "edges": [],
        "start_node_id": "n1",
    },
}


# ── Bot CRUD ──────────────────────────────────────────────────────────────────

def test_create_slack_bot(client):
    resp = client.post("/bots", json=_SLACK_BOT)
    assert resp.status_code == 201
    body = resp.json()
    assert body["channel_type"] == "slack"
    # Sensitive fields must be masked in the response
    assert body["config"]["bot_token"] != "xoxb-test-token"


def test_list_bots(client):
    client.post("/bots", json=_SLACK_BOT)
    resp = client.get("/bots")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_delete_bot(client):
    bot_id = client.post("/bots", json=_SLACK_BOT).json()["id"]
    assert client.delete(f"/bots/{bot_id}").status_code == 204


def test_delete_bot_not_found(client):
    assert client.delete("/bots/00000000-0000-0000-0000-000000000000").status_code == 404


# ── Slack mappings ────────────────────────────────────────────────────────────

def test_add_and_list_slack_mapping(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_WF_DEF(agent_id)).json()["id"]
    bot_id = client.post("/bots", json=_SLACK_BOT).json()["id"]

    mapping_payload = {"channel_id": "C12345", "workflow_id": wf_id, "channel_name": "#general"}
    resp = client.post(f"/bots/{bot_id}/slack-mappings", json=mapping_payload)
    assert resp.status_code == 201

    list_resp = client.get(f"/bots/{bot_id}/slack-mappings")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
    assert list_resp.json()[0]["channel_id"] == "C12345"


def test_delete_slack_mapping(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_WF_DEF(agent_id)).json()["id"]
    bot_id = client.post("/bots", json=_SLACK_BOT).json()["id"]

    mapping_id = client.post(
        f"/bots/{bot_id}/slack-mappings",
        json={"channel_id": "C99999", "workflow_id": wf_id},
    ).json()["id"]

    assert client.delete(f"/bots/slack-mappings/{mapping_id}").status_code == 204

    list_resp = client.get(f"/bots/{bot_id}/slack-mappings")
    assert list_resp.json() == []


def test_slack_mapping_unknown_workflow(client):
    bot_id = client.post("/bots", json=_SLACK_BOT).json()["id"]
    resp = client.post(
        f"/bots/{bot_id}/slack-mappings",
        json={"channel_id": "C00000", "workflow_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert resp.status_code == 404
