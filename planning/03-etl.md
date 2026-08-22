# 03 — ETL

Four scripts. None is reachable over HTTP. Each opens a `sync_runs` row on entry and
closes it on exit, including on failure.

```
npm run sync:instances   # Raidbots + Raider.IO -> instances, encounters
npm run sync:loot        # Blizzard -> items, item_stats, item_sources
npm run sync:news        # Wowhead RSS -> news
npm run sync:all         # instances -> loot -> news, sequentially
```

`sync:loot` depends on `sync:instances` having run. `sync:all` enforces the order.

`sync:loot` also accepts `-- --dungeons` to sync only the rotation dungeons, skipping
current-tier raids. Useful when iterating: ~4 minutes instead of ~8.

**Starting a sync from `/sync`.** Every script goes through `withSyncRun`, which:

- refuses to start when a `running` row already exists for that source — the lock is in
  shared state, so it covers the terminal and the browser equally;
- accepts `--run-id=N` and **adopts** that existing `sync_runs` row instead of opening
  its own. `/sync` creates the row in its Server Action before spawning, so the status
  is visible immediately and a double-click cannot start two runs.

Scripts remain unreachable over HTTP; only an explicit Server Action can spawn one.
See `05-ui.md` §7.

---

## 1. `sync:instances`

**Inputs**
- `https://www.raidbots.com/static/data/live/instances.json` (48 KB, 1 request)
- `https://raider.io/api/v1/mythic-plus/static-data?expansion_id={n}` (1 request)

**Outputs** — `instances`, `encounters`

**Procedure**

1. Fetch Raidbots `instances.json`. It returns 39 entries, and **most are not real
   instances.** The probe found these `type` values:
   ```
   dungeon  raid  expansion-dungeon  mplus-chest  catalyst  bonus-roll
   pvp-honor  pvp-world  pvp-conquest  delve-mid1  delve-mid2
   prey-mid1  prey-mid2  professionMidnightPvp/Rare/Epic
   ```
   Keep only `type === 'dungeon'` or `type === 'raid'` **and `id > 0`**. Negative ids
   are Raidbots' synthetic droptimizer categories, not journal instances.

2. Extract the current M+ rotation. Two independent sources, and the probe confirmed
   they agree exactly:
   - Raidbots: the `type === 'mplus-chest'` entry (id `-1`). Its `encounters[]` are
     **dungeons, not bosses** — 8 entries carrying journal-instance ids.
   - Raider.IO: `seasons[]`, pick where `is_main_season && starts.us <= now < ends.us`.
     At probe time that is `season-mn-2` (started 2026-08-18), rotation of 8.

   Use **Raidbots for the ids** (it speaks journal-instance ids), Raider.IO for the
   season metadata (slug, start/end, affix, keystone timers, art).

   > **Why not Raider.IO ids:** its `rio_id` (16865) and `challenge_mode_id` (588) are
   > separate numbering systems from Blizzard's journal-instance id (1322). There is no
   > arithmetic relationship. Joining requires name matching, which is fragile.

3. **Cross-check and fail loudly.** Compare the two rotation lists by name. If they
   disagree, write `status='error'` and exit non-zero. Disagreement means one source
   updated for a new season and the other has not — syncing loot in that window would
   populate the wrong dungeons. This check is the season-rollover tripwire.

4. Upsert instances with `in_current_rotation` set from the rotation list. Upsert
   encounters from each real instance's `encounters[]` (`id`, `name`, `icon`, `order`),
   **filtering to `id > 0`**. Raidbots also injects synthetic encounters with negative
   ids *inside* real instances — e.g. `-97` "Trash Drop" in The Venomous Abyss. They are
   not journal encounters, Blizzard 404s on them, and they would render as a bossless
   boss in the loot directory. The sync also deletes any negative-id encounter rows
   written before this filter existed, so the fix is self-healing.

**Rate limits** — 1 Raidbots request (gzip on). 1 Raider.IO request. Nothing to pace.

**Failure modes**

| Failure | Behaviour | What is left behind |
|---|---|---|
| Raidbots 5xx / timeout | abort before any write | previous data fully intact |
| Raider.IO 5xx | abort before any write | previous data fully intact |
| Rotation cross-check fails | abort, `status='error'`, non-zero exit | previous data intact; `/sync` shows the error text |
| Instance in DB no longer in feed | left in place, `in_current_rotation=0` | stale rows are never hard-deleted |

All writes happen in **one transaction** after both fetches succeed. This script is
all-or-nothing; there is no partial state.

---

## 2. `sync:loot`

The expensive one. ~400 Blizzard requests.

**Inputs** — `encounters` rows for instances where `in_current_rotation = 1`
(plus current-tier raids), then per-encounter and per-item Blizzard calls.

**Outputs** — `items`, `item_stats`, `item_sources`

**Procedure, per instance**

1. For each encounter: `GET /data/wow/journal-encounter/{id}` → `items[]`.
   Extract `entry.item.id`. **Not `entry.id`** — that is the JournalEncounterItem id.
2. Deduplicate item ids across the whole instance before fetching details. The probe
   saw the same neck listed under two bosses; without dedup we would fetch it twice.
3. For each unique item: `GET /data/wow/item/{id}`.
   Pull `name`, `quality.type`, `item_class.id`, `item_subclass.id`,
   `inventory_type.type`, `level`, `preview_item.binding.type`,
   `preview_item.stats[]`.
4. Derive `slot` via `lib/domain/slots.ts`. Set `is_equippable = 0` when
   `inventory_type.type === 'NON_EQUIP'`.
