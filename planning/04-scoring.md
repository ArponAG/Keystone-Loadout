# 04 — Scoring

> **This is a stat-fit heuristic, not a simulation.** It answers one narrow question:
> *given a fixed secondary-stat budget, how much of it lands on the stats you ranked
> highest?* It does not know about procs, cooldowns, breakpoints, diminishing returns,
> set bonuses, or your rotation.

## 1. Input

```ts
type Secondary = 'haste' | 'crit' | 'mastery' | 'vers';

type Build = {
  armorType: 'cloth' | 'leather' | 'mail' | 'plate';
  primary: 'intellect' | 'agility' | 'strength';
  secondaryOrder: [Secondary, Secondary, Secondary, Secondary]; // ranked 1 -> 4
};
```

## 2. Weights — `config/scoring.ts`

```ts
/** Weight applied to a secondary by its rank in the user's ordering.
 *  Tunable. Flatten toward [1,.85,.7,.55] if results feel too binary;
 *  steepen toward [1,.5,.25,.1] to punish off-stats harder. */
export const RANK_WEIGHTS = [1.0, 0.7, 0.45, 0.25] as const;
```

## 3. Stat mapping — built from what the probe returned

Observed `preview_item.stats[].type.type` strings across the full synced set (551 items):

```
AGILITY  CRIT_RATING  HASTE_RATING  INTELLECT  MASTERY_RATING
STAMINA  STRENGTH  VERSATILITY  COMBAT_RATING_LIFESTEAL
```

`COMBAT_RATING_LIFESTEAL` (Leech) appears on raid gear only and is a **tertiary** — it
sits on top of the secondary budget and must never enter the denominator in §5.

```ts
// lib/domain/stats.ts
export const STAT_MAP = {
  INTELLECT:      { kind: 'primary'   as const, key: 'intellect' },
  AGILITY:        { kind: 'primary'   as const, key: 'agility'   },
  STRENGTH:       { kind: 'primary'   as const, key: 'strength'  },
  STAMINA:        { kind: 'tertiary'  as const, key: 'stamina'   },
  HASTE_RATING:   { kind: 'secondary' as const, key: 'haste'     },
  CRIT_RATING:    { kind: 'secondary' as const, key: 'crit'      },
  MASTERY_RATING: { kind: 'secondary' as const, key: 'mastery'   },
  VERSATILITY:    { kind: 'secondary' as const, key: 'vers'      },
  COMBAT_RATING_LIFESTEAL: { kind: 'tertiary' as const, key: 'leech' },
} as const;
```

Three corrections to the brief embedded here:

- `VERSATILITY` has **no** `_RATING` suffix, unlike the other three secondaries.
- There is **no** `AGI_STR_INT` / `AGI_INT` / `STR_INT` combined enum. The brief
  predicted these; they do not exist. Flexible-primary items are expressed through
  `is_negated` instead (§4).
- `STAMINA` and `COMBAT_RATING_LIFESTEAL` are never secondaries. Tertiaries are
  excluded from the denominator entirely.

An unknown stat string must throw, not be silently ignored — `verify-assumptions.ts`
checks this before every sync.

## 4. Eligibility — which items a build may see

Run **before** scoring.

### 4.1 Primary eligibility

```
primarySet(item) = { all primary stats present on the item, negated or not }

eligible if  primarySet is empty              (neck / finger / some trinkets)
          or primarySet contains build.primary
```

The union rule is not a guess. From the probe:

| Item | Stats | Serves |
|---|---|---|
| Lightblossom Cinch (cloth) | `INTELLECT=5` | int |
| Ironroot Collar (mail) | `INTELLECT=5, AGILITY=5[NEG]` | int, agi |
| Bedrock Breeches (plate) | `INTELLECT=7, STRENGTH=7[NEG]` | int, str |
| **Bloodthorn Burnous (cloak)** | `INTELLECT=4, AGILITY=4[NEG], STRENGTH=4[NEG]` | int, agi, str |
| Yoke of the Charging Bear (neck) | `STAMINA=6, CRIT=7, HASTE=13` | *(anyone)* |

