"""Tests for agent CRUD endpoints."""
from __future__ import annotations


_AGENT_PAYLOAD = {
    "name": "Test Agent",
    "role": "assistant",
    "system_prompt": "You are a helpful assistant.",
    "model": "gpt-4-turbo",
    "provider": "openai",
    "tools": [],
    "config": {},
}


def test_create_agent_returns_201(client):
    resp = client.post("/agents", json=_AGENT_PAYLOAD)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Test Agent"
    assert "id" in body


def test_list_agents_includes_created(client):
    client.post("/agents", json=_AGENT_PAYLOAD)
    resp = client.get("/agents")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_get_agent_by_id(client):
    create_resp = client.post("/agents", json=_AGENT_PAYLOAD)
    agent_id = create_resp.json()["id"]
    resp = client.get(f"/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == agent_id


def test_get_agent_not_found(client):
    resp = client.get("/agents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_delete_agent(client):
    create_resp = client.post("/agents", json=_AGENT_PAYLOAD)
    agent_id = create_resp.json()["id"]
    del_resp = client.delete(f"/agents/{agent_id}")
    assert del_resp.status_code == 204
    assert client.get(f"/agents/{agent_id}").status_code == 404


def test_delete_agent_not_found(client):
    resp = client.delete("/agents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
