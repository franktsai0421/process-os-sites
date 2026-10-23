CREATE TABLE `process_import_retirements` (
 `transfer_id` text PRIMARY KEY NOT NULL,
 `project_id` text NOT NULL,
 `target` text NOT NULL,
 `manifest_sha` text NOT NULL,
 `policy_sha` text NOT NULL,
 `next_manifest_sha` text NOT NULL,
 `next_policy_sha` text NOT NULL,
 `archive` text NOT NULL,
 `state` text NOT NULL,
 `created_at` integer NOT NULL,
 CONSTRAINT "retirement_state" CHECK("process_import_retirements"."state" IN ('fenced','retired'))
);
