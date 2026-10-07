-- Apply only to the empty Cloudflare D1 database missao-tatica-ai.
-- No access to, migration from, or deletion of Firebase (default).
CREATE TABLE IF NOT EXISTS ai_context (
    week_start TEXT PRIMARY KEY,
    revision TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    payload TEXT NOT NULL CHECK(length(payload) <= 64000)
);
CREATE TABLE IF NOT EXISTS ai_proposals (
    id TEXT PRIMARY KEY CHECK(length(id) = 64),
    payload TEXT NOT NULL CHECK(length(payload) <= 12000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS ai_proposals_pending ON ai_proposals(status,created_at,id);