5. Write `item_stats` rows preserving `is_negated` verbatim. Do not filter negated
   stats out — see `02-data-model.md` §1.
6. Icons: `GET /data/wow/media/item/{id}` -> `assets[key='icon'].file_data_id`.
   Store the **numeric fileDataId**, not a URL — `lib/domain/icons.ts` builds
   `render.worldofwarcraft.com/{region}/icons/{56|18}/{fileDataId}.jpg` from it.
   There is no readable `inv_*` slug available from this API.
   This **doubles** the request count, so fetch icons in a second pass and treat
   failure as non-fatal (a missing icon falls back to the question mark).
7. Commit the instance's rows in a transaction. Move to the next instance.

**Rate limits** — 200 ms between Blizzard calls (5 req/s against an allowance of 100/s).
Roughly: 8 dungeons × 3–4 bosses = ~28 encounter calls, ~250 unique items,
~250 icon calls. Total ≈ 530 calls ≈ 110 s. Comfortably inside 36,000/hr.

**Token handling** — `lib/blizzard/auth.ts` caches the token to
`data/.blizzard-token.json` with its expiry (~24 h). On a 401, discard and re-auth once,
then retry the request. A second 401 is fatal.

**Failure modes**

| Failure | Behaviour | What is left behind |
|---|---|---|
| One item 404s | log, skip that item, continue | instance commits without it; `status='partial'` |
| One encounter 5xx | retry twice with backoff, then skip encounter | that boss has no loot rows; `status='partial'` |
| Whole instance fails | roll back that instance's transaction, continue to next | **previous data for that instance survives** |
| Token expired mid-run | transparent refresh, retry | no visible effect |
| Rate limited (429) | exponential backoff, up to 3 tries | slower run |
| Process killed mid-run | last committed instance stands; `sync_runs` left `'running'` | next run detects the stale `'running'` row and marks it `'error'` |

**Partial failure is the expected case, not an exception.** Per-instance transactions
mean a bad night leaves you with 6 good dungeons and 2 stale ones, which is far better
than an empty DB. `/sync` surfaces `status='partial'` plus the per-instance error list.

**Idempotency** — everything is an upsert keyed on real ids; `item_sources` has
`UNIQUE(item_id, encounter_id)`. Re-running is always safe.

---

## 3. `sync:news`

**Inputs** — `https://www.wowhead.com/news/rss/{retail,in-dev}` (2 requests)

**Outputs** — `news`

**Procedure**

1. Fetch with `Accept-Encoding: gzip` and a real `User-Agent`. Feed is ~130 KB.
2. Parse with `fast-xml-parser`. Confirmed fields on each `<item>`:
   `title`, `link`, `description`, `category`, `pubDate`, `guid`, `media:content`,
   `content:encoded`.
3. Key on `<guid isPermaLink="false">` — stable and unique.
4. Strip HTML from `description`, collapse whitespace, truncate to ~300 chars.
   The description contains an embedded "Continue reading »" anchor; drop it.
5. Parse `pubDate` (RFC 822, e.g. `Fri, 21 Aug 2026 22:31:43 -0500`) to epoch ms.
6. Extract `media:content@url` as `image_url`.
7. Insert-or-ignore on `guid`. Never update an existing row — the feed is append-only
   in practice and rewriting history hides nothing useful.
8. **Do not store `content:encoded`.** We link out.

**Rate limits** — the feed declares `<ttl>30</ttl>`. Poll at most every 30 minutes.
*(The brief said 15 minutes; the feed itself asks for 30.)*

**Failure modes**

| Failure | Behaviour | What is left behind |
|---|---|---|
| Feed 5xx / timeout | log, `status='error'`, exit non-zero | all existing news intact |
| Malformed XML | abort before writing | all existing news intact |
| One `<item>` unparseable | skip it, continue | `status='partial'` |
| Feed returns 0 items | treat as error, do not wipe | existing news intact |

News is purely additive. There is no delete path.

---

## 4. Character lookup (not a sync script)

Lives at `app/api/character/route.ts`, not in `scripts/`, because it is request-driven.

- Input: `region`, `realm` slug, `name`.
- `cache_key = ${region}:${realm}:${name}` lowercased. Serve from `character_cache`
  if `fetched_at` is within 15 minutes.
- On miss: `GET https://raider.io/api/v1/characters/profile` with
  `fields=gear,mythic_plus_scores_by_season:current,raid_progression`.
- Confirmed response shape: `gear.items` is an object keyed by slot name
  (`head`, `neck`, … `mainhand`), each with `item_id`, `item_level`, `name`, `icon`,
  `item_quality`, `bonuses`, `gems_detail`, `enchants_detail`.
- **Ignore `azerite_powers` and `corruption`.** The probe showed these returning
  legacy garbage (`tier: 999`, spell name `"Unknown"`) on current-expansion gear.
- 404 from Raider.IO means "character not found or not yet crawled" — surface that
  wording, do not cache the failure.
- On upstream 5xx, serve stale cache if any exists and label it as stale.

---

## 5. `verify-assumptions.ts`

Run before `sync:all`. Re-asserts, and exits non-zero on any failure:

1. `journal-encounter` still returns `items[]`, entries still shaped `{id, item:{id}}`.
2. `preview_item.stats[].type.type` yields only known `STAT_MAP` keys.
3. `inventory_type.type` yields only known slot-map keys.
4. A known cloak is still `item_class=4, item_sub_class=1` **and** still lists more
   than one primary stat. (This is the assumption that, if it breaks, silently
   corrupts every armor-type filter.)
5. Raidbots `mplus-chest` rotation and Raider.IO current-season rotation still match.

Patch days break assumptions. This is the tripwire.
