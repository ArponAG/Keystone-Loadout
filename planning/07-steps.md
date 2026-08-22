# 07 — Build steps

Each step is one focused session. Each has a definition of done and a manual test you
can run yourself. Git tag after each.

**Step 0 is complete** — this planning folder plus `scripts/probe.ts`, tagged `step-0`.

---

## Step 1 — Scaffold, tokens, schema

**Do**
- `create-next-app` (App Router, TS, Tailwind, src-less layout per `01-architecture.md`).
- Write `tailwind.config.ts` from `06-design-extract.md` §7 verbatim.
- Root layout: `<SiteHeader>`, `<SiteFooter>` with the required attribution.
- Drizzle schema in `lib/db/schema.ts` from `02-data-model.md`, all 8 tables + indexes.
- `better-sqlite3` client singleton at `lib/db/index.ts`.
- Generate and apply the initial migration.

**Done when**
- `npm run dev` serves a styled empty shell on every route in the route table.
- `data/app.db` exists with all 8 tables and correct indexes.
- `data/*.db` and `.env*` are gitignored (already true).

**Manual test**
```bash
npm run dev
```
Visit `/`. Confirm dark palette, footer attribution present.
```bash
sqlite3 data/app.db ".schema" | grep -c "CREATE TABLE"
```
Expect `8`.

**Tag** `step-1`

---

## Step 2 — Blizzard client

**Do**
- `lib/blizzard/auth.ts` — client-credentials token, cached to
  `data/.blizzard-token.json` with expiry, transparent refresh on 401 (one retry).
- `lib/blizzard/client.ts` — fetch wrapper: 200 ms spacing, namespace + locale
  injection, 429 exponential backoff (3 tries), typed errors.
- `lib/domain/stats.ts` — `STAT_MAP` exactly as `04-scoring.md` §3. Unknown stat throws.
- `lib/domain/slots.ts` — `inventory_type` → slot map, plus `ARMOR_FILTERED_SLOTS`.

**Done when**
- A throwaway call fetches item 273796 and returns `Vile Vial of Volatile Venom`.
- Deleting the token cache and re-running transparently re-auths.
- An unknown stat string throws rather than returning undefined.

**Manual test**
```bash
npx tsx -e "import('./lib/blizzard/client.ts').then(async m => console.log((await m.blizz('/data/wow/item/273796')).name))"
```
Expect `Vile Vial of Volatile Venom`. Run twice; the second must not hit `oauth.battle.net`.

**Tag** `step-2`

---

## Step 3 — `sync:instances`

**Do**
- Per `03-etl.md` §1: fetch Raidbots + Raider.IO, filter to `type` dungeon/raid with
  `id > 0`, resolve current rotation from the `mplus-chest` entry, cross-check against
  Raider.IO's current season by name, **fail loudly on mismatch**.
- Single transaction. `sync_runs` row on entry and exit.

**Done when**
- `instances` holds 12 dungeons + 7 raids; no negative ids present.
- Exactly 8 rows have `in_current_rotation = 1`.
- `encounters` is populated for every instance.
- Deliberately corrupting one rotation list makes the script exit non-zero and write
  `status='error'`.

**Manual test**
```bash
npm run sync:instances
```
```bash
sqlite3 data/app.db "SELECT COUNT(*) FROM instances WHERE id < 0;"
```
Expect `0`.
```bash
sqlite3 data/app.db "SELECT name FROM instances WHERE in_current_rotation=1 ORDER BY name;"
```
Expect the 8: Altar of Fangs, Den of Nalorakk, Kings' Rest, Murder Row, Ruby Life
Pools, Temple of Sethraliss, The Blinding Vale, Voidscar Arena.

**Tag** `step-3`

---

## Step 4 — `sync:loot`

The big one. Budget a full session.

**Do**
- Per `03-etl.md` §2. Encounter → `items[].item.id` (**not** `items[].id`), dedupe per
  instance, fetch item detail, derive slot, persist stats **with `is_negated`**.
- Per-instance transactions. Icons in a lazy second pass, failures non-fatal.
- `status='partial'` when any instance fails.

**Done when**
- ~250–400 items across the 8 rotation dungeons.
- `item_stats` preserves negated rows (spot-check a plate item shows `STRENGTH` negated).
- Mounts/recipes/decor present with `is_equippable = 0`.
- Killing the process mid-run leaves earlier instances intact and committed.

**Manual test**
```bash
npm run sync:loot -- --dungeons
```
```bash
sqlite3 data/app.db "SELECT COUNT(*) FROM items; SELECT COUNT(*) FROM items WHERE is_equippable=0;"
```
Second count must be > 0 — junk items exist and must be captured, not dropped.
```bash
sqlite3 data/app.db "SELECT i.name, s.stat_key, s.amount, s.is_negated FROM items i JOIN item_stats s ON s.item_id=i.id WHERE i.name LIKE '%Bloodthorn Burnous%';"
```
Expect three primaries, two negated. This is the cloak assertion.

