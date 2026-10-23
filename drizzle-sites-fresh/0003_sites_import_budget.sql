CREATE TABLE `process_import_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "attempt_state" CHECK("process_import_attempts"."state" IN ('running','complete','stopped'))
);
--> statement-breakpoint
CREATE TABLE `process_import_budget` (
	`id` integer PRIMARY KEY NOT NULL,
	`policy_sha` text NOT NULL,
	`policy` text NOT NULL,
	`state` text NOT NULL,
	`active_request` text,
	`reason` text,
	`write_bytes` integer DEFAULT 0 NOT NULL,
	`write_calls` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`db_bytes` integer DEFAULT 0 NOT NULL,
	`db_statements` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_singleton" CHECK("process_import_budget"."id"=1),
	CONSTRAINT "budget_state" CHECK("process_import_budget"."state" IN ('open','stopped','complete')),
	CONSTRAINT "budget_write_bytes" CHECK("process_import_budget"."write_bytes">=0),
	CONSTRAINT "budget_write_calls" CHECK("process_import_budget"."write_calls">=0),
	CONSTRAINT "budget_requests" CHECK("process_import_budget"."requests">=0),
	CONSTRAINT "budget_db_bytes" CHECK("process_import_budget"."db_bytes">=0),
	CONSTRAINT "budget_db_statements" CHECK("process_import_budget"."db_statements">=0)
);
