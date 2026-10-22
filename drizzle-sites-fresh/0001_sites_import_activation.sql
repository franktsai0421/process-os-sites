CREATE TABLE `process_snapshot_activations` (
	`transfer_id` text PRIMARY KEY NOT NULL,
	`phase` text NOT NULL,
	`version` integer NOT NULL,
	`audit_cursor` integer NOT NULL,
	`copy_cursor` integer NOT NULL,
	`db_cursor` integer NOT NULL,
	`bootstrap_sha` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `process_snapshot_resource_audits` (
	`transfer_id` text NOT NULL,
	`resource` text NOT NULL,
	`ordinal` integer NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`refs` text NOT NULL,
	`copy_state` text,
	`copy_version` integer NOT NULL,
	PRIMARY KEY(`transfer_id`, `resource`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snapshot_resource_ordinal` ON `process_snapshot_resource_audits` (`transfer_id`,`ordinal`);