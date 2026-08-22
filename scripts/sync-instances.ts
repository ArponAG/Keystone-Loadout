/**
 * sync:instances — Raidbots + Raider.IO -> instances, encounters
 *
 * See planning/03-etl.md §1. This is an all-or-nothing sync: both fetches must
 * succeed and the rotation cross-check must pass before anything is written.
 */
import { sql } from 'drizzle-orm';

import { blizzOrNull, fetchInstanceTileUrl } from '../lib/blizzard/client';
import { db, schema } from '../lib/db/client';
import { withSyncRun } from '../lib/db/sync-run';
import season from '../config/season.json';

const RAIDBOTS_INSTANCES = 'https://www.raidbots.com/static/data/live/instances.json';
const RIO_STATIC = 'https://raider.io/api/v1/mythic-plus/static-data';
const UA = 'KeystoneLoadout/0.1 (personal project)';

// ------------------------------------------------------------------ source types

type RaidbotsEncounter = { id: number; name: string; icon?: string; order?: number };
type RaidbotsInstance = {
  id: number;
  name: string;
  type: string;
  image_button?: string;
  order?: number;
  encounters?: RaidbotsEncounter[];
};

type RioSeason = {
  slug: string;
  is_main_season: boolean;
  starts: { us: string };
  ends: { us: string };
  dungeons: { name: string; slug: string }[];
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return (await res.json()) as T;
}

// ----------------------------------------------------------------------- sync

