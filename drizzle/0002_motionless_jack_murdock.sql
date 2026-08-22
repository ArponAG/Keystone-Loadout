CREATE TABLE `keystone_rewards` (
	`key_level` integer PRIMARY KEY NOT NULL,
	`vault_item_level` integer NOT NULL,
	`season_id` integer NOT NULL,
	`activity_tier_id` integer NOT NULL,
	`synced_at` integer NOT NULL
);