**Tag** `step-4`

---

## Step 5 — Dungeon Loot Directory UI

**Do**
- `/loot` instance grid, rotation first and badged.
- `/loot/[instanceId]` boss sections + loot tables.
- Non-gear rows muted with a "not gear" badge.
- All four empty states from `05-ui.md` §4.

**Done when**
- Every rotation dungeon renders its full loot with stats, slot, quality.
- `/loot/999999` renders the 404 page, not a crash.
- Empty DB renders "Run `npm run sync:instances`" rather than a blank grid.

**Manual test** — visit `/loot`, click through all 8 dungeons, confirm boss counts
match `03-etl.md`. Then `mv data/app.db /tmp/` and reload to check the empty state.

**Tag** `step-5`

---

## Step 6 — Scoring module + tests

**Do**
- `config/scoring.ts` with `RANK_WEIGHTS`.
- `lib/domain/filters.ts` — primary-set union rule, armor filter gated on slot,
  junk exclusion.
- `lib/scoring/score.ts` — `fitScore` per `04-scoring.md` §5.
- `lib/scoring/score.test.ts` — the full fixture table from `04-scoring.md` §9.

**Done when** — all fixtures pass, including the three regression guards (cloak
eligible for plate, plate legs eligible for strength despite negation, junk excluded).

**Manual test**
```bash
npm test
```
Expect the hand-computed values: `0.5393`, `0.8737`, `0.8950`, `0.3800`, `null`.

**Tag** `step-6`

---

## Step 7 — Build Gear Finder UI

**Do**
- `<BuildForm>` client island writing to searchParams.
- Server component reads DB, applies filters, scores, groups by slot.
- `<FitScoreBadge>` with secondary count; trinkets last; weapon + trinket warnings.
- Not-a-simulation banner. Wowhead + Raidbots links per item.

**Done when**
- Cloth/intellect/haste-first returns sensible per-slot rankings.
- Switching to plate/strength changes results **and still shows cloaks**.
- `NO_SECONDARIES` items show the badge, not `0%`.
- Build state survives refresh and is shareable via URL.

**Manual test** — set cloth/int/haste-first, confirm Spare Speaker's Hood scores 87%.
Switch to plate/strength; confirm Bloodthorn Burnous is still listed.

**Tag** `step-7`

---

## Step 8 — News

**Do** — `sync:news` per `03-etl.md` §3 (30-min floor, HTML stripped, no
`content:encoded`), plus `/news` with retail/in-dev tabs.

**Done when** — feed populated, dedupe on re-run adds 0 rows, no HTML renders raw.

**Manual test**
```bash
npm run sync:news && npm run sync:news
```
```bash
sqlite3 data/app.db "SELECT COUNT(*) FROM news;"
```
Count must be identical after the second run.

**Tag** `step-8`

---

## Step 9 — Character lookup

**Do** — `/api/character` route with 15-min `character_cache`; `/character` form + profile.
Realm slug normalisation. All six states from `05-ui.md` §5.

**Done when**
- A known character resolves; second lookup within 15 min is served from cache.
- A bogus name shows the not-found message and is **not** cached.
- `azerite_powers` / `corruption` are ignored.

**Manual test** — look up `us` / `moon-guard` / `Bjornzerker`. Reload; confirm
"cached" note. Then try `us` / `moon-guard` / `Notarealname12345`.

**Tag** `step-9`

---

## Step 10 — `verify-assumptions`, README, polish

> `/sync` itself landed early — the admin table at Step 1, and the run buttons plus
> concurrency lock alongside Step 4. What remains here is the drift tripwire and docs.

**Do**
- `scripts/verify-assumptions.ts` per `03-etl.md` §5, non-zero on drift.
- `sync:all` wired to run verify first.
- README: setup, Battle.net client creation, sync commands, patch-day procedure.

**Done when**
- `/sync` shows accurate status for all three sources.
- `verify-assumptions` exits 0 today and non-zero if `STAT_MAP` has a key removed.
- A fresh clone can go from zero to populated following the README alone.

**Manual test**
```bash
npm run verify
```
Expect exit 0. Delete a `STAT_MAP` key and rerun; expect non-zero.

**Tag** `step-10`

---

## Sequencing notes

- Steps 3 and 4 must land before 5 and 7 — the UI has nothing to render otherwise.
- Step 6 is independent of 3–5 and can move earlier if you want tests before UI.
- Step 9 is fully independent; it touches no synced data.
- Steps 1–4 are the load-bearing half. If attention runs out, stopping after 5 leaves a
  genuinely useful loot directory.