The cloak settles it. A cloak is wearable by every class, and it reports all three
primaries with two negated. So `is_negated` marks *"not the default primary in this
response"*, **not** *"absent"*. Filtering on `is_negated = 0` would hide every plate
item from a Strength user — precisely backwards.

### 4.2 Armor-type eligibility

Applies **only** to slots `head, shoulder, chest, waist, legs, feet, wrist, hands`.

For those slots: `item_sub_class` must equal the build's armor type
(1 cloth / 2 leather / 3 mail / 4 plate).

For every other slot the filter is **skipped entirely**. This is load-bearing: the
probe's cloak is `item_class=4, item_sub_class=1` — Cloth — and applying the subclass
filter to it would delete all cloaks for a plate wearer.

### 4.3 Junk exclusion

`is_equippable = 0` items never reach scoring. The probe found mounts
(`item_class 15`), recipes (`9`) and housing decor (`20`) sitting in dungeon loot
tables with `inventory_type: NON_EQUIP`.

## 5. The score

```
secondaries(item) = stats where STAT_MAP[key].kind === 'secondary'
                    (negation ignored — negation applies to primaries)

secondaryTotal    = Σ value over secondaries

if secondaryTotal === 0:
    flag NO_SECONDARIES, fitScore = null, still list the item

fitScore = Σ ( value_i × RANK_WEIGHTS[ rankOf(stat_i) ] ) / secondaryTotal
```

`fitScore ∈ [0.25, 1.0]`. Display as `Math.round(fitScore * 100)`.

Because the score is a **ratio**, it is immune to the stat-magnitude inconsistency the
probe exposed — some items returned scaled values (`STAMINA=565`) and others base
values (`STAMINA=11`). Normalising by `secondaryTotal` cancels the scale out. This is
the main reason to prefer a ratio over raw weighted sums.

## 6. Worked by hand — three real probe items

**Build:** cloth / intellect / `[haste, crit, mastery, vers]`
**Weights:** haste `1.0`, crit `0.7`, mastery `0.45`, vers `0.25`

---

### Item A — Worldroot Canopy (head, cloth, ilvl 108)
`INTELLECT=7  STAMINA=11  CRIT_RATING=5  MASTERY_RATING=9`

Eligible: primarySet `{intellect}` ✓, slot `head` is armor-filtered, subclass 1 = cloth ✓

```
secondaries      = crit 5, mastery 9
secondaryTotal   = 5 + 9 = 14
weighted         = (5 × 0.70) + (9 × 0.45)
                 =  3.50      +  4.05      = 7.55
fitScore         = 7.55 / 14 = 0.5393
display          = 54%
```

### Item B — Spare Speaker's Hood (head, ilvl 219)
`INTELLECT=10  AGILITY=10[NEG]  STAMINA=15  CRIT_RATING=8  HASTE_RATING=11`

Eligible: primarySet `{intellect, agility}` contains intellect ✓

```
secondaries      = crit 8, haste 11
secondaryTotal   = 8 + 11 = 19
weighted         = (8 × 0.70) + (11 × 1.00)
                 =  5.60      +  11.00      = 16.60
fitScore         = 16.60 / 19 = 0.8737
display          = 87%
```

### Item C — Yoke of the Charging Bear (neck, ilvl 108)
`STAMINA=6  CRIT_RATING=7  HASTE_RATING=13`

Eligible: primarySet is empty → always eligible; slot `neck` is not armor-filtered ✓

```
secondaries      = crit 7, haste 13
secondaryTotal   = 7 + 13 = 20
weighted         = (7 × 0.70) + (13 × 1.00)
                 =  4.90      +  13.00      = 17.90
fitScore         = 17.90 / 20 = 0.8950
display          = 90%
```

