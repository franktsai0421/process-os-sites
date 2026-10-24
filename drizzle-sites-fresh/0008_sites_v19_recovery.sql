-- Fixed version19 incident only. Both singleton records are retained forever.
-- Admission survives a failed/unknown atomic transaction; it is never reset.
CREATE TABLE process_import_verify_v19_admission (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), config_sha TEXT NOT NULL,
 nonce TEXT NOT NULL UNIQUE, plan_sha TEXT NOT NULL, plan TEXT NOT NULL,
 request_sha TEXT NOT NULL, maintenance_digest TEXT NOT NULL,
 issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 receipt_expires_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','unknown','complete')),
 admitted_at INTEGER NOT NULL, finalized_at INTEGER,
 CHECK(expires_at=issued_at+600000), CHECK(receipt_expires_at=issued_at+18000000)
);
--> statement-breakpoint
CREATE TABLE process_import_verify_v19_supersession (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), nonce TEXT NOT NULL UNIQUE, plan_sha TEXT NOT NULL,
 before_sha TEXT NOT NULL, before_image TEXT NOT NULL, old_request_id TEXT NOT NULL,
 new_grant_id TEXT NOT NULL UNIQUE, program_commit TEXT NOT NULL,
 maintenance_digest TEXT NOT NULL, applied_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state='resumed')
);
