/**
 * Drizzle schema — see planning/02-data-model.md for the justification of every
 * column. Kept driver-agnostic in shape so a MySQL swap stays a config change.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/** Journal instances. Positive Blizzard journal-instance ids only — Raidbots'
 *  synthetic aggregates carry negative ids and are filtered out at ETL. */
export const instances = sqliteTable(
  'instances',
  {
    /** Blizzard journal-instance id, e.g. 1322. The only id all sources agree on. */
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    /** 'dungeon' | 'raid' */
    type: text('type').notNull(),
    /** Read from data, never hardcoded. */
    expansionId: integer('expansion_id'),
    imageButton: text('image_button'),
    /** Blizzard zone art from /data/wow/media/journal-instance/{id}. Stored as a full
     *  URL because it is not derivable from the id, and only the `-small` variant exists. */
    tileUrl: text('tile_url'),
    orderIndex: integer('order_index'),
    /** Is this in THIS season's M+ pool? Not an expansion filter — the current
     *  rotation spans four expansions. */
    inCurrentRotation: integer('in_current_rotation').notNull().default(0),
  /**
   * This raid belongs to the CURRENT season's tier.
   *
   * `type = 'raid'` alone is far too broad: every raid of the expansion carries it,
   * including the previous tier and the world-boss aggregate. Filtering on it meant
   * recommending Voidspire and Dreamrift drops — previous-tier gear at base item level
   * 197 against the current tier's 219 — as upgrades.
   *
   * Set from Raidbots' "Season N Raids" aggregate, which is the raid-side equivalent of
   * the "mplus-chest" entry the rotation flag already comes from.
   */
  inCurrentTier: integer('in_current_tier').notNull().default(0),
    syncedAt: integer('synced_at').notNull(),
  },
  (t) => [index('idx_instances_rotation').on(t.inCurrentRotation)],
);

/** Bosses. Real instances expose `icon`; the synthetic Raidbots entries expose
 *  `icon_button` instead, and we never ingest those. */
export const encounters = sqliteTable(
  'encounters',
  {
    /** Blizzard journal-encounter id, e.g. 2878. */
    id: integer('id').primaryKey(),
    instanceId: integer('instance_id')
      .notNull()
      .references(() => instances.id),
    name: text('name').notNull(),
    icon: text('icon'),
    orderIndex: integer('order_index'),
  },
  (t) => [index('idx_encounters_instance').on(t.instanceId)],
);

export const items = sqliteTable(
  'items',
  {
    /** Blizzard item id — from journal-encounter items[].item.id, NOT items[].id.
     *  items[].id is the JournalEncounterItem id and poisons every join. */
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    /** Numeric fileDataId from /data/wow/media/item/{id}. Blizzard's CDN addresses
     *  icons as /icons/{size}/{fileDataId}.jpg — the readable `inv_*` slug seen on
     *  Wowhead is NOT exposed by the Game Data API. See lib/domain/icons.ts. */
    iconFileId: integer('icon_file_id'),
    /** String enum: 'RARE' | 'EPIC' | ... — not an integer. */
    quality: text('quality'),
    itemClass: integer('item_class').notNull(),
    itemSubClass: integer('item_sub_class').notNull(),
    /** STRING enum: 'CLOAK' | 'TRINKET' | 'RANGEDRIGHT' | ... — not an integer. */
    inventoryType: text('inventory_type').notNull(),
    /** Our normalised slot; see lib/domain/slots.ts. */
    slot: text('slot').notNull(),
    /** The journal's BASE ilvl. NOT the ilvl a keystone awards — those differ
     *  wildly across the same rotation (219 vs 108). Never display as "you will get". */
    baseItemLevel: integer('base_item_level'),
    binding: text('binding'),
    /** 0 for the mounts, recipes and housing decor that sit in loot tables. */
    isEquippable: integer('is_equippable').notNull().default(1),
    syncedAt: integer('synced_at').notNull(),
  },
  (t) => [index('idx_items_slot').on(t.slot).where(sql`${t.isEquippable} = 1`)],
);

/** One row per stat per item.
 *
 *  `isNegated` is load-bearing and must never be filtered on directly:
 *  a cloak reports INTELLECT, AGILITY[NEG], STRENGTH[NEG] because it is wearable
 *  by everyone. Negation marks an ALTERNATIVE primary, not an absent one.
 *  The set of primaries an item serves is the UNION of all primaries present. */
export const itemStats = sqliteTable(
  'item_stats',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    /** Verbatim from the API: 'INTELLECT', 'HASTE_RATING', 'VERSATILITY', ... */
    statKey: text('stat_key').notNull(),
    amount: integer('amount').notNull(),
    isNegated: integer('is_negated').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.statKey] }),
    index('idx_item_stats_item').on(t.itemId),
  ],
);

/** Where an item drops. No `difficulty` column: a boss drops the same list at every
 *  difficulty and only the awarded ilvl changes, so difficulty is a property of the
 *  run, not the drop. Reward ilvls live in config/season.json, hand-maintained. */
