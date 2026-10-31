-- Additive and repeatable: leaves all existing queues, grants and records intact.
CREATE TABLE IF NOT EXISTS ai_mission_changes (
 id TEXT PRIMARY KEY CHECK(length(id)=64), grant_id TEXT NOT NULL,
 grant_version INTEGER NOT NULL, payload_hash TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applying','accepted','rejected','expired')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 fields TEXT CHECK(fields IS NULL OR length(CAST(fields AS BLOB))<=12000),
 expected_task_version TEXT, review_hash TEXT, receipt_ref TEXT
);
CREATE INDEX IF NOT EXISTS ai_mission_changes_status ON ai_mission_changes(status,created_at,id);
CREATE INDEX IF NOT EXISTS ai_mission_changes_grant ON ai_mission_changes(grant_id,grant_version,created_at,id);
