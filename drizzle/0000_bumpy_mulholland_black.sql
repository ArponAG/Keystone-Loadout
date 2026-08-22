CREATE TABLE `character_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `encounters` (
	`id` integer PRIMARY KEY NOT NULL,
	`instance_id` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`order_index` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_encounters_instance` ON `encounters` (`instance_id`);--> statement-breakpoint
CREATE TABLE `instances` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`expansion_id` integer,
	`image_button` text,
	`order_index` integer,
	`in_current_rotation` integer DEFAULT 0 NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_instances_rotation` ON `instances` (`in_current_rotation`);--> statement-breakpoint
CREATE TABLE `item_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`encounter_id` integer,
	`instance_id` integer,
	`note` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_item_sources_encounter` ON `item_sources` (`encounter_id`);--> statement-breakpoint
CREATE INDEX `idx_item_sources_instance` ON `item_sources` (`instance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_item_sources_item_encounter` ON `item_sources` (`item_id`,`encounter_id`);--> statement-breakpoint
CREATE TABLE `item_stats` (
	`item_id` integer NOT NULL,
	`stat_key` text NOT NULL,
	`amount` integer NOT NULL,
	`is_negated` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`item_id`, `stat_key`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_item_stats_item` ON `item_stats` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`quality` text,
	`item_class` integer NOT NULL,
	`item_sub_class` integer NOT NULL,
	`inventory_type` text NOT NULL,
	`slot` text NOT NULL,
	`base_item_level` integer,
	`binding` text,
	`is_equippable` integer DEFAULT 1 NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_items_slot` ON `items` (`slot`) WHERE "items"."is_equippable" = 1;--> statement-breakpoint
CREATE TABLE `news` (
	`guid` text PRIMARY KEY NOT NULL,
	`feed` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`category` text,
	`image_url` text,
	`published_at` integer NOT NULL,
	`summary` text NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_news_published` ON `news` (`feed`,`published_at`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`record_count` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_sync_runs_source` ON `sync_runs` (`source`,`started_at`);