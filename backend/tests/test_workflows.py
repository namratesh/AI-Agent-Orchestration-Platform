"""Tests for workflow CRUD and execute endpoint."""
from __future__ import annotations
from unittest.mock import MagicMock, patch


_AGENT_PAYLOAD = {
    "name": "WF Agent",
    "role": "assistant",
    "system_prompt": "You are helpful.",
    "model": "gpt-4-turbo",
    "provider": "openai",
    "tools": [],
    "config": {},
}


def _make_workflow_payload(agent_id: str) -> dict:
    return {
        "name": "My Workflow",
        "definition": {
            "nodes": [{"id": "n1", "type": "AGENT", "agent_id": agent_id, "config": {}}],
            "edges": [],
            "start_node_id": "n1",
        },
    }


def test_create_workflow_returns_201(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    resp = client.post("/workflows", json=_make_workflow_payload(agent_id))
    assert resp.status_code == 201
    assert resp.json()["name"] == "My Workflow"


def test_list_workflows(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    client.post("/workflows", json=_make_workflow_payload(agent_id))
    resp = client.get("/workflows")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_get_workflow_by_id(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow_payload(agent_id)).json()["id"]
    resp = client.get(f"/workflows/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == wf_id


def test_get_workflow_not_found(client):
    assert client.get("/workflows/00000000-0000-0000-0000-000000000000").status_code == 404


def test_delete_workflow(client):
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow_payload(agent_id)).json()["id"]
    assert client.delete(f"/workflows/{wf_id}").status_code == 204
    assert client.get(f"/workflows/{wf_id}").status_code == 404


def test_execute_workflow_returns_202(client):
    """Execute endpoint should return 202 immediately with execution_id."""
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow_payload(agent_id)).json()["id"]

    # Patch the background executor so no real LLM calls are made.
    with patch("api.workflows._run_workflow_bg"):
        resp = client.post(f"/workflows/{wf_id}/execute", json={"task": "test task"})

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "queued"
    assert "execution_id" in body


def test_execute_workflow_preflight_fails_on_missing_agent(client):
    """Execute should return 422 when a node references an agent that no longer exists."""
    # Create a workflow with a bogus agent_id that was never saved.
    fake_agent_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    payload = {
        "name": "Bad WF",
        "definition": {
            "nodes": [{"id": "n1", "type": "AGENT", "agent_id": fake_agent_id, "config": {}}],
            "edges": [],
            "start_node_id": "n1",
        },
    }
    wf_id = client.post("/workflows", json=payload).json()["id"]
    resp = client.post(f"/workflows/{wf_id}/execute", json={"task": "hello"})
    assert resp.status_code == 422
    body = resp.json()
    assert "errors" in body["detail"]


def test_execute_unknown_workflow_returns_404(client):
    resp = client.post(
        "/workflows/00000000-0000-0000-0000-000000000000/execute",
        json={"task": "test"},
    )
    assert resp.status_code == 404
