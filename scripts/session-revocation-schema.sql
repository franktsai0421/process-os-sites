-- Session revocation V1. Explicit migration, never run by login/public reads.
-- Apply only to an authorized backed-up DB; then enable PROCESS_SESSION_REVOCATION_ENABLED=1.
-- Contains SHA-256 digests and expiry timestamps, never raw tokens or user credentials.
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS process_revoked_sessions (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK(length(token_digest)=64),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS process_revoked_sessions_expiry ON process_revoked_sessions(expires_at);
COMMIT;
