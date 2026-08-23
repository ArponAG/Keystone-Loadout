/**
 * sync_runs lifecycle. Every ETL script wraps its work in `withSyncRun` so that /sync
 * can always answer "what is stale, and did the last run actually finish?".
 *
 * See planning/02-data-model.md (sync_runs) and planning/03-etl.md.
 */
import { and, eq, lt } from 'drizzle-orm';

import { db, schema } from './client';

export type SyncSource = 'instances' | 'loot' | 'news' | 'upgrade-tracks';

/** Every source the app needs before it can rank anything honestly. */
export const REQUIRED_SOURCES: SyncSource[] = ['instances', 'loot', 'news', 'upgrade-tracks'];

/**
 * Older than this and the data is stale.
 *
 * Lives here rather than in freshness.ts because that module carries the `server-only`
 * guard, and the deploy script needs the same number to decide whether to re-sync.
 * Two copies of "7 days" is how the banner and the deploy end up disagreeing.
 */
export const STALE_AFTER_MS = 7 * 86_400_000;

/** A 'running' row older than this is treated as a crashed process. */
const STALE_RUNNING_MS = 30 * 60_000;

export type SyncContext = {
  /** Number of primary records written. Shown on /sync. */
  setRecordCount(n: number): void;
  /**
   * Record a non-fatal problem. Any warning downgrades the final status to 'partial' —
   * "6 of 8 dungeons synced" is a real outcome, not a success and not a failure.
   */
  warn(message: string): void;
  /** Progress logging, so a 110-second loot sync is not a silent terminal. */
  log(message: string): void;
};

/**
 * Mark abandoned runs as errored. A killed process leaves its row at 'running'
 * forever; the next run is what cleans it up.
 */
function reapStaleRuns(source: SyncSource): number {
  const cutoff = Date.now() - STALE_RUNNING_MS;
  const stale = db
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(and(eq(schema.syncRuns.source, source), eq(schema.syncRuns.status, 'running'), lt(schema.syncRuns.startedAt, cutoff)))
    .all();

  for (const row of stale) {
    db.update(schema.syncRuns)
      .set({
        status: 'error',
        finishedAt: Date.now(),
        error: 'Run did not finish — process was killed or crashed. Marked stale by a later run.',
      })
      .where(eq(schema.syncRuns.id, row.id))
      .run();
  }

  return stale.length;
}

/**
 * When /sync starts a script it creates the sync_runs row itself and passes the id in,
 * so the row exists the instant the click returns rather than a second later when the
 * child finishes booting. The child adopts that row instead of opening a second one.
 */
function adoptedRunId(): number | null {
  const arg = process.argv.find((a) => a.startsWith('--run-id='));
  if (!arg) return null;
  const id = Number(arg.slice('--run-id='.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function withSyncRun(
  source: SyncSource,
  fn: (ctx: SyncContext) => Promise<void>,
): Promise<void> {
  const adopted = adoptedRunId();

  // Only reap when we opened the run ourselves; an adopted row is by definition
  // a live one that /sync just created.
  if (adopted === null) {
    const reaped = reapStaleRuns(source);
    if (reaped > 0) {
      console.warn(`[${source}] marked ${reaped} abandoned run(s) as errored.`);
    }

    // sync_runs is shared state, so this lock covers the terminal as well as /sync —
    // two concurrent loot syncs would double every Blizzard request for nothing.
    const inFlight = db
      .select({ id: schema.syncRuns.id, startedAt: schema.syncRuns.startedAt })
      .from(schema.syncRuns)
      .where(and(eq(schema.syncRuns.source, source), eq(schema.syncRuns.status, 'running')))
      .all();

    if (inFlight.length > 0) {
      const age = Math.round((Date.now() - inFlight[0].startedAt) / 1000);
      console.error(
        `[${source}] A sync is already running (run ${inFlight[0].id}, started ${age}s ago).\n` +
          `Wait for it to finish, or check /sync. A run stuck for over 30 minutes is ` +
          `treated as crashed and cleared automatically.`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const startedAt = Date.now();
  const run =
    adopted !== null
      ? { id: adopted }
      : db
          .insert(schema.syncRuns)
          .values({ source, startedAt, status: 'running' })
          .returning({ id: schema.syncRuns.id })
          .all()[0];

  let recordCount = 0;
  const warnings: string[] = [];

  const ctx: SyncContext = {
    setRecordCount: (n) => {
      recordCount = n;
    },
    warn: (message) => {
      warnings.push(message);
      console.warn(`[${source}] WARN ${message}`);
    },
    log: (message) => {
      console.log(`[${source}] ${message}`);
    },
  };

  try {
    await fn(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.update(schema.syncRuns)
      .set({
        status: 'error',
        finishedAt: Date.now(),
        recordCount,
        error: [message, ...warnings].join('\n'),
      })
      .where(eq(schema.syncRuns.id, run.id))
      .run();

    console.error(`[${source}] FAILED: ${message}`);
    process.exitCode = 1;
    return;
  }

  const status = warnings.length > 0 ? 'partial' : 'ok';
  db.update(schema.syncRuns)
    .set({
      status,
      finishedAt: Date.now(),
      recordCount,
      error: warnings.length > 0 ? warnings.join('\n') : null,
    })
    .where(eq(schema.syncRuns.id, run.id))
    .run();

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[${source}] ${status.toUpperCase()} — ${recordCount} records in ${seconds}s` +
      (warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''),
  );

  // 'partial' is a real, non-fatal outcome, so it must not fail CI or sync:all.
}
