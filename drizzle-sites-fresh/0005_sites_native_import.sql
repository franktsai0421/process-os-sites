-- Operational-only, default-off native import. No grants, secrets or business rows.
CREATE TABLE process_import_capabilities (
 id TEXT PRIMARY KEY NOT NULL, credential_sha256 TEXT NOT NULL,
 pins TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope='staging'),
 owner_epoch INTEGER NOT NULL, generation INTEGER NOT NULL CHECK(generation>0),
 request_limit INTEGER NOT NULL DEFAULT 10000, operation_limit INTEGER NOT NULL DEFAULT 30000,
 reserved_operations INTEGER NOT NULL DEFAULT 0,
 baseline_cursor INTEGER NOT NULL DEFAULT 0, baseline_checked INTEGER NOT NULL DEFAULT 0,
 baseline_receipts INTEGER NOT NULL DEFAULT 0, baseline_chunks INTEGER NOT NULL DEFAULT 0,
 baseline_version INTEGER NOT NULL DEFAULT 0, baseline_verified INTEGER NOT NULL DEFAULT 0,
 issued_at INTEGER NOT NULL, write_expires_at INTEGER NOT NULL,
 receipt_expires_at INTEGER NOT NULL, revoked_at INTEGER,
 CHECK(write_expires_at>issued_at AND receipt_expires_at>=write_expires_at),
 CHECK(request_limit BETWEEN 1 AND 10000 AND operation_limit BETWEEN 1 AND 30000),
 CHECK(reserved_operations BETWEEN 0 AND operation_limit),
 CHECK(baseline_verified IN (0,1) AND baseline_cursor BETWEEN 0 AND baseline_chunks AND baseline_checked BETWEEN 0 AND baseline_receipts)
);
--> statement-breakpoint
CREATE TABLE process_import_native_requests (
 capability_id TEXT NOT NULL, nonce TEXT NOT NULL, request_sha256 TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE, action TEXT NOT NULL,
 generation INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','complete','blocked','unknown')),
 created_at INTEGER NOT NULL, finalized_at INTEGER, reason TEXT,
 PRIMARY KEY(capability_id,nonce)
);
--> statement-breakpoint
CREATE TABLE process_import_native_operations (
 request_id TEXT NOT NULL, ordinal INTEGER NOT NULL, kind TEXT NOT NULL,
 object_key TEXT NOT NULL, expected_bytes INTEGER, expected_sha256 TEXT,
 generation INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('planned','pending','succeeded','failed','unknown')),
 admitted_at INTEGER, finalized_at INTEGER, evidence TEXT,
 PRIMARY KEY(request_id,ordinal)
);
