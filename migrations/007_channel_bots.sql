-- Named bots: each bot has a user-chosen name, channel type, and stored credentials.
CREATE TABLE IF NOT EXISTS channel_bots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    channel_type  TEXT NOT NULL,          -- 'telegram' | 'slack'
    config        JSONB NOT NULL DEFAULT '{}',
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Slack channel → workflow mappings (parallel to telegram_chat_mappings)
CREATE TABLE IF NOT EXISTS slack_channel_mappings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id       UUID NOT NULL REFERENCES channel_bots(id) ON DELETE CASCADE,
    channel_id   TEXT NOT NULL,
    channel_name TEXT,
    workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slack_mappings_bot_id    ON slack_channel_mappings(bot_id);
CREATE INDEX IF NOT EXISTS idx_slack_mappings_channel   ON slack_channel_mappings(channel_id);

-- Link existing Telegram mappings to a named bot (nullable for backward compat)
ALTER TABLE telegram_chat_mappings
    ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES channel_bots(id) ON DELETE SET NULL;
