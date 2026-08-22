# 08 — Brief corrections

Every place the probe contradicted `00-BRIEF.md`. Nothing here is papered over.

Probe run: 2026-08-22, US region, Blizzard static namespace `static-12.1.0_68914-us`.

---

## A. Confirmed — the brief was right

Worth stating, because these were the load-bearing bets:

1. **`journal-encounter` DOES return `items[]`.** The wago.tools DB2 fallback is not
   needed. `enc.items` had 7 entries on the first probe encounter.
2. **Cloaks are Cloth subclass and must escape armor-type filtering.** The brief called
   this out as critical and it is exactly right —
   `Bloodthorn Burnous: item_class=4, item_sub_class=1`. Confirmed with real data.
3. **Necks / rings / trinkets are `item_sub_class=0` and armor-type agnostic.** Confirmed.
4. **Shields are `item_sub_class=6`.** Confirmed.
5. **Rank within slot × tier, never across.** Confirmed and *strengthened* — see D3.
6. **Blizzard rate limits are generous.** A full season sync is ~530 calls.
7. **Midnight is the current expansion.** `journal-expansion/index` returns Midnight
   (id 516). We are in Midnight Season 2, started 2026-08-18.

---

## B. Wrong — endpoint and field shapes

### B1. `inventory_type` is a **string enum**, not an integer

The brief's §4.1 lists integers (`1 Head`, `2 Neck`, `12 Trinket`, `16 Back`…). The
Game Data API returns an object with a string:

```json
"inventory_type": { "type": "TRINKET", "name": "Trinket" }
```

Observed strings: `HEAD NECK SHOULDER CLOAK CHEST ROBE WAIST LEGS FEET WRIST HAND
FINGER TRINKET WEAPON TWOHWEAPON SHIELD HOLDABLE RANGED RANGEDRIGHT NON_EQUIP`

Those integers are DB2 values, not API values.

**Used instead:** `inventory_type` stored as TEXT; a string→slot map in
`lib/domain/slots.ts` (`02-data-model.md` §2).

### B2. Specific naming errors inside that list

| Brief | Actual |
|---|---|
| `16 Back` | `CLOAK` |
| `10 Hands` | `HAND` (singular) |
| `15 Ranged` / `26 Ranged` | `RANGED` **and** `RANGEDRIGHT` — the latter is not in the brief at all; it appears on bows and wands |
| `23 Held in Off-hand` | `HOLDABLE` |
| `5 Chest` / `20 Chest(robe)` | `CHEST` and `ROBE` — the collapse-to-one-slot instruction was correct |

### B3. `entry.id` is not the item id

The brief did not specify the `items[]` entry shape. It is:

```json
{ "id": 47171, "item": { "key": {...}, "name": "...", "id": 273796 } }
```

`entry.id` is the **JournalEncounterItem** id. The item id is `entry.item.id`. Using
the wrong one poisons every downstream join.

**Used instead:** `03-etl.md` §2 step 1 calls this out explicitly; `02-data-model.md`
flags it on the `items.id` column.

### B4. `quality` is a string enum

`"quality": { "type": "RARE", "name": "Rare" }`, not an integer as the schema implied.
Stored as TEXT.

---

## C. Wrong — the stat model

### C1. Combined-primary enums do not exist

The brief's §4.3 predicted `AGI_STR_INT`, `AGI_STR`, `AGI_INT`, `STR_INT`. **None of
these appeared** in ~90 sampled items, nor in the 551 items later synced.

Note also `VERSATILITY` carries **no** `_RATING` suffix, unlike the other three
secondaries — the brief guessed right on this one but it was worth verifying.

> **Correction to this document (Step 4).** An earlier revision claimed the "complete
> observed set" was eight strings. That was wrong — it was the complete set *in the
> probe's dungeon sample*. Syncing the raids surfaced a ninth:
>
> ```
> AGILITY  CRIT_RATING  HASTE_RATING  INTELLECT  MASTERY_RATING
> STAMINA  STRENGTH  VERSATILITY  COMBAT_RATING_LIFESTEAL
> ```
>
> `COMBAT_RATING_LIFESTEAL` is **Leech**, and it is a **tertiary**, not a secondary — a
> bonus roll on top of the item's secondary budget. Treating it as a secondary would
> corrupt every `fitScore` denominator on the four raid items that carry it.
>
> The lesson generalises: the probe sampled dungeons only, so "complete" meant
> "complete for dungeons". WoW also has Avoidance, Speed and Indestructible tertiaries
> that still have not appeared; their enum spellings remain unverified and are
> deliberately **not** guessed in `STAT_MAP`.
>
> This is what the loud-but-non-fatal unknown-stat path is for: `sync:loot` named the
> stat, named the four items, and marked the run `partial` rather than either crashing a
> 7-minute sync or silently swallowing it. Unknown stats are also safe by construction —
> `toSecondaryKey` returns null for anything outside `STAT_MAP`, so a new stat can never
> silently inflate a score.

