"""
RQ worker entry point with OpenTelemetry initialisation.

Starts the RQ worker after setting up the OTel trace pipeline so that
agent_execute and workflow_execute spans are exported to Jaeger.
"""
from redis import Redis
from rq import Worker

from db.db import engine
from instrumentation import setup_otel

setup_otel(engine=engine)

redis_conn = Redis.from_url("redis://redis:6379")
w = Worker(["executions"], connection=redis_conn)
w.work()
