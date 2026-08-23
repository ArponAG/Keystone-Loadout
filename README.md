# Keystone Loadout

A personal World of Warcraft Retail companion. Four surfaces, all served from a local
SQLite database that you sync on demand.

| Surface | What it does |
|---|---|
| **Build Gear Finder** (`/gear`) | Pick armor type, primary stat and rank the four secondaries. Get gear per slot, ranked by how well each item's secondary budget matches your ranking. |
| **Dungeon Loot Directory** (`/loot`) | This season's Mythic+ rotation and current raid tier, boss by boss, with full loot tables. |
| **Character Lookup** (`/character`) | Type-ahead search, saved characters, then a full profile — equipped gear with weak-slot analysis, **what to get next and which dungeon drops it**, talent build, Mythic+ progression, raid progression. |
| **News** (`/news`) | Wowhead retail and in-development feeds, cached locally. |
| **Sync** (`/sync`) | What is stale, and a button to fix it. |

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Drizzle + SQLite

Every item name links to Wowhead and shows the real in-game tooltip on hover.

---

## The one thing to understand

This is a **read-mostly app over a slowly-changing dataset**. A season's dungeon loot is
about 550 items and changes on patch days, not on page loads.

So: ETL scripts pull from Blizzard, Raidbots, Raider.IO and Wowhead into `data/app.db`,
and every page render reads nothing but SQLite. No React component ever calls a
third-party API. The only live call at request time is the character lookup, and it
goes through a Route Handler with a 15-minute cache.

---

## Setup

### 1. Blizzard API credentials

1. Go to <https://develop.battle.net> and sign in. Your Battle.net account needs an
   authenticator attached.
2. **API Access → Create Client**.
   - *Client Name*: anything, e.g. `keystone-loadout`
   - *Redirect URLs*: required even though we only use client-credentials.
     `http://localhost:3000/api/auth/callback/battlenet` is fine.
   - *Service URL*: tick **"I do not have a service URL for this client."**
   - *Intended Use*: e.g. "Personal, non-commercial gear-comparison tool, runs locally."
3. Copy the **Client ID** and **Client Secret** — the secret is shown once.

### 2. Environment

Create `.env.local` in the project root:

```
BLIZZARD_CLIENT_ID=<your client id>
BLIZZARD_CLIENT_SECRET=<your client secret>
BLIZZARD_REGION=us
```

`.env*` and `data/*.db` are gitignored. The secret is read only by
`lib/blizzard/auth.ts`, which only ETL scripts import — it never reaches the browser.

> **Run the migration before `npm run dev`.** The app tells you if you forget, but the
> order matters.

### 3. Install and create the database

```bash
npm install
```

```bash
npx drizzle-kit migrate
```

### 4. Populate it

```bash
npm run sync:safe
```

That runs the assumption checks, then instances → loot → news. First run takes roughly
8 minutes, almost all of it the loot sync's ~1,000 Blizzard requests.

In a hurry? `npm run sync:instances && npm run sync:loot -- --dungeons` does the M+
rotation only in about 4 minutes.

### 5. Run it

```bash
npm run dev
```

---

## Hosting it on a home server (Docker)

For a LAN box — ZimaOS, CasaOS, a Pi, any Linux host with Docker.

Put `.env.local` (from step 2) next to `docker-compose.yml`, then:

```bash
docker compose up -d --build
```

```bash
docker compose exec keystone npx drizzle-kit migrate
```

```bash
docker compose exec keystone npm run sync:all
```

Open `http://<server-ip>:3000` from any machine on the network.

The database lives in `./data`, mounted as a volume, so rebuilding the image never
discards it. Re-sync on patch days with the same `exec` command.

**Do not port-forward this to the internet.** `/sync` can start runs that make hundreds
of requests against *your* Blizzard credentials, and there is no authentication —
appropriate for a LAN with a few friends on it, not for a public URL.

`/sync` is intentionally **not linked in the navigation**; it is an operator page. Visit
`http://<server-ip>:3000/sync` directly when you need it.

