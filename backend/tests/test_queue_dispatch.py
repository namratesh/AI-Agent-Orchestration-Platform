"""Tests for the RQ dispatch path and BackgroundTasks fallback in /execute."""
from __future__ import annotations
from unittest.mock import MagicMock, patch

_AGENT_PAYLOAD = {
    "name": "Queue Test Agent",
    "role": "assistant",
    "system_prompt": "You are helpful.",
    "model": "gpt-4-turbo",
    "provider": "openai",
    "tools": [],
    "config": {},
}


def _make_workflow(agent_id: str) -> dict:
    return {
        "name": "Queue Test Workflow",
        "definition": {
            "nodes": [{"id": "n1", "type": "AGENT", "agent_id": agent_id, "config": {}}],
            "edges": [],
            "start_node_id": "n1",
        },
    }


def test_execute_uses_rq_when_queue_available(client):
    """When QUEUE_AVAILABLE is True, execution_queue.enqueue should be called."""
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow(agent_id)).json()["id"]

    mock_queue = MagicMock()

    with patch("api.workflows.QUEUE_AVAILABLE", True), \
         patch("api.workflows.execution_queue", mock_queue):
        resp = client.post(f"/workflows/{wf_id}/execute", json={"task": "hello"})

    assert resp.status_code == 202
    assert resp.json()["status"] == "queued"
    mock_queue.enqueue.assert_called_once()
    task_fn = mock_queue.enqueue.call_args[0][0]
    assert task_fn.__name__ == "run_workflow"


def test_execute_passes_retry_config_to_rq(client):
    """The enqueue call should include job_timeout and retry arguments."""
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow(agent_id)).json()["id"]

    mock_queue = MagicMock()

    with patch("api.workflows.QUEUE_AVAILABLE", True), \
         patch("api.workflows.execution_queue", mock_queue):
        client.post(f"/workflows/{wf_id}/execute", json={"task": "hello"})

    kwargs = mock_queue.enqueue.call_args[1]
    assert kwargs.get("job_timeout") == 600
    assert kwargs.get("retry") is not None


def test_execute_falls_back_to_background_task_when_queue_unavailable(client):
    """When QUEUE_AVAILABLE is False, BackgroundTasks fallback is used."""
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow(agent_id)).json()["id"]

    with patch("api.workflows.QUEUE_AVAILABLE", False), \
         patch("api.workflows._run_workflow_bg"):
        resp = client.post(f"/workflows/{wf_id}/execute", json={"task": "hello"})

    assert resp.status_code == 202
    assert resp.json()["status"] == "queued"


def test_execute_returns_execution_id_for_polling(client):
    """Response body must include execution_id so the client can poll /executions/{id}."""
    agent_id = client.post("/agents", json=_AGENT_PAYLOAD).json()["id"]
    wf_id = client.post("/workflows", json=_make_workflow(agent_id)).json()["id"]

    with patch("api.workflows.QUEUE_AVAILABLE", False), \
         patch("api.workflows._run_workflow_bg"):
        body = client.post(f"/workflows/{wf_id}/execute", json={"task": "hello"}).json()

    assert "execution_id" in body
    assert body["status"] == "queued"
