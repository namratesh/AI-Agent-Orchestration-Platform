-- Persist error details so the UI can display them instead of generic "error" status.
ALTER TABLE workflow_executions
    ADD COLUMN IF NOT EXISTS error_message TEXT;
