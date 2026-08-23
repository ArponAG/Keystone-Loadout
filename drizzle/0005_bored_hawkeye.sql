CREATE TABLE `upgrade_tracks` (
	`bonus_id` integer PRIMARY KEY NOT NULL,
	`track` text NOT NULL,
	`rank` integer NOT NULL,
	`max_rank` integer NOT NULL,
	`synced_at` integer NOT NULL
);
