CREATE TABLE `saved_characters` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`region` text NOT NULL,
	`realm` text NOT NULL,
	`name` text NOT NULL,
	`class_name` text,
	`spec_name` text,
	`faction` text,
	`thumbnail` text,
	`item_level` integer,
	`mplus_score` integer,
	`saved_at` integer NOT NULL,
	`refreshed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_saved_characters_saved` ON `saved_characters` (`saved_at`);