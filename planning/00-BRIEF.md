# WoW Gear Finder — Project Brief

> **Preserved as originally written (2026-08-22), before the Session 1 probe.**
> Several assumptions below were disproved by `scripts/probe.ts`.
> **Read `08-brief-corrections.md` alongside this file.** Where the two disagree,
> the corrections doc and `01`–`07` are authoritative. This is kept for provenance.

---

## 1. What this is

A personal WoW Retail companion app with four surfaces:

| # | Surface | Purpose |
|---|---|---|
| 1 | **Build Gear Finder** | Pick armor type + primary stat + a ranked order of the 4 secondaries → get ranked gear per slot with source |
| 2 | **Dungeon Loot Directory** | Current season's dungeon rotation → boss → full loot table with stats/slot/type |
| 3 | **Live Character Lookup** | Raider.IO character profile: gear, M+ score, raid progress |
| 4 | **News Feed** | Wowhead RSS (retail / in-dev), cached server-side |

Non-goals for v1: simulation, tier-set/catalyst logic, PvP gear, crafted gear, drop
rates, auction pricing, multi-character comparison.

## 2. Stack decision (locked)

- **Next.js 15, App Router, TypeScript**
- **Tailwind CSS** — design tokens extracted from `reference/existing.html`, not invented
- **Drizzle ORM + SQLite** via `better-sqlite3`, DB file at `data/app.db`
- **No client-side calls to any third-party API.** Everything goes through Route Handlers.
- ETL is a set of standalone scripts run via `npm run sync:*`, not API routes.

Rationale: read-mostly app over a slowly-changing dataset. "Nightly ETL into a local DB,
serve from the DB." Every runtime request should hit SQLite only.

## 3. Data sources

### 3.1 Blizzard Game Data API

Register at `https://develop.battle.net` → create a client → Client ID + Secret.

```
POST https://oauth.battle.net/token
Authorization: Basic base64(client_id:client_secret)
Body: grant_type=client_credentials
→ { access_token, token_type: "bearer", expires_in: ~86399 }

GET https://us.api.blizzard.com/data/wow/<path>?namespace=<ns>&locale=en_US
Authorization: Bearer <token>
```

Namespaces: `static-us`, `dynamic-us`, `profile-us`.

| Path | Namespace | Gives |
|---|---|---|
| `/data/wow/journal-expansion/index` | static | expansion list |
| `/data/wow/journal-instance/{id}` | static | dungeon/raid + encounter list |
| `/data/wow/journal-encounter/{id}` | static | boss detail — **expected `items[]`; VERIFY** |
| `/data/wow/item/{id}` | static | `preview_item.stats[]`, `inventory_type`, `item_class`, `level`, `binding` |
| `/data/wow/media/item/{id}` | static | icon URL |

Rate limits: 100 req/s, 36,000 req/hr.

**Fallback if `journal-encounter` has no `items[]`:** wago.tools DB2 CSVs —
`https://wago.tools/db2/JournalEncounterItem/csv`.
→ *Probe result: not needed. `items[]` exists.*

### 3.2 Raidbots static data (no auth)

Base URL: `https://www.raidbots.com/static/data/live/<file>`

| File | Size | Contents |
|---|---|---|
| `equippable-items.json` | 53 MB | no stats |
| `item-names.json` | 65 MB | localized names |
| `instances.json` | 48 KB | instance + encounter tree |
| `bonuses.json` | 1.8 MB | bonus ID → effect |
| `enchantments.json` | 272 KB | |
| `gems.json` | 326 KB | |
| `talents.json` | 3.2 MB | |

Etiquette: `Accept-Encoding: gzip`, **max 1 request per 10 seconds**, backlink in footer.

Use `instances.json` as the instance/encounter spine. Use Blizzard for per-item stats.
Do not download the 53 MB file.

### 3.3 Raider.IO (no key, free tier)

```
GET https://raider.io/api/v1/characters/profile
  ?region=us&realm=<slug>&name=<name>
  &fields=gear,mythic_plus_scores_by_season:current,raid_progression,mythic_plus_best_runs:all

GET https://raider.io/api/v1/mythic-plus/static-data?expansion_id=<n>
→ current season's dungeon list + affix rotation
```

Rate limit ~300 req/min. Cache character lookups 15 min on region+realm+name.

### 3.4 Wowhead news RSS

```
https://www.wowhead.com/news/rss/retail
https://www.wowhead.com/news/rss/in-dev
https://www.wowhead.com/news/rss/classic
```

Server-side only. Poll no more than once per 15 min, store by `guid`, dedupe on insert.
Parse with `fast-xml-parser`. Strip HTML. Do not reproduce full article bodies.

## 4. Domain reference

### 4.1 `inventoryType` values
```
1 Head        2 Neck         3 Shoulder    4 Shirt      5 Chest
6 Waist       7 Legs         8 Feet        9 Wrist     10 Hands
11 Finger    12 Trinket     13 One-Hand   14 Shield   15 Ranged
16 Back      17 Two-Hand    19 Tabard     20 Chest(robe)
21 Main Hand 22 Off Hand    23 Held in Off-hand   26 Ranged
```
Treat 5 and 20 as the same slot. Slots 4 and 19 are cosmetic — exclude.

