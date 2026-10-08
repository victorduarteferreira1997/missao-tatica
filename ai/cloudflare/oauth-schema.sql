-- Separate OAuth codes only. Does not alter missions, contexts, proposals or Firebase.
CREATE TABLE IF NOT EXISTS ai_oauth_codes (
    code_hash TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_oauth_codes_expiry ON ai_oauth_codes(expires_at);
