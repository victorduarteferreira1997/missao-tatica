-- Additive foundation only. Apply to missao-tatica-ai; preserves every v1 table.
CREATE TABLE IF NOT EXISTS ai_v2_access (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    grant_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    status TEXT NOT NULL CHECK(status IN ('active','revoked')),
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    choices TEXT NOT NULL CHECK(length(choices) <= 1000),
    frozen_refs TEXT NOT NULL CHECK(length(frozen_refs) <= 14000),
    projection_version INTEGER NOT NULL DEFAULT 0,
    source_saved_at TEXT,
    synced_at INTEGER,
    snapshot TEXT CHECK(snapshot IS NULL OR length(CAST(snapshot AS BLOB)) <= 64000)
);