### C2. Flexible-primary items work through `is_negated` — and this is the single most consequential correction

The brief never mentions `is_negated`. It is the mechanism the combined enums were
supposed to provide, and getting it backwards silently breaks the entire Gear Finder.

Evidence:

| Item | Armor | Stats |
|---|---|---|
| Lightblossom Cinch | cloth | `INTELLECT=5` |
| Ironroot Collar | mail | `INTELLECT=5, AGILITY=5[NEG]` |
| Bedrock Breeches | plate | `INTELLECT=7, STRENGTH=7[NEG]` |
| **Bloodthorn Burnous** | **cloak** | `INTELLECT=4, AGILITY=4[NEG], STRENGTH=4[NEG]` |

The cloak is wearable by every class in the game, and it reports **all three**
primaries with two negated. Therefore `is_negated` means *"one of the primaries this
item can serve, but not the default in this response"* — **not** *"absent"*.

The naive reading (`is_negated = 0` means the item has this stat) would hide **every
plate item from a Strength user** and every cloak from everyone but casters.

**Used instead:** `04-scoring.md` §4.1 — the primary set is the **union** of all
primary stats present, negated or not. `02-data-model.md` keeps `is_negated` as a
first-class column. Two of the three regression tests in `04-scoring.md` §9 exist
solely to guard this.

### C3. Some items have no primary stat at all

`Yoke of the Charging Bear` (neck): `STAMINA=6, CRIT=7, HASTE=13`.
`Lightwarden's Bind` (finger): `STAMINA=6, VERS=7, MASTERY=13`.

An empty primary set must mean **"eligible for everyone"**, never "eligible for no one".
These are in fact the cleanest inputs the scorer gets — pure secondary distribution.

### C4. Stat magnitudes are not consistent between items

`Amulet of the Twin Fangs` returns `STAMINA=565, MASTERY=134` while a same-ilvl chest
returns `STAMINA=11, MASTERY=9`. Some responses carry fully scaled values, others carry
base budget values.

This does **not** break the design, and that is worth recording: because `fitScore`
divides by `secondaryTotal`, it is a within-item ratio and the scale cancels out. It
does mean raw stat values must never be compared across items in the UI.

---

## D. Wrong — data sources and season model

### D1. Raidbots `instances.json` is not a clean instance tree

The brief describes it as "instance + encounter tree". It is Raidbots' **droptimizer
picker data**. 39 top-level entries, of which most are synthetic:

```
dungeon  raid  expansion-dungeon  mplus-chest  catalyst  bonus-roll
pvp-honor  pvp-world  pvp-conquest  delve-mid1  delve-mid2  prey-mid1
prey-mid2  professionMidnightPvp  professionMidnightRare  professionMidnightEpic
```

Synthetic entries carry **negative ids**, and their `encounters[]` are *dungeons, not
bosses*. Only `type` `dungeon`/`raid` with `id > 0` are real journal instances
(12 dungeons, 7 raids).

**Used instead:** `03-etl.md` §1 step 1 filters on type **and** positive id.

### D2. Raider.IO `static-data` top-level `dungeons` is NOT the M+ rotation

The brief calls this endpoint "the authoritative source" for the current rotation.
Its top-level `dungeons` array is the **expansion's** dungeon list (9 Midnight dungeons).
The rotation lives at `seasons[].dungeons` — select the season where
`is_main_season && starts.us <= now < ends.us`.

The two differ materially. Current rotation (8) includes **Kings' Rest, Ruby Life
Pools, Temple of Sethraliss** — dungeons from three *previous* expansions — and
excludes four Midnight dungeons. A rotation built from the top-level array would be
wrong in six of eight slots.

