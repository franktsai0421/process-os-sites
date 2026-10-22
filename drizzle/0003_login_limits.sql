CREATE TABLE `process_login_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `bucket_start` integer NOT NULL,
  `attempts` integer NOT NULL
);
