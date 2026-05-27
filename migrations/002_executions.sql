CREATE TABLE IF NOT EXISTS workflow_executions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id           UUID REFERENCES workflows(id) ON DELETE SET NULL,
    task                  TEXT NOT NULL,
    result                TEXT NOT NULL DEFAULT '',
    status                TEXT NOT NULL DEFAULT 'success',
    tokens_used           INTEGER NOT NULL DEFAULT 0,
    cost                  NUMERIC(12, 8) NOT NULL DEFAULT 0,
    execution_time_seconds NUMERIC(10, 3) NOT NULL DEFAULT 0,
    source                TEXT NOT NULL DEFAULT 'ui',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_created_at  ON workflow_executions(created_at);
CREATE INDEX IF NOT EXISTS idx_executions_status       ON workflow_executions(status);
