-- Enforce unique names for agents, workflows, tools, and bots.
-- Each constraint is added only if it doesn't already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_name_unique'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_name_unique UNIQUE (name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflows_name_unique'
  ) THEN
    ALTER TABLE workflows ADD CONSTRAINT workflows_name_unique UNIQUE (name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tools_name_unique'
  ) THEN
    ALTER TABLE tools ADD CONSTRAINT tools_name_unique UNIQUE (name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'channel_bots_name_unique'
  ) THEN
    ALTER TABLE channel_bots ADD CONSTRAINT channel_bots_name_unique UNIQUE (name);
  END IF;
END
$$;
