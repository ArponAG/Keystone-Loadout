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
| Framework | Next.js 15, App Router, TypeScript | Server Components let pages read SQLite directly with no API layer in between |
| Styling | Tailwind CSS | Tokens defined in `06-design-extract.md` |
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
  layout.tsx                 root shell, footer attribution
  page.tsx                   home / surface picker
  gear/page.tsx              Surface 1 — Build Gear Finder
  loot/page.tsx              Surface 2 — instance grid
  loot/[instanceId]/page.tsx           encounter + loot table
  character/page.tsx         Surface 3 — lookup form + results
  news/page.tsx              Surface 4 — news feed
  sync/page.tsx              admin: sync_runs table, staleness
  api/character/route.ts     the only live third-party passthrough

lib/
  db/
    index.ts                 drizzle client singleton
    schema.ts                table definitions
  blizzard/
    auth.ts                  OAuth token + disk cache + 401 refresh
    client.ts                rate-limited fetch wrapper
  domain/
    stats.ts                 STAT_MAP, SECONDARIES, primary-set extraction
    slots.ts                 INVENTORY_TYPE -> slot, armor-filter applicability
    filters.ts               armor-type + primary eligibility rules
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

data/app.db                  gitignored
planning/                    these documents
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
- ETL scripts are **not** API routes. They are not reachable over HTTP. This prevents
  an accidental page load triggering a 400-request Blizzard sync.

## 5. Rate limiting and etiquette

| Source | Limit | Our policy |
|---|---|---|
| Blizzard | 100 req/s, 36k/hr | 200 ms between calls (5 req/s). A full loot sync ≈ 400 calls ≈ 80 s |
| Raidbots | published: 1 req / 10 s | one call per sync; `Accept-Encoding: gzip`; footer backlink |
| Raider.IO | ~300 req/min | one call per sync; character lookups cached 15 min |
| Wowhead | feed declares `<ttl>30</ttl>` | poll at most every 30 min (brief said 15 — the feed says 30) |

All outbound requests send `User-Agent: KeystoneLoadout/0.1 (personal project)`.

## 6. Failure posture

The app must render from whatever is in the DB, even if every upstream source is down.
A failed sync leaves the previous data intact (see `03-etl.md` — all syncs are
transactional per-instance). The `/sync` page is how you find out something is stale;
nothing in the user-facing surfaces silently blocks on a network call.
