CREATE TABLE IF NOT EXISTS tools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255)  NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    method          VARCHAR(10)   NOT NULL DEFAULT 'GET',
    url             TEXT          NOT NULL DEFAULT '',
    headers         JSONB         NOT NULL DEFAULT '{}',
    body_template   TEXT          NOT NULL DEFAULT '',
    api_key         TEXT          NOT NULL DEFAULT '',
    api_key_header  VARCHAR(255)  NOT NULL DEFAULT 'Authorization',
    api_key_prefix  VARCHAR(50)   NOT NULL DEFAULT 'Bearer',
    timeout_seconds INTEGER       NOT NULL DEFAULT 30,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
