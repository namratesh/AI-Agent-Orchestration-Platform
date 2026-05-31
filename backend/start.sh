#!/bin/sh
# Production entrypoint: runs the RQ worker alongside the API server.
# Used by Railway (single service). Local Docker Compose overrides this
# with --reload via the 'command:' key and keeps a separate worker container.
PORT="${PORT:-8000}"
rq worker executions --url "${REDIS_URL:-redis://redis:6379}" &
exec uvicorn main:app --host 0.0.0.0 --port "$PORT" --workers 2
