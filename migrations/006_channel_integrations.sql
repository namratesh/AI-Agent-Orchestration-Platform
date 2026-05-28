CREATE TABLE IF NOT EXISTS workflow_integrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    channel_type  TEXT NOT NULL,
    config        JSONB NOT NULL DEFAULT '{}',
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_integrations_workflow_id ON workflow_integrations(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_integrations_enabled    ON workflow_integrations(enabled);
