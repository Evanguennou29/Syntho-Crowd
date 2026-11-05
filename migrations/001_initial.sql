-- V2 is isolated from legacy public.sc_* tables. No existing audit is modified.
CREATE TABLE syntho.campaigns (
    id varchar(36) PRIMARY KEY,
    url text NOT NULL,
    goal text NOT NULL,
    status varchar(24) NOT NULL CHECK (status IN
        ('queued', 'running', 'completed', 'partial', 'failure', 'cancelled')),
    created_at timestamptz NOT NULL,
    summary json,
    summary_status varchar(24) NOT NULL,
    summary_updated_at timestamptz,
    summary_attempts integer NOT NULL
);
CREATE INDEX ix_campaigns_created_at ON syntho.campaigns(created_at);
CREATE TABLE syntho.profiles (
    id varchar(36) PRIMARY KEY,
    campaign_id varchar(36) NOT NULL REFERENCES syntho.campaigns(id),
    data json NOT NULL
);
CREATE TABLE syntho.runs (
    id varchar(36) PRIMARY KEY,
    campaign_id varchar(36) NOT NULL REFERENCES syntho.campaigns(id),
    profile_id varchar(36) NOT NULL REFERENCES syntho.profiles(id),
    ordinal integer NOT NULL,
    status varchar(24) NOT NULL CHECK (status IN
        ('queued', 'running', 'success', 'failure', 'cancelled')),
    attempts integer NOT NULL,
    enqueued_at timestamptz,
    heartbeat_at timestamptz,
    action_logs json NOT NULL,
    ai_report json,
    artifacts json NOT NULL,
    error text,
    outcome varchar(24),
    UNIQUE (campaign_id, ordinal)
);
CREATE INDEX ix_syntho_runs_campaign ON syntho.runs(campaign_id);
CREATE INDEX ix_syntho_runs_status ON syntho.runs(status);
