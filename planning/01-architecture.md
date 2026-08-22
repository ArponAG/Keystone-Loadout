# 01 — Architecture

> Written from `scripts/probe.ts` output, 2026-08-22. Where this contradicts
> `00-BRIEF.md`, the probe wins; see `planning/08-brief-corrections.md`.

## 1. Shape of the problem

This is a **read-mostly app over a slowly-changing dataset**. The entire season's
dungeon loot is roughly 300–400 items. It changes on patch days, not on page loads.

That single fact determines everything below: we do not proxy third-party APIs at
request time. We ETL into SQLite on demand, and every page render reads only SQLite.

```
 ┌──────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────────┐
 │ Raidbots     │   │ Blizzard     │   │ Raider.IO   │   │ Wowhead RSS  │
 │ instances    │   │ Game Data    │   │ static-data │   │ retail feed  │
 └──────┬───────┘   └──────┬───────┘   └──────┬──────┘   └──────┬───────┘
        │                  │                  │                 │
        │      ══════ ETL scripts, run manually / on demand ═════│
        ▼                  ▼                  ▼                 ▼
   sync:instances     sync:loot         sync:season        sync:news
        └──────────────────┴──────────────────┴─────────────────┘
                                  │
                                  ▼
                        ┌───────────────────┐
                        │  data/app.db      │   ← the only thing the app reads
                        │  (SQLite/Drizzle) │
                        └─────────┬─────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
            Server Components            Route Handlers
            (read DB directly)           (/api/character — the one
                                          live passthrough, cached 15m)
```

**The one exception** to "everything comes from the DB": Raider.IO character lookup.
A character's gear changes minute to minute, so it cannot be pre-synced. It goes
through a Route Handler with a 15-minute DB-backed cache, never from the browser.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js **16**, App Router, TypeScript | Server Components let pages read SQLite directly with no API layer in between. *(Brief said 15; 16 was current at scaffold time and is App Router either way.)* |
| Styling | Tailwind **v4** | Theme lives in `app/globals.css` via `@theme` — v4 has no `tailwind.config.ts`. See `06-design-extract.md` §7 |
| DB | SQLite via `better-sqlite3` | Single file. Nuke and re-sync on patch day is `rm data/app.db && npm run sync:all` |
| ORM | Drizzle | Typed schema, driver-agnostic; a MySQL swap is a config change |
| XML | `fast-xml-parser` | RSS only |
| Scripts | `tsx` | ETL runs standalone, outside Next |

**Why SQLite and not Postgres:** single user, single machine, read-mostly, ~400 rows
of interesting data. A server would be pure operational overhead. Drizzle keeps the
exit door open.

## 3. Folder layout

```
app/
  globals.css                Tailwind v4 @theme — the design tokens live here
  layout.tsx                 root shell, header + footer attribution
  not-found.tsx              404
  page.tsx                   home / surface picker
  gear/page.tsx              Surface 1 — Build Gear Finder
  loot/page.tsx              Surface 2 — instance grid
  loot/[instanceId]/page.tsx           encounter + loot table
  character/page.tsx         Surface 3 — lookup form + results
  news/page.tsx              Surface 4 — news feed
  sync/page.tsx              admin: sync_runs table, staleness
  api/character/route.ts     the only live third-party passthrough

components/
  SiteHeader.tsx             nav + season badge (reads config/season.json)
  SiteFooter.tsx             required attribution + source backlinks
  WowIcon.tsx                icon tile with question-mark CSS fallback
  ui.tsx                     PageHeader, EmptyState, Banner, Badge

lib/
  db/
    client.ts                connection + drizzle instance (NO server-only guard);
                             dbReady() checks the SCHEMA, not the file — see below
    index.ts                 server-only re-export of client.ts — app code imports this
    schema.ts                table definitions
    sync-run.ts              sync_runs lifecycle + stale-'running' reaping
  blizzard/
    auth.ts                  OAuth token + disk cache + 401 refresh
    client.ts                rate-limited fetch wrapper
  domain/
    stats.ts                 STAT_MAP, SECONDARIES, primary-set extraction
    slots.ts                 INVENTORY_TYPE -> slot, armor-filter applicability
    icons.ts                 CDN URL builders, quality colours, outbound links
    filters.ts               armor-type + primary eligibility rules
  raiderio/
    shape.ts                 pure shaping/normalisation — NO db import, so it is testable
    character.ts             lookup + 15-min cache; re-exports shape.ts
  scoring/
    score.ts                 fitScore
    score.test.ts            fixtures from real probe items

config/
  scoring.ts                 RANK_WEIGHTS — tunable
  season.json                hand-maintained: current season slug, ilvl table

scripts/
  probe.ts                   Session 1 evidence (this exists)
  verify-assumptions.ts      re-runs probe checks, exits non-zero on drift
  sync-instances.ts
  sync-loot.ts
  sync-news.ts

drizzle/                     generated SQL migrations (committed)
data/app.db                  gitignored, alongside the WAL files and token cache
planning/                    these documents

Dockerfile                   multi-stage LAN deployment; data/ is a volume
docker-compose.yml           reads .env.local via env_file (NOT ${VAR} interpolation)
next.config.ts               serverExternalPackages: ['better-sqlite3'] — native module
postcss.config.mjs           @tailwindcss/postcss
drizzle.config.ts            schema path + sqlite dialect
.claude/launch.json          dev-server config for the preview tooling
```

## 4. Where each source is called — and nowhere else

| Source | Called from | Never called from |
|---|---|---|
| Blizzard Game Data | `scripts/sync-loot.ts` only | app code, route handlers, components |
| Raidbots `instances.json` | `scripts/sync-instances.ts` only | anywhere else |
| Raider.IO static-data | `scripts/sync-instances.ts` only | anywhere else |
| Raider.IO character profile | `app/api/character/route.ts` only | components (fetch via the route) |
| Wowhead RSS | `scripts/sync-news.ts` only | anywhere else |

**Hard rules**

- `BLIZZARD_CLIENT_SECRET` lives in `.env.local`, never prefixed `NEXT_PUBLIC_`.
  It is read only by `lib/blizzard/auth.ts`, which is only imported by ETL scripts.
- No React component performs a cross-origin `fetch`. CORS would block Wowhead and
  Raidbots anyway; the rule is about the secret and about not hammering third parties.
- **One deliberate exception: Wowhead's tooltip embed** loads client-side. It touches
  neither concern above — no credentials, no polling — and it earns its place by
  rendering the *real* in-game tooltip, including bonus IDs, gems, enchants and upgrade
  track. Our schema models none of that, so a homegrown tooltip would show base stats
  and be quietly wrong for every upgraded item on the character page. Wowhead is
  credited in the footer. See `05-ui.md` §5.3.
- ETL scripts are **not** API routes, and no page render can trigger one. They can be
  started from `/sync` by an explicit click (a Server Action spawns the script as a
  detached child process), but never by a GET. See `05-ui.md` §7 for the safety rules
  around that, which replaced the original "read-only admin page" decision.
- **`lib/db` is split in two, and the split is not cosmetic.** The `server-only`
  package throws unconditionally when imported under plain Node, so an ETL script that
  imports it crashes on startup. `lib/db/client.ts` therefore holds the connection with
  no guard, and `lib/db/index.ts` re-exports it behind `import 'server-only'`.
  App code imports `@/lib/db`; scripts import `../lib/db/client`. Do not "tidy" these
  back together — the guard is what makes importing the DB from a Client Component a
  build error rather than a runtime surprise.
- **`lib/raiderio` is split for the same reason.** `character.ts` imports `@/lib/db`, so
  anything importing it inherits the `server-only` guard and cannot run under plain
  Node. The pure shaping and normalisation live in `shape.ts` with no DB import, which
  is what makes them unit-testable; `character.ts` re-exports them so callers see one
  module.

## 5. Rate limiting and etiquette

| Source | Limit | Our policy |
|---|---|---|
| Blizzard | 100 req/s, 36k/hr | 200 ms between calls (5 req/s). A full loot sync ≈ 400 calls ≈ 80 s |
| Raidbots | published: 1 req / 10 s | one call per sync; `Accept-Encoding: gzip`; footer backlink |
| Raider.IO | ~300 req/min | one call per sync; character lookups cached 15 min |
| Wowhead | feed declares `<ttl>30</ttl>` | poll at most every 30 min (brief said 15 — the feed says 30) |

All outbound requests send `User-Agent: KeystoneLoadout/0.1 (personal project)`.

## 5b. First run

`dbReady()` asks the schema whether table `instances` exists; it deliberately does not
ask the filesystem whether `data/app.db` exists.

That distinction was a real bug. `better-sqlite3` **creates** the database on connect,
so a fresh clone ended up holding a 4 KB file with zero tables. `existsSync` returned
true, every carefully written "run the migration" empty state was skipped, and four
pages served a raw 500 reading `no such table: instances` — the first thing anyone
cloning the repo would see.

The check is memoised only once true, so the app starts working the moment migrations
run, with no restart. API routes return 503 with the command to run, and `app/error.tsx`
is a last-resort boundary that recognises schema errors and prints the fix instead of a
stack trace.

## 6. Failure posture

The app must render from whatever is in the DB, even if every upstream source is down.
A failed sync leaves the previous data intact (see `03-etl.md` — all syncs are
transactional per-instance). The `/sync` page is how you find out something is stale;
nothing in the user-facing surfaces silently blocks on a network call.
