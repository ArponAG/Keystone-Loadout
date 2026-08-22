# 02 — Data model

> Every column below is justified by something the probe actually returned.
> Drizzle + SQLite. Types kept driver-agnostic.

## 0. What the probe changed

The brief's schema assumed integer `inventory_type` and a `difficulty` column on
`item_sources`. Both are wrong:

- `inventory_type` comes back as a **string enum** (`CLOAK`, `TRINKET`, `RANGEDRIGHT`…),
  not an integer. Stored as TEXT.
- A dungeon boss drops the **same item list at every difficulty**; only the awarded
  ilvl differs. So difficulty is not a property of a drop — it is a property of the
  *run*. `difficulty` moves out of `item_sources` and into a hand-maintained ilvl
  table in `config/season.json`.

## 1. Tables

### `instances`
```ts
id            integer PK      // Blizzard journal-instance id (1322). Positive only.
name          text  notnull
type          text  notnull   // 'dungeon' | 'raid'  (from Raidbots `type`)
expansion_id  integer         // read from data, never hardcoded
image_button  text            // Raidbots art slug
order_index   integer
in_current_rotation integer   // 0/1 — is this in THIS season's M+ pool
synced_at     integer notnull // epoch ms
```
- `id` is the journal-instance id because that is the only id Blizzard, Raidbots and
  our loot ETL all agree on. Raider.IO's `rio_id`/`challenge_mode_id` are a *different
  numbering* and are deliberately not stored as the key (see `03-etl.md` §2).
- `in_current_rotation` rather than `is_current_season`: the probe showed the season
  pool contains dungeons from **four** expansions (Kings' Rest, Ruby Life Pools,
  Temple of Sethraliss are not Midnight). "Current season" is not an expansion filter.

### `encounters`
```ts
id            integer PK      // journal-encounter id (2878)
instance_id   integer notnull references instances.id
name          text  notnull
icon          text
order_index   integer
```
- Real instance entries expose `icon` + `order` + `difficulty_mask`; the synthetic
  Raidbots aggregates expose `icon_button` instead. We only ingest real instances,
  so `icon` is the correct field name.

### `items`
```ts
id               integer PK   // Blizzard item id — from entry.item.id, NOT entry.id
name             text notnull
icon             text         // from /data/wow/media/item/{id}
quality          text         // 'RARE' | 'EPIC' — string enum, not int
item_class       integer notnull
item_sub_class   integer notnull
inventory_type   text notnull // STRING: 'CLOAK','TRINKET','RANGEDRIGHT',...
slot             text notnull // our normalised slot; see §2
base_item_level  integer      // journal base ilvl — NOT the ilvl you will receive
binding          text
is_equippable    integer notnull // 0 for NON_EQUIP junk
synced_at        integer notnull
```
- **`id` gotcha, load-bearing:** `journal-encounter.items[].id` is the
  *JournalEncounterItem* id (47171). The item id is `items[].item.id` (273796).
  Writing the wrong one poisons every join.
- `quality` is a string enum in the API (`"RARE"`), so TEXT.
- `is_equippable` exists because loot tables contain **mounts, recipes and housing
  decor** (`item_class` 15, 9, 20 with `inventory_type: NON_EQUIP`). We store them
  so the loot directory can show a complete boss drop list, and flag them so the
  gear finder never scores them.
- `base_item_level` is named to resist misuse. The probe found Altar of Fangs items
  at ilvl 219 and Blinding Vale items at ilvl 108 — both in the same M+ rotation.
  This number is the journal's base, not the ilvl a keystone awards.

### `item_stats`
```ts
item_id     integer notnull references items.id
stat_key    text    notnull   // 'INTELLECT','HASTE_RATING',... verbatim from API
amount      integer notnull
is_negated  integer notnull   // 0/1 — CRITICAL, see below
PRIMARY KEY (item_id, stat_key)
```
- `is_negated` is not cosmetic and must not be dropped. The probe proved its meaning:

  | item | stats |
  |---|---|
  | Cloth waist | `INTELLECT=5` |
  | Mail shoulder | `INTELLECT=5, AGILITY=5[NEG]` |
  | Plate legs | `INTELLECT=7, STRENGTH=7[NEG]` |
  | **Cloak** | `INTELLECT=4, AGILITY=4[NEG], STRENGTH=4[NEG]` |

  The cloak — wearable by every class — lists **all three** primaries with two negated.
  Therefore `is_negated` does not mean "this item does not have this stat". It means
  "this is one of the primaries this item can serve, but not the default one".

  **Rule:** the set of primaries an item can serve is the *union* of all primary stats
  present, negated or not. Filtering on `is_negated = 0` would hide every plate item
  from a Strength user, which is exactly backwards.

- Composite PK on `(item_id, stat_key)` is safe: no probe item listed the same stat twice.

### `item_sources`
```ts
id            integer PK autoincrement
item_id       integer notnull references items.id
source_type   text    notnull  // 'dungeon' | 'raid' | 'unknown'
encounter_id  integer references encounters.id
instance_id   integer references instances.id
note          text
UNIQUE (item_id, encounter_id)
```
- `difficulty` **removed** — see §0. Loot lists are difficulty-invariant.
- An item legitimately drops from more than one boss (the probe saw
  "Yoke of the Charging Bear" twice in one instance), hence a separate table and a
  UNIQUE guard so re-syncs are idempotent.

### `news`
```ts
guid         text PK        // <guid isPermaLink="false"> — stable, use as PK
feed         text notnull   // 'retail' | 'in-dev' | 'classic'
title        text notnull
link         text notnull
category     text           // feed exposes <category>, e.g. 'Live'
image_url    text           // from <media:content url="...">
published_at integer notnull
summary      text notnull   // HTML-stripped, truncated
fetched_at   integer notnull
```
- `content:encoded` exists in the feed and is deliberately **not** stored. We store a
  stripped summary and link out; reproducing article bodies is not ours to do.

### `character_cache`
```ts
cache_key  text PK        // 'us:moon-guard:bjornzerker' — lowercased
payload    text notnull   // raw JSON response
fetched_at integer notnull
```

### `sync_runs`
```ts
id           integer PK autoincrement
source       text notnull    // 'instances' | 'loot' | 'news'
started_at   integer notnull
finished_at  integer
status       text notnull    // 'running' | 'ok' | 'error' | 'partial'
record_count integer
error        text
```
- `'running'` is a real status, not a placeholder: it is how `/sync` shows an
  in-flight sync and how a second invocation detects that one is already going.
- `'partial'` matters because loot sync is per-instance transactional — 6 of 8
  dungeons succeeding is a genuine outcome, not a binary.

## 2. Derived: the `slot` normalisation

The API's `inventory_type` strings are not a clean slot list. `lib/domain/slots.ts`
maps them:

| `inventory_type` | `slot` |
|---|---|
| `HEAD` | head |
| `NECK` | neck |
| `SHOULDER` | shoulder |
| `CLOAK` | back |
| `CHEST`, `ROBE` | chest |
| `WAIST` | waist |
| `LEGS` | legs |
| `FEET` | feet |
| `WRIST` | wrist |
| `HAND` | hands |
| `FINGER` | finger |
| `TRINKET` | trinket |
| `WEAPON` | one-hand |
| `TWOHWEAPON` | two-hand |
| `SHIELD`, `HOLDABLE` | off-hand |
| `RANGEDRIGHT`, `RANGED` | ranged |
| `NON_EQUIP` | *(excluded)* |

- `CHEST` and `ROBE` collapse to one slot — the brief was right about this, though it
  described them as integers 5 and 20.
- `RANGEDRIGHT` was **not in the brief at all**; the probe found it on bows and wands.
- `HAND` is singular in the API, not `HANDS`.

## 3. Derived: armor-type filter applicability

Armor-class filtering applies **only** to these slots:

```
head, shoulder, chest, waist, legs, feet, wrist, hands
```

Everything else — `neck`, `finger`, `trinket`, `back`, all weapons, `off-hand` —
is armor-type agnostic.

The probe confirms the brief's warning with hard evidence: **the cloak
"Bloodthorn Burnous" is `item_class=4, item_sub_class=1` (Cloth)**. A naive
"plate user sees only subclass 4" filter would delete every cloak in the game from a
Warrior's results. `slots.ts` gates the filter on slot, never on subclass alone.

Note also that `neck`, `finger` and many trinkets carry **no primary stat at all**
(`Yoke of the Charging Bear: STAMINA=6, CRIT=7, HASTE=13`). These are pure-secondary
items — the cleanest possible input to stat-fit scoring — and must never be filtered
out for "not matching your primary".

## 4. Indexes

```sql
CREATE INDEX idx_item_sources_encounter ON item_sources(encounter_id);
CREATE INDEX idx_item_sources_instance  ON item_sources(instance_id);
CREATE INDEX idx_items_slot             ON items(slot) WHERE is_equippable = 1;
CREATE INDEX idx_item_stats_item        ON item_stats(item_id);
CREATE INDEX idx_news_published         ON news(feed, published_at DESC);
CREATE INDEX idx_instances_rotation     ON instances(in_current_rotation);
```

The gear finder's hot query is "all equippable items in slot X across current-rotation
instances, with their stats" — covered by `idx_items_slot` + `idx_item_stats_item`.
At ~400 items this is instant regardless, but the indexes cost nothing.
