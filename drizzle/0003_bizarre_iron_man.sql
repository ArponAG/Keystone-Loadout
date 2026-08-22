CREATE TABLE `specs` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`class_id` integer NOT NULL,
	`class_name` text NOT NULL,
	`role` text,
	`primary_stat` text,
	`synced_at` integer NOT NULL
);
