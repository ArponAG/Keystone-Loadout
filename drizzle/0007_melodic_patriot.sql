CREATE TABLE `ip_geo` (
	`ip` text PRIMARY KEY NOT NULL,
	`country_code` text,
	`country_name` text,
	`city` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visitor_id` text NOT NULL,
	`path` text NOT NULL,
	`ip` text,
	`device` text,
	`screen` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_page_views_visitor` ON `page_views` (`visitor_id`,`at`);--> statement-breakpoint
CREATE INDEX `idx_page_views_at` ON `page_views` (`at`);