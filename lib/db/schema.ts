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

/** Characters pinned on the lookup page.
 *
 *  ilvl / score / art are snapshotted at save time so the list renders instantly with
 *  no upstream calls. They are a label, not a source of truth — clicking a saved
 *  character does a full lookup and refreshes them. */
export const savedCharacters = sqliteTable(
  'saved_characters',
  {
    /** Same lowercased region:realm:name key used by character_cache. */
    cacheKey: text('cache_key').primaryKey(),
    region: text('region').notNull(),
    realm: text('realm').notNull(),
    name: text('name').notNull(),
    className: text('class_name'),
    specName: text('spec_name'),
    faction: text('faction'),
    thumbnail: text('thumbnail'),
    itemLevel: integer('item_level'),
    mplusScore: integer('mplus_score'),
    savedAt: integer('saved_at').notNull(),
    refreshedAt: integer('refreshed_at'),
  },
  (t) => [index('idx_saved_characters_saved').on(t.savedAt)],
);
