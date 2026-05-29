-- Add node_outputs JSONB to workflow_executions so per-node agent
-- outputs are persisted and surfaced in the execution history UI.
ALTER TABLE workflow_executions
  ADD COLUMN IF NOT EXISTS node_outputs JSONB NOT NULL DEFAULT '{}';