Corollary: `in_current_rotation` cannot be derived from an expansion filter, which is
why `02-data-model.md` names the column that rather than the brief's `is_current_season`.

### D3. Base item level is **not** constant across a season's dungeons

The brief's §5.4 argues no ilvl math is needed because "all items dropping from a given
dungeon at a given difficulty share the same item level".

Within a dungeon, true — Blinding Vale is uniformly 108. **Across the rotation, false:**
Altar of Fangs items are ilvl **219**, Blinding Vale items ilvl **108**. Both are in the
same M+ pool.

`item.level` is the *journal base* ilvl, not what a keystone awards. In play, M+
normalises reward ilvl by key level regardless of the dungeon's base.

The brief's *conclusion* survives and is in fact reinforced — rank within a tier, never
across. But its *reasoning* was wrong, and the practical consequence is new:
**`base_item_level` must never be displayed as "the ilvl you will get".**

**Used instead:** column named `base_item_level` to resist misuse
(`02-data-model.md`); `04-scoring.md` §7.2 states the display rule; real reward ilvls
belong in a hand-maintained `config/season.json`.

### D4. Raider.IO ids are a separate numbering system

`rio_id` (16865) and `challenge_mode_id` (588) have no relationship to Blizzard's
journal-instance id (1322). The brief implies Raider.IO can drive the rotation directly;
it cannot, without name matching.

**Used instead:** Raidbots' `mplus-chest` entry supplies rotation **ids** (it speaks
journal-instance ids); Raider.IO supplies season **metadata**. `03-etl.md` §1 step 3
cross-checks the two by name and fails loudly on disagreement — the season-rollover
tripwire. At probe time they agreed exactly.

### D5. Loot tables contain non-gear

Dungeon `items[]` includes mounts (`item_class 15`), profession patterns
(`item_class 9`) and housing decor (`item_class 20`), all with
`inventory_type: NON_EQUIP` and `level` of 1 or 10. The brief's schema has no notion of
these; they would land in `items` and pollute both ilvl reasoning and gear results.

**Used instead:** `items.is_equippable` flag. Stored (so the loot directory is honest
and complete) but excluded from scoring.

### D6. Wowhead RSS asks for 30 minutes, not 15

The feed declares `<ttl>30</ttl>`. The brief specified a 15-minute poll.
**Used instead:** 30-minute floor (`03-etl.md` §3).

Also, the feed carries `<content:encoded>` with full article bodies and a
`<category>` field the brief did not mention. We store the category and deliberately
do not store `content:encoded`.

### D7. Raider.IO character payload contains legacy garbage

`gear.items[].azerite_powers` returns entries with `tier: 999` and spell name
`"Unknown"`; `corruption` returns all zeros. These are dead fields from Battle for
Azeroth and Shadowlands still present in the response shape.

**Used instead:** `03-etl.md` §4 and `05-ui.md` §5 both say to ignore them.

---

## E. Scope changes not caused by the probe

### E1. `reference/existing.html` does not exist

The brief's §7 and Task B specify extracting a palette, type scale and components from
an existing HTML file. That file was never added — the decision was to build from
scratch.

**Used instead:** `06-design-extract.md` is a design *definition* rather than an
extraction, and says so at the top. Its §9 records that the brief's
"note anything with no counterpart" instruction is empty by construction.

### E2. `item_sources.difficulty` removed

The brief's schema has a `difficulty` column on `item_sources`. The probe shows
`journal-encounter.modes` = `NORMAL, HEROIC, MYTHIC, MYTHIC_KEYSTONE` at the
**encounter** level, and one loot list shared across all of them. Difficulty is a
property of the run, not of the drop.

**Used instead:** column dropped; difficulty→ilvl lives in hand-maintained
`config/season.json` (`02-data-model.md` §0).

---

## F. Open question for you

`04-scoring.md` §7.1: an item with a single secondary always scores **100%**, because
all of its secondary budget is by definition on one stat. A pure-haste item therefore
outranks a haste+crit item on a haste-first build, even though two secondaries is often
better in play once diminishing returns bite.

I did **not** invent a penalty for this — doing so would be fabricating sim data the
scorer has no basis for. Current plan is to display the secondary count next to the
score so the difference is visible, and leave the judgement to you.

If you would rather the score itself account for it, that is a scoring-policy decision,
not a data one, and Step 6 is the place to make it.
