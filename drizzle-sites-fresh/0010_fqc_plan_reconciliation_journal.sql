CREATE TABLE `fqc_plan_reconciliation_journal` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`grant_hash` text NOT NULL,
	`nonce` text NOT NULL,
	CONSTRAINT "fqc_plan_reconciliation_singleton" CHECK("fqc_plan_reconciliation_journal"."singleton"=1)
);
