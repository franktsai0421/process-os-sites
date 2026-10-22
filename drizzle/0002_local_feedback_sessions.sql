CREATE TABLE `web_feedback_store` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `revision` integer NOT NULL,
  `payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `process_revoked_sessions` (
  `token_digest` text PRIMARY KEY NOT NULL CHECK (length(`token_digest`) = 64),
  `expires_at` integer NOT NULL,
  `revoked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `process_revoked_sessions_expiry` ON `process_revoked_sessions` (`expires_at`);
--> statement-breakpoint
INSERT INTO `web_feedback_store` (`id`, `revision`, `payload`)
VALUES (1, 0, '{"issues":[],"attachments":[],"batches":[],"handoffs":[]}');
