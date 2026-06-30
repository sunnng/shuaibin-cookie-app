CREATE TABLE `simulators` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text DEFAULT 'adb' NOT NULL,
	`adb_id` text NOT NULL,
	`adb_port` integer,
	`android_id` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`resolution` text,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `simulators_android_id_unique` ON `simulators` (`android_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`simulator_id` text NOT NULL,
	`script_name` text NOT NULL,
	`script_package` text NOT NULL,
	`script_version` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`current_message` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`simulator_id`) REFERENCES `simulators`(`id`) ON UPDATE no action ON DELETE cascade
);
