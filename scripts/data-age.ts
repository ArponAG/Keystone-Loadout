/**
 * Does the deployed data need a sync?
 *
 * Exists so `deploy.ps1` can decide for itself instead of relying on someone to
 * remember a flag. Syncing on every deploy would be wrong — `sync:all` is ~10 minutes
 * and several hundred Blizzard requests — and syncing never is how a box quietly serves
 * last season's dungeons after a patch. So the deploy asks.
 *
 * Exit code IS the answer, because that is what a shell can branch on:
 *   0  every source present and fresh   -> deploy does nothing
 *   1  something missing or stale       -> deploy runs sync:all
 *
 * Reuses STALE_AFTER_MS from the sync module, the same threshold the /gear staleness
 * banner uses. A second definition here is how the banner and the deploy start
 * disagreeing about what "stale" means.
 */
import { desc, eq } from 'drizzle-orm';

import { db, schema } from '../lib/db/client';
import { REQUIRED_SOURCES, STALE_AFTER_MS } from '../lib/db/sync-run';

const DAY = 86_400_000;

function main() {
  const problems: string[] = [];

  for (const source of REQUIRED_SOURCES) {
    // The newest run that actually produced data. 'partial' counts: "6 of 8 dungeons"
    // is stale-ish but it is not nothing, and re-syncing on every deploy because one
    // dungeon warned would be its own bug.
    const [run] = db
      .select({ startedAt: schema.syncRuns.startedAt, status: schema.syncRuns.status })
      .from(schema.syncRuns)
      .where(eq(schema.syncRuns.source, source))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(1)
      .all();

    if (!run || (run.status !== 'ok' && run.status !== 'partial')) {
      problems.push(`${source}: never synced successfully`);
      continue;
    }

    const age = Date.now() - run.startedAt;
    const days = (age / DAY).toFixed(1);

    if (age > STALE_AFTER_MS) {
      problems.push(`${source}: ${days} days old`);
    } else {
      console.log(`  ${source}: ${days} days old, fresh`);
    }
  }

  if (problems.length > 0) {
    console.log('Sync needed:');
    for (const p of problems) console.log(`  ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log('All sources fresh - no sync needed.');
}

main();
