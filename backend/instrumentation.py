"""
OpenTelemetry and Prometheus instrumentation setup.

Initialises two OTel signal pipelines:
  - **Traces** → Jaeger via OTLP HTTP (port 4318).  Spans are batched and
    exported asynchronously to minimise latency impact on request handling.
  - **Metrics** → Prometheus default registry via PrometheusMetricReader.
    The ``/metrics`` endpoint (mounted in main.py) scrapes this registry.

Auto-instrumentation patches FastAPI, the ``requests`` library, and SQLAlchemy
so that HTTP calls, DB queries, and route handlers all produce spans automatically.

Helper functions ``record_agent_execution`` and ``record_workflow_execution``
are called by service layer code to increment domain-specific counters after
each execution, keeping instrumentation concerns out of business logic.
"""
from __future__ import annotations
import os

from opentelemetry import metrics as otel_metrics
from opentelemetry import trace as otel_trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_SERVICE = "ai-agent-orchestration"

# Metric instruments — None until setup_otel() runs.
_agent_executions = None
_agent_tokens = None
_agent_cost = None
_agent_duration = None
_workflow_executions = None


def setup_otel(app=None, engine=None) -> None:
    """Initialise OTel tracing, metrics, and auto-instrumentation.

    Can be called from both the FastAPI process (pass app + engine) and the
    RQ worker process (pass engine only — FastAPI instrumentation is skipped).

    Args:
        app: The FastAPI application instance to instrument (optional).
        engine: The SQLAlchemy engine to instrument for DB span generation (optional).
    """
    global _agent_executions, _agent_tokens, _agent_cost, _agent_duration, _workflow_executions

    resource = Resource.create({SERVICE_NAME: _SERVICE})

    # Tracing → Jaeger via OTLP HTTP (port 4318)
    otlp = OTLPSpanExporter(
        endpoint=f"http://{os.getenv('JAEGER_HOST', 'jaeger')}:4318/v1/traces",
    )
    tp = TracerProvider(resource=resource)
    tp.add_span_processor(BatchSpanProcessor(otlp))
    otel_trace.set_tracer_provider(tp)

    # Metrics → Prometheus (populates default prometheus_client registry)
    reader = PrometheusMetricReader()
    mp = MeterProvider(resource=resource, metric_readers=[reader])
    otel_metrics.set_meter_provider(mp)
    meter = otel_metrics.get_meter(_SERVICE)

    _agent_executions = meter.create_counter(
        "agent_executions", description="Total agent task executions"
    )
    _agent_tokens = meter.create_counter(
        "agent_tokens", description="Total LLM tokens consumed"
    )
    _agent_cost = meter.create_counter(
        "agent_cost", description="Total LLM cost in USD"
    )
    _agent_duration = meter.create_histogram(
        "agent_execution_duration", unit="s", description="Agent execution duration"
    )
    _workflow_executions = meter.create_counter(
        "workflow_executions", description="Total workflow executions"
    )

    if app is not None:
        FastAPIInstrumentor.instrument_app(app)
    RequestsInstrumentor().instrument()
    if engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=engine)


def record_agent_execution(
    *, provider: str, tokens: int, cost: float, duration: float, status: str = "success"
) -> None:
    """Increment agent execution metrics after each agent run.

    Safe to call before ``setup_otel()`` — instruments are None-guarded.

    Args:
        provider: LLM provider name (e.g. ``"openai"``, ``"groq"``).
        tokens: Total tokens consumed across all ReAct loop iterations.
        cost: Estimated cost in USD.
        duration: Wall-clock execution time in seconds.
        status: ``"success"`` or ``"error"``.
    """
    attrs = {"provider": provider, "status": status}
    if _agent_executions is not None:
        _agent_executions.add(1, attrs)
    if _agent_tokens is not None:
        _agent_tokens.add(tokens, {"provider": provider})
    if _agent_cost is not None:
        _agent_cost.add(cost, {"provider": provider})
    if _agent_duration is not None:
        _agent_duration.record(duration, {"provider": provider})


def record_workflow_execution(*, status: str = "success") -> None:
    """Increment the workflow execution counter.

    Args:
        status: ``"success"`` or ``"error"``.
    """
    if _workflow_executions is not None:
        _workflow_executions.add(1, {"status": status})