Saved characters live in each visitor's **browser**, not the database, so everyone gets
their own list without accounts.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm test` | Unit tests (75) — scoring, filters, URL parsing, Raider.IO shaping, gear audit, recommendations |
| `npm run verify` | Assumption tripwire — exits non-zero on API drift |
| `npm run sync:safe` | `verify` then `sync:all` — the one to use |
| `npm run sync:all` | instances → loot → news |
| `npm run sync:instances` | Rotation + encounters (~20s) |
| `npm run sync:loot` | Items, stats, sources, icons (~8 min; `-- --dungeons` for ~4) |
| `npm run sync:news` | Wowhead feeds (~3s; `-- --force` to bypass the 30-min TTL) |
| `npm run probe` | Re-runs the original API reconnaissance, printing raw shapes |
| `npm run db:studio` | Drizzle Studio against `data/app.db` |

Syncs can also be started from `/sync`. A run already in flight blocks a second one,
from the browser *and* the terminal.

---

## Patch day

Blizzard changes data on patch days, and the failure mode that matters is not a crash —
it is the app continuing to work while producing quietly wrong answers.

```bash
npm run verify
```

Eight checks: `journal-encounter` still carries `items[]`; every stat key is in
`STAT_MAP`; every `inventory_type` maps to a slot; the cloak assumption still holds; the
two rotation sources still agree; `config/season.json` matches the live season; the RSS
feed still parses; a Mythic+ reward curve is identifiable. Non-zero exit means
**do not sync yet**.

### New season

1. `npm run verify` — the rotation check tells you if the sources have both rolled over.
2. Update `config/season.json` with the new season slug (verify names the mismatch).
3. `npm run sync:safe`.

Old data is never deleted. Dungeons that leave the rotation just lose the flag, and
their loot stays browsable.

---

## Documentation

`planning/` is written to be read in order, and is the real explanation of why anything
is the way it is:

| Doc | Contents |
|---|---|
| [00-BRIEF.md](planning/00-BRIEF.md) | The original brief, preserved. Several assumptions in it were wrong. |
| [01-architecture.md](planning/01-architecture.md) | Stack, folder layout, where each source is called |
| [02-data-model.md](planning/02-data-model.md) | Schema, with every column justified |
| [03-etl.md](planning/03-etl.md) | Each sync: inputs, rate limits, failure modes |
| [04-scoring.md](planning/04-scoring.md) | The ranking algorithm, worked by hand on real items |
| [05-ui.md](planning/05-ui.md) | Routes, component tree, empty and error states |
| [06-design-extract.md](planning/06-design-extract.md) | Design tokens |
| [07-steps.md](planning/07-steps.md) | Build steps, each with a definition of done |
| [08-brief-corrections.md](planning/08-brief-corrections.md) | **Every place reality contradicted the brief** |

If you read one, read `08`.

---

## Things that will bite you

Each of these was discovered the hard way and is guarded by a test or a check.

- **`items[].id` is not the item id.** In `journal-encounter`, `entry.id` is the
  *JournalEncounterItem* id; the item id is `entry.item.id`. Using the wrong one poisons
  every join.
- **`is_negated` means "alternative primary", not "absent".** A cloak reports
  `INTELLECT, AGILITY[NEG], STRENGTH[NEG]` because everyone can wear it. Filtering on
  `is_negated = 0` would hide every plate item from a Strength user.
- **Armor-type filtering must be gated on slot.** Cloaks are Cloth subclass. Filtering
  by subclass alone deletes every cloak for a plate wearer.
- **`base_item_level` is not what you will receive.** It is the journal's base value and
  differs wildly across one rotation (219 vs 108). M+ normalises reward ilvl by key
  level. Never display it as a reward prediction.
- **Loot tables contain non-gear** — mounts, recipes, consumables, housing decor. Stored
  so the directory stays honest, flagged so the scorer never sees them.
- **Negative ids are synthetic.** Raidbots injects fake instances *and* fake encounters
  (`-97` "Trash Drop"). Both are filtered.
- **The stat list was not complete.** `COMBAT_RATING_LIFESTEAL` (Leech) only appears on
  raid gear and is a *tertiary*. `npm run verify` is what catches the next one.

---

## The scoring is not a simulation

The Gear Finder answers exactly one question: *given an item's fixed secondary budget,
how much of it lands on the stats you ranked highest?*

It knows nothing about procs, cooldowns, breakpoints, diminishing returns, tier sets or
your rotation. Trinkets and weapons are scored but carry loud warnings, because their
value is dominated by effects stat weights cannot see. Every item links to Wowhead, and
the page links to Raidbots for the real answer.

A known limitation, stated rather than hidden: an item with a single secondary always
scores 100%, because all of its budget is on one stat. The secondary count is shown
beside every score, and ties break toward more secondaries.

---

## Non-commercial personal use

World of Warcraft® and Blizzard Entertainment® are trademarks of Blizzard
Entertainment, Inc.

Data from [Raidbots](https://www.raidbots.com), [Raider.IO](https://raider.io),
[Wowhead](https://www.wowhead.com) and the
[Blizzard Game Data API](https://develop.battle.net).

Blizzard's API terms forbid commercial use without an agreement. Raidbots asks for at
most one request per ten seconds and a backlink; both are honoured.

## Deploying to ZimaOS

`Z:\` is the box's `/DATA`, bridged locally, so the source is copied as a plain file
copy; SSH is only used to tell Docker to rebuild.

```powershell
.\deploy.ps1            # everything
.\deploy.ps1 -Sync      # force a game-data sync even if it looks fresh
.\deploy.ps1 -NoBuild   # skip the image rebuild
```

There is no setup flag and nothing to remember. Every run copies the source, rebuilds,
chowns the data volume, applies pending migrations, and then asks `scripts/data-age.ts`
whether the game data is stale before deciding to sync.

Migrations run every time because `drizzle-kit migrate` is a no-op when nothing is
pending, and the alternative is a deploy that reports success and then serves
`no such column`. The sync is conditional because `sync:all` is ~10 minutes and several
hundred Blizzard requests, so it runs only when a source is missing or older than the
same staleness threshold the in-app banner uses.


Runs at **http://192.168.50.94:8095**. LAN only — do not port-forward it: `/sync` has no
authentication and can start syncs that make hundreds of Blizzard requests.

Four things about this box that the script encodes, each of which broke the first
attempt:

- **`/` is read-only**, so the Docker CLI cannot create `/root/.docker`. `DOCKER_CONFIG`
  is redirected to `/DATA/AppData/.docker`.
- **The bind-mounted `data/` is owned by root**, while the container runs as uid 1001.
  The image's build-time `chown` is masked by the mount, so `-Setup` chowns the host
  directory — without it the migration reports success and writes nothing.
- **`zima_ssh.py` always exits 0** and reports the remote status by printing `--EXIT n--`
  on stderr, so the script matches that string rather than reading `$LASTEXITCODE`.
- **It also caps a command at 300s**, and the loot sync alone takes ~560s, so `-Setup`
  starts the sync detached and polls a log.

`.env.local` is copied once and then excluded from the mirror (`/XF`), so `/MIR` cannot
delete the credentials from the server if the local file ever goes missing.
