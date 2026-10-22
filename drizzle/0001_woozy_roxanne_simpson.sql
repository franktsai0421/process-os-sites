CREATE TABLE `state_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`values` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
