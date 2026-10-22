CREATE TABLE `process_snapshot_chunks` (
	`transfer_id` text NOT NULL,
	`chunk_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	PRIMARY KEY(`transfer_id`, `chunk_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshot_chunk_sequence` ON `process_snapshot_chunks` (`transfer_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `process_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`bucket_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `process_revoked_sessions` (
	`token_digest` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer NOT NULL,
	CONSTRAINT "session_digest_length" CHECK(length("process_revoked_sessions"."token_digest")=64)
);
--> statement-breakpoint
CREATE INDEX `process_revoked_sessions_expiry` ON `process_revoked_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `shared_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`values` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `state_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`values` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `process_snapshot_target` (
	`id` integer PRIMARY KEY NOT NULL,
	`target` text NOT NULL,
	`transfer_id` text NOT NULL,
	CONSTRAINT "import_target_singleton" CHECK("process_snapshot_target"."id"=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `process_snapshot_target_transfer_id_unique` ON `process_snapshot_target` (`transfer_id`);--> statement-breakpoint
CREATE TABLE `process_snapshot_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`manifest_sha` text NOT NULL,
	`manifest_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`phase` text NOT NULL,
	`version` integer NOT NULL,
	`verify_cursor` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`total_bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "import_phase" CHECK("process_snapshot_transfers"."phase" IN ('receiving','integrity-verified'))
);
--> statement-breakpoint
CREATE TABLE `web_feedback_store` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	CONSTRAINT "feedback_singleton" CHECK("web_feedback_store"."id"=1)
);
