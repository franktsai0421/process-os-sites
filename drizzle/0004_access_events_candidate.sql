CREATE TABLE `access_event_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`digest` text NOT NULL,
	`generated_at` text NOT NULL,
	`modules` text NOT NULL,
	`ids` text NOT NULL,
	`count` integer NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_event_exports_actor_operation` ON `access_event_exports` (`actor_id`,`operation_id`);--> statement-breakpoint
CREATE TABLE `access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`module` text NOT NULL,
	`operation_id` text NOT NULL,
	`action` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`outcome` text NOT NULL,
	`verified_at` text,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`notes` text NOT NULL,
	`history` text NOT NULL,
	`update_receipts` text NOT NULL,
	CONSTRAINT "access_events_outcome" CHECK("access_events"."outcome" IN ('unknown','receipt-confirmed')),
	CONSTRAINT "access_events_status" CHECK("access_events"."status" IN ('open','handled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_events_actor_module_operation` ON `access_events` (`actor_id`,`module`,`operation_id`);--> statement-breakpoint
CREATE INDEX `access_events_status_cursor` ON `access_events` (`status`,`id`);