CREATE TABLE `shared_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`values` text NOT NULL,
	`updated_at` text NOT NULL
);