### Counter-example — Lightwarden's Bind (finger, ilvl 108)
`STAMINA=6  VERSATILITY=7  MASTERY_RATING=13`

```
secondaryTotal   = 7 + 13 = 20
weighted         = (7 × 0.25) + (13 × 0.45)
                 =  1.75      +   5.85      = 7.60
fitScore         = 7.60 / 20 = 0.3800
display          = 38%
```

Mastery-and-vers on a haste-first build. The floor of 25% is the all-#4-stat case, so
38% correctly reads as "bad, but not the worst possible".

### Zero case — Seed of Radiant Hope (trinket, ilvl 108)
`INTELLECT=7` — nothing else.

`secondaryTotal = 0` → `NO_SECONDARIES`, `fitScore = null`. Still listed, never scored
0% (which would falsely imply "measured and bad" rather than "not measurable").

## 7. Known limitations — state these in the UI, do not hide them

### 7.1 Single-secondary items always score 100%
An item with only haste scores `haste/haste = 1.0`, beating Item B's 87% — even though
in play, two well-chosen secondaries often outperform one, and stat DR makes stacking
one rating progressively worse. **The score measures purity, not power.**
Mitigation: display the secondary count alongside the percentage so a 100%/1-stat item
is visibly distinct from a 100%/2-stat item. Do not silently penalise it — that would
be inventing sim data we do not have.

### 7.2 Rank within (slot × difficulty), never across
Base ilvls are not comparable. The probe found Altar of Fangs at **ilvl 219** and
The Blinding Vale at **ilvl 108** — both in the same M+ rotation. `base_item_level` is
the journal's base, *not* what a keystone awards; in play, M+ normalises reward ilvl by
key level regardless of the dungeon. So:
- Ranking across dungeons **at the same key level** is valid.
- Displaying `base_item_level` as "the ilvl you will get" is **wrong**. Label it
  "base ilvl" or omit it, and put real reward ilvls in `config/season.json` by hand.

### 7.3 Trinkets
Trinket value is dominated by on-use and proc effects, which carry no stat weight at
all. Many have zero secondaries (`Seed of Radiant Hope`). Score them, sort them last by
default, and show a persistent warning. Never present a trinket ranking as authoritative.

### 7.4 Weapons
Weapon DPS usually outweighs secondary distribution entirely. Same treatment as trinkets.

### 7.5 No tier sets, no catalyst, no gems/enchants/embellishments
Out of scope for v1 and explicitly so.

## 8. UI obligations

- Label the surface **"Stat-fit ranking — not a simulation."**
- Every item links to `https://www.wowhead.com/item={id}`.
- Offer a "sim this on Raidbots" link so the real answer is one click away.
- Show `NO_SECONDARIES` as a badge reading "no secondaries", not as `0%`.
- Show the secondary count next to each score (§7.1).

## 9. Tests — `lib/scoring/score.test.ts`

Fixtures are the real probe items above, with their arithmetic hard-coded:

| Fixture | Expected |
|---|---|
| Worldroot Canopy, haste-first | `0.5393` (±1e-4) |
| Spare Speaker's Hood, haste-first | `0.8737` |
| Yoke of the Charging Bear, haste-first | `0.8950` |
| Lightwarden's Bind, haste-first | `0.3800` |
| Seed of Radiant Hope | `null` + `NO_SECONDARIES` |
| any item, all-#1 secondary | exactly `1.0` |
| any item, all-#4 secondary | exactly `0.25` |
| cloak vs plate build | **eligible** (regression guard for §4.2) |
| plate legs, strength build | **eligible** despite `STRENGTH[NEG]` (guard for §4.1) |
| mount / recipe in loot table | **excluded** (guard for §4.3) |

The last three are the ones that matter. They encode the three assumptions that would
silently produce plausible-looking but wrong results if they ever regressed.
