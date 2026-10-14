-- Additive queue. Does not alter existing grants, snapshots, or v1 proposals.
CREATE TABLE IF NOT EXISTS ai_v2_proposals (
 id TEXT PRIMARY KEY CHECK(length(id)=64),
 grant_id TEXT NOT NULL,
 grant_version INTEGER NOT NULL CHECK(grant_version>0),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected','expired')),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 reviewed_at INTEGER,
 payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=12000)
);
CREATE INDEX IF NOT EXISTS ai_v2_proposals_pending ON ai_v2_proposals(status,created_at,id);
CREATE INDEX IF NOT EXISTS ai_v2_proposals_grant ON ai_v2_proposals(grant_id,grant_version,created_at,id);
CREATE INDEX IF NOT EXISTS ai_v2_proposals_expiry ON ai_v2_proposals(expires_at);
