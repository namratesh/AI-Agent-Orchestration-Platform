CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    role        TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    model       TEXT NOT NULL,
    provider    TEXT NOT NULL,
    tools       JSONB NOT NULL DEFAULT '[]',
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflows (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    definition  JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id  UUID REFERENCES workflows(id) ON DELETE SET NULL,
    sender_id    UUID,
    receiver_id  UUID,
    content      TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    tokens_used  INTEGER NOT NULL DEFAULT 0,
    cost         NUMERIC(12, 8) NOT NULL DEFAULT 0,
    timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_workflow_id ON messages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp   ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_agents_provider      ON agents(provider);
