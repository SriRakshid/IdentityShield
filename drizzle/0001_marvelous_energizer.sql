CREATE TABLE `access_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_key` text NOT NULL,
	`decision_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_name` text NOT NULL,
	`role_id` text NOT NULL,
	`role_name` text NOT NULL,
	`permission` text NOT NULL,
	`decision` text NOT NULL,
	`rationale` text NOT NULL,
	`control` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_decisions_decision_key_unique` ON `access_decisions` (`decision_key`);