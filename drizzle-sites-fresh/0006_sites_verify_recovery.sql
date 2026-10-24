-- Independent restricted namespace: old staging code cannot authenticate it.
-- Schema only. No grant, credential, recovery state, business row or payload.
CREATE TABLE process_import_verify_capabilities (
 id TEXT PRIMARY KEY NOT NULL, credential_sha256 TEXT NOT NULL,
 pins TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope='incident-verify-audit-only-v1'),
 owner_epoch INTEGER NOT NULL CHECK(owner_epoch=0), generation INTEGER NOT NULL CHECK(generation>0),
 request_limit INTEGER NOT NULL CHECK(request_limit=1000),
 operation_limit INTEGER NOT NULL CHECK(operation_limit=20000),
 reserved_operations INTEGER NOT NULL DEFAULT 0 CHECK(reserved_operations BETWEEN 0 AND operation_limit),
 baseline_cursor INTEGER NOT NULL DEFAULT 0 CHECK(baseline_cursor=0),
 baseline_checked INTEGER NOT NULL DEFAULT 0 CHECK(baseline_checked=0),
 baseline_receipts INTEGER NOT NULL CHECK(baseline_receipts=1401),
 baseline_chunks INTEGER NOT NULL CHECK(baseline_chunks=1401),
 baseline_version INTEGER NOT NULL CHECK(baseline_version=19),
 baseline_verified INTEGER NOT NULL DEFAULT 0 CHECK(baseline_verified=0),
 hold_plan_sha TEXT NOT NULL, resume_plan_sha TEXT NOT NULL, program_commit TEXT NOT NULL,
 issued_at INTEGER NOT NULL, write_expires_at INTEGER NOT NULL, receipt_expires_at INTEGER NOT NULL, revoked_at INTEGER,
 CHECK(write_expires_at=issued_at+14400000 AND receipt_expires_at=issued_at+18000000)
);
--> statement-breakpoint
CREATE TABLE process_import_verify_maintenance (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id=1), capability_id TEXT NOT NULL UNIQUE,
 credential_sha256 TEXT NOT NULL, config_sha TEXT NOT NULL,
 issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, receipt_expires_at INTEGER NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('registered','held','maintenance','resumed')),
 active_nonce TEXT, receipts TEXT NOT NULL DEFAULT '[]',
 admitted INTEGER NOT NULL DEFAULT 0 CHECK(admitted BETWEEN 0 AND 3),
 hold_plan TEXT, resume_plan TEXT, held_at INTEGER,
 CHECK(expires_at=issued_at+600000 AND receipt_expires_at=issued_at+18000000)
);
