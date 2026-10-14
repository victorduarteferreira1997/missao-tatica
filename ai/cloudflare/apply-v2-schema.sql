-- Separate application records preserve the original proposal table/constraints.
CREATE TABLE IF NOT EXISTS ai_v2_applications (
 proposal_id TEXT PRIMARY KEY,
 application_id TEXT NOT NULL CHECK(length(application_id)=64),
 proposal_version INTEGER NOT NULL CHECK(proposal_version>0),
 status TEXT NOT NULL DEFAULT 'applying' CHECK(status IN ('applying','accepted')),
 fields TEXT,
 fields_hash TEXT NOT NULL CHECK(length(fields_hash)=64),
 created_at INTEGER NOT NULL,
 accepted_at INTEGER,
 task_ref TEXT CHECK(task_ref IS NULL OR length(task_ref)=64)
);
