/**
 * Build the bonus-id -> upgrade-track table.
 *
 * Why this exists: neither Raider.IO nor Blizzard states an item's upgrade track. Both
 * return an item level and a list of bonus ids, and "Hero 1/6" is derived from those.
 * Wowhead already does that derivation, so this reads it back once and stores the
 * result, keeping the request path free of external calls and HTML parsing.
 *
 * The probe works by asking for one real item with exactly one bonus id applied and
 * reading the "Upgrade Level:" line out of the tooltip. Ids that carry no track — most
 * of them — simply produce no line and are skipped.
 *
 *   npm run sync:upgrade-tracks
 *
 * Re-run after a patch. Track id blocks move, and a stale table would mislabel gear
 * rather than fail loudly, which is the one outcome worth spending a sync to avoid.
 */
import { db, schema } from '../lib/db/client';
import { withSyncRun } from '../lib/db/sync-run';

/**
 * Any item that exists and accepts upgrade bonuses. The probe reads only the tooltip's
 * "Upgrade Level" line, so which item it is does not affect the answer.
 */
const PROBE_ITEM = 251195;

/**
 * The scan window. Wide enough to cover the blocks in play — several are live at once
 * and they drift between patches — while staying a single short run.
 */
const FROM = 12700;
const TO = 12900;

/** Politeness: Wowhead is doing us a favour here. */
const CONCURRENCY = 6;
const RETRIES = 2;

type Row = { bonusId: number; track: string; rank: number; maxRank: number };

async function probe(bonusId: number): Promise<Row | null> {
  const url = `https://nether.wowhead.com/tooltip/item/${PROBE_ITEM}?bonus=${bonusId}&dataEnv=1&locale=0`;

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'KeystoneLoadout/0.1 (personal project)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const body = (await res.json()) as { tooltip?: string };
      const text = (body.tooltip ?? '').replace(/<[^>]+>/g, ' ');
      const m = text.match(/Upgrade Level:\s*([A-Za-z]+)\s*(\d+)\s*\/\s*(\d+)/);
      if (!m) return null;

      return { bonusId, track: m[1], rank: Number(m[2]), maxRank: Number(m[3]) };
    } catch (err) {
      if (attempt === RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  await withSyncRun('upgrade-tracks', async (ctx) => {
    const ids = Array.from({ length: TO - FROM + 1 }, (_, i) => FROM + i);
    const rows: Row[] = [];
    let failures = 0;

    ctx.log(`Probing bonus ids ${FROM}-${TO} against item ${PROBE_ITEM}…`);

    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(probe));

      for (const result of settled) {
        if (result.status === 'rejected') failures += 1;
        else if (result.value) rows.push(result.value);
      }
    }

    if (failures > 0) ctx.warn(`${failures} bonus ids could not be probed`);

    // A run that finds nothing means the probe broke, not that tracks vanished. Keeping
    // the previous table beats replacing it with an empty one, which would silently
    // strip the badge off every item instead of failing where someone would notice.
    if (rows.length === 0) {
      throw new Error('No tracks found — the Wowhead tooltip format may have changed.');
    }

    const syncedAt = Date.now();
    db.delete(schema.upgradeTracks).run();
    for (const row of rows) {
      db.insert(schema.upgradeTracks).values({ ...row, syncedAt }).run();
    }

    const byTrack = [...new Set(rows.map((r) => r.track))]
      .map((t) => `${t} (${rows.filter((r) => r.track === t).length})`)
      .join(', ');
    ctx.log(`Found ${rows.length} track ids — ${byTrack}`);
    ctx.setRecordCount(rows.length);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
