CREATE TABLE `process_owner_bootstrap` (
	`id` integer PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target` text NOT NULL,
	`manifest_sha` text NOT NULL,
	`program_commit` text NOT NULL,
	`owner_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "owner_bootstrap_singleton" CHECK("process_owner_bootstrap"."id"=1)
);