### 4.2 `itemClass` / `itemSubClass`
```
itemClass 2 = Weapon
itemClass 4 = Armor
  subClass 0 = Misc   (necks, rings, trinkets)
  subClass 1 = Cloth  (also cloaks!)
  subClass 2 = Leather
  subClass 3 = Mail
  subClass 4 = Plate
  subClass 6 = Shield
```

**Critical filter rule:** armor-type filtering applies **only** to inventoryType
1, 3, 5, 6, 7, 8, 9, 10, 20. Cloaks (16) are subClass 1 but wearable by everyone.
Necks/rings/trinkets (2, 11, 12) are subClass 0 and armor-type agnostic.

### 4.3 Stat identifiers
```
STRENGTH, AGILITY, INTELLECT, STAMINA
CRIT_RATING, HASTE_RATING, MASTERY_RATING, VERSATILITY
AGI_STR_INT / AGI_STR / AGI_INT / STR_INT   (combined-primary items)
```
Build a `STAT_MAP` constant from what the probe returns.

## 5. The ranking algorithm

```ts
type Build = {
  armorType: 'cloth' | 'leather' | 'mail' | 'plate';
  primary: 'intellect' | 'agility' | 'strength';
  secondaryOrder: ['haste'|'crit'|'mastery'|'vers', ...x4];
};

const RANK_WEIGHTS = [1.0, 0.7, 0.45, 0.25]; // #1 → #4
```

```
secondaryTotal = Σ(all secondary stat values on the item)
if secondaryTotal === 0 → flag NO_SECONDARIES, score = 0, still list it
fitScore = Σ(statValue_i × RANK_WEIGHTS[rankOf(stat_i)]) / secondaryTotal
```

`fitScore ∈ [0.25, 1.0]`. Display as `Math.round(fitScore * 100)`.

**Why no item-level math:** all items from a given dungeon at a given difficulty share
the same item level, so the stat budget is constant within a tier. **Rank within
(slot × difficulty tier), never across tiers.**

### Honesty requirements (non-negotiable)
- Label the feature "Stat-fit ranking — not a simulation."
- Trinkets: warn that value is dominated by on-use/proc effects. Sort last by default.
- Weapons: weapon DPS usually outweighs secondary distribution. Same warning.
- Link every item to `https://www.wowhead.com/item={id}` + a Raidbots sim link.

## 6. Schema (original)

```
instances(id PK, name, type, type_id, expansion_id, image_button, order_index,
          is_current_season INT, synced_at)
encounters(id PK, instance_id FK, name, icon_button, order_index)
items(id PK, name, icon, quality INT, item_class INT, item_sub_class INT,
      inventory_type INT, base_item_level INT, binding, synced_at)
item_stats(item_id FK, stat_key TEXT, amount INT, is_negated INT,
           PRIMARY KEY(item_id, stat_key))
item_sources(id PK, item_id FK, source_type TEXT, encounter_id FK NULL,
             instance_id FK NULL, difficulty TEXT NULL, note TEXT)
news(guid PK, feed TEXT, title, link, published_at INT, summary, fetched_at INT)
character_cache(cache_key PK, payload TEXT, fetched_at INT)
sync_runs(id PK, source TEXT, started_at INT, finished_at INT,
          status TEXT, record_count INT, error TEXT)
```

Every ETL script writes a `sync_runs` row. A `/sync` admin page reads that table.

## 7. Existing HTML

`reference/existing.html` is the design reference. Extract, do not replace.
→ *Superseded: the file was never added; building from scratch. See `06`.*

## 8. Build order

| Step | Deliverable |
|---|---|
| 0 | Planning folder + probe script |
| 1 | Next.js scaffold, Tailwind tokens, Drizzle + SQLite schema, migrations |
| 2 | Blizzard auth client + rate-limited fetch wrapper + token disk cache |
| 3 | `sync:instances` |
| 4 | `sync:loot` |
| 5 | Dungeon Loot Directory UI |
| 6 | Scoring module + unit tests |
| 7 | Build Gear Finder UI |
| 8 | `sync:news` + news feed UI |
| 9 | Raider.IO character lookup route + UI + 15-min cache |
| 10 | `/sync` admin page, error states, empty states, README |

Git tag after each step.

## 9. Constraints and gotchas

- **Never** call Blizzard, Raidbots, Raider.IO, or Wowhead from a React component.
- Blizzard secret in `.env.local`, never `NEXT_PUBLIC_`. Gitignore `.env*`, `data/*.db`.
- Raidbots: 1 req / 10 s, gzip on, backlink in footer.
- Write `scripts/verify-assumptions.ts`; run before every sync.
- Footer attribution: "World of Warcraft® and Blizzard Entertainment® are trademarks of
  Blizzard Entertainment, Inc." plus links to Raidbots, Raider.IO, Wowhead.
- Current retail content is the **Midnight** expansion. Don't hardcode expansion IDs.
- Non-commercial personal use.