export const itemSources = sqliteTable(
  'item_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    /** 'dungeon' | 'raid' | 'unknown' */
    sourceType: text('source_type').notNull(),
    encounterId: integer('encounter_id').references(() => encounters.id),
    instanceId: integer('instance_id').references(() => instances.id),
    note: text('note'),
  },
  (t) => [
    // An item legitimately drops from more than one boss; this keeps re-syncs idempotent.
    unique('uq_item_sources_item_encounter').on(t.itemId, t.encounterId),
    index('idx_item_sources_encounter').on(t.encounterId),
    index('idx_item_sources_instance').on(t.instanceId),
  ],
);

/** Wowhead RSS. `content:encoded` is deliberately NOT stored — we link out. */
export const news = sqliteTable(
  'news',
  {
    /** <guid isPermaLink="false"> — stable and unique. */
    guid: text('guid').primaryKey(),
    /** 'retail' | 'in-dev' | 'classic' */
    feed: text('feed').notNull(),
    title: text('title').notNull(),
    link: text('link').notNull(),
    category: text('category'),
    imageUrl: text('image_url'),
    publishedAt: integer('published_at').notNull(),
    /** HTML-stripped, truncated. */
    summary: text('summary').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [index('idx_news_published').on(t.feed, t.publishedAt)],
);

/** Raider.IO character lookups, 15-minute TTL. Key is lowercased region:realm:name. */
export const characterCache = sqliteTable('character_cache', {
  cacheKey: text('cache_key').primaryKey(),
  payload: text('payload').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

/** Every ETL script opens a row on entry and closes it on exit, including on failure.
 *  'running' is a real status: it drives the /sync in-flight display and lets a second
 *  invocation detect a crashed run. 'partial' matters because loot sync is
 *  per-instance transactional — 6 of 8 dungeons succeeding is a genuine outcome. */
export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 'instances' | 'loot' | 'news' */
    source: text('source').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    /** 'running' | 'ok' | 'partial' | 'error' */
    status: text('status').notNull(),
    recordCount: integer('record_count'),
    error: text('error'),
  },
  (t) => [index('idx_sync_runs_source').on(t.source, t.startedAt)],
);

/** Great Vault reward item level per Mythic+ key level, from the game's own
 *  MythicPlusSeasonRewardLevels DB2 table via wago.tools.
 *
 *  This replaced a hand-maintained stub in config/season.json. NOTE the column is
 *  the VAULT level: the table's EndOfRunRewardLevel is 0 in every season, so
 *  end-of-run drop ilvls are simply not in this data and must not be implied. */
export const keystoneRewards = sqliteTable('keystone_rewards', {
  /** Mythic+ key level. Rewards plateau above the table's highest entry. */
  keyLevel: integer('key_level').primaryKey(),
  vaultItemLevel: integer('vault_item_level').notNull(),
  seasonId: integer('season_id').notNull(),
  activityTierId: integer('activity_tier_id').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

/** Upgrade track and rank per item bonus id — "Hero 1/6", "Myth 6/6".
 *
 *  Nothing in the Raider.IO or Blizzard payloads states an item's upgrade track: both
 *  give an item level and a bonus list, and the track is derived from the bonuses.
 *  Wowhead does that derivation, so `sync:upgrade-tracks` reads it back from their
 *  tooltips once and stores it here; at request time this is a pure local lookup.
 *
 *  Keyed by bonus id rather than computed from a formula on purpose. The ids do sit in
 *  regular runs of six, but there are SEVERAL such blocks live at once (12793-12806 and
 *  12817-12854 both resolve as of this writing) and the ranges move between patches, so
 *  any arithmetic shortcut would silently mislabel gear. Re-run the sync after a patch. */
export const upgradeTracks = sqliteTable('upgrade_tracks', {
  /** The single bonus id that carries the track. An item's other bonuses are unrelated. */
  bonusId: integer('bonus_id').primaryKey(),
  /** 'Explorer' | 'Adventurer' | 'Veteran' | 'Champion' | 'Hero' | 'Myth', verbatim. */
  track: text('track').notNull(),
  rank: integer('rank').notNull(),
  maxRank: integer('max_rank').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

/** Playable specialisations, synced from Blizzard.
 *
 *  Exists so the character page can resolve a spec to its primary stat from DATA
 *  rather than a hardcoded map. That distinction is not pedantry: Midnight's Devourer
 *  Demon Hunter uses Intellect, so the obvious "Demon Hunter = Agility" map would be
 *  silently wrong and would recommend the wrong half of every loot table. */
export const specs = sqliteTable('specs', {
  /** Blizzard specialization id — the same id Raider.IO returns as loadout_spec_id. */
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  classId: integer('class_id').notNull(),
  className: text('class_name').notNull(),
  /** 'DAMAGE' | 'HEALER' | 'TANK' */
  role: text('role'),
  /** 'STRENGTH' | 'AGILITY' | 'INTELLECT' — verbatim from primary_stat_type.type. */
  primaryStat: text('primary_stat'),
  syncedAt: integer('synced_at').notNull(),
});