async function run() {
  await withSyncRun('instances', async (ctx) => {
    // --- 1. Raidbots: the instance/encounter spine -------------------------
    ctx.log('Fetching Raidbots instances.json...');
    const all = await getJson<RaidbotsInstance[]>(RAIDBOTS_INSTANCES);

    // Most entries are synthetic droptimizer categories (catalyst, pvp, delves,
    // profession gear) carrying NEGATIVE ids. Only positive-id dungeon/raid entries
    // are real journal instances.
    const real = all.filter(
      (i) => (i.type === 'dungeon' || i.type === 'raid') && i.id > 0,
    );
    ctx.log(`${all.length} entries -> ${real.length} real instances.`);

    if (real.length === 0) {
      throw new Error('Raidbots returned no real instances. Refusing to wipe the DB.');
    }

    // The 'mplus-chest' aggregate lists the season's M+ POOL. Its "encounters" are
    // dungeons, not bosses, and they carry journal-instance ids — which is exactly
    // why we take rotation ids from here rather than from Raider.IO.
    const pool = all.find((i) => i.type === 'mplus-chest');
    if (!pool?.encounters?.length) {
      throw new Error('Raidbots mplus-chest entry missing — cannot determine rotation.');
    }
    const rotationIds = new Set(pool.encounters.map((e) => e.id));
    const rotationNames = new Set(pool.encounters.map((e) => e.name));

    // --- 2. Raider.IO: season metadata + independent rotation --------------
    ctx.log('Fetching Raider.IO season data...');
    const rio = await getJson<{ seasons: RioSeason[] }>(
      `${RIO_STATIC}?expansion_id=${season.expansion.raiderIoExpansionId}`,
    );

    const now = Date.now();
    const current = rio.seasons.find(
      (s) => s.is_main_season && Date.parse(s.starts.us) <= now && Date.parse(s.ends.us) > now,
    );
    if (!current) {
      throw new Error('No current Raider.IO season matched today. Check config/season.json.');
    }
    ctx.log(`Current season: ${current.slug} (started ${current.starts.us}).`);

    if (current.slug !== season.season.slug) {
      ctx.warn(
        `config/season.json says "${season.season.slug}" but Raider.IO reports ` +
          `"${current.slug}". Update config/season.json.`,
      );
    }

    // --- 3. Cross-check: the season-rollover tripwire ----------------------
    // If these disagree, one source has rolled to a new season and the other has not.
    // Syncing loot in that window would populate the wrong dungeons.
    const rioNames = new Set(current.dungeons.map((d) => d.name));
    const onlyRio = [...rioNames].filter((n) => !rotationNames.has(n));
    const onlyRaidbots = [...rotationNames].filter((n) => !rioNames.has(n));

    if (onlyRio.length > 0 || onlyRaidbots.length > 0) {
      throw new Error(
        'Rotation mismatch between Raidbots and Raider.IO — refusing to sync.\n' +
          `  Raider.IO only: ${onlyRio.join(', ') || '(none)'}\n` +
          `  Raidbots only:  ${onlyRaidbots.join(', ') || '(none)'}\n` +
          'One source has rolled over to a new season. Re-run once both agree.',
      );
    }
    ctx.log(`Rotation cross-check passed — ${rioNames.size} dungeons agree.`);

    // --- 4. Blizzard: expansion id, canonical order, zone art --------------
    // Raidbots carries neither expansion nor artwork. Two calls per instance.
    ctx.log(`Fetching Blizzard metadata for ${real.length} instances...`);
    const meta = new Map<number, { expansionId: number | null; orderIndex: number | null; tileUrl: string | null }>();

    for (const inst of real) {
      const detail = await blizzOrNull<{
        expansion?: { id: number };
        order_index?: number;
      }>(`/data/wow/journal-instance/${inst.id}`);

      let tileUrl: string | null = null;
      try {
        tileUrl = await fetchInstanceTileUrl(inst.id);
      } catch (e) {
        ctx.warn(`No zone art for ${inst.name} (${inst.id}): ${String(e)}`);
      }

      if (!detail) ctx.warn(`Blizzard has no journal-instance ${inst.id} (${inst.name}).`);

      meta.set(inst.id, {
        expansionId: detail?.expansion?.id ?? null,
        orderIndex: detail?.order_index ?? inst.order ?? null,
        tileUrl,
      });
    }

    // --- 5. Write, in one transaction -------------------------------------
    const syncedAt = Date.now();
    let encounterCount = 0;

    db.transaction((tx) => {
      // Clear rotation flags first: a dungeon dropped from the pool must lose its
      // badge, but is never hard-deleted — old loot stays browsable.
      tx.update(schema.instances).set({ inCurrentRotation: 0 }).run();

      for (const inst of real) {
        const m = meta.get(inst.id)!;

        tx.insert(schema.instances)
          .values({
            id: inst.id,
            name: inst.name,
            type: inst.type,
            expansionId: m.expansionId,
            imageButton: inst.image_button ?? null,
            tileUrl: m.tileUrl,
            orderIndex: m.orderIndex,
            inCurrentRotation: rotationIds.has(inst.id) ? 1 : 0,
            syncedAt,
          })
          .onConflictDoUpdate({
            target: schema.instances.id,
            set: {
              name: inst.name,
              type: inst.type,
              expansionId: m.expansionId,
              imageButton: inst.image_button ?? null,
              // Keep a previously-fetched tile if this run failed to get one.
              tileUrl: sql`COALESCE(${m.tileUrl}, ${schema.instances.tileUrl})`,
              orderIndex: m.orderIndex,
              inCurrentRotation: rotationIds.has(inst.id) ? 1 : 0,
              syncedAt,
            },
          })
          .run();

        for (const enc of inst.encounters ?? []) {
          tx.insert(schema.encounters)
            .values({
              id: enc.id,
              instanceId: inst.id,
              name: enc.name,
              icon: enc.icon ?? null,
              orderIndex: enc.order ?? null,
            })
            .onConflictDoUpdate({
              target: schema.encounters.id,
              set: {
                instanceId: inst.id,
                name: enc.name,
                icon: enc.icon ?? null,
                orderIndex: enc.order ?? null,
              },
            })
            .run();
          encounterCount += 1;
        }
      }
    });

    ctx.setRecordCount(real.length);
    ctx.log(`Wrote ${real.length} instances and ${encounterCount} encounters.`);
    ctx.log(`In current rotation: ${rotationIds.size}.`);
  });
}

run();
