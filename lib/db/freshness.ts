import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { db, schema } from './client';
import type { SyncSource } from './sync-run';

/**
 * How trustworthy is the data currently on screen?
 *
 * The gear finder will happily rank a half-synced or month-old dataset and give no
 * indication — the numbers look identical either way. That is exactly the failure this
 * project keeps guarding against, so surfaces that present ranked data ask here first.
 */
export const STALE_AFTER_MS = 7 * 86_400_000;

export type Freshness = {
  /** Null when this source has never run. */
  lastRunAt: number | null;
  status: 'ok' | 'partial' | 'error' | 'running' | null;
  /** Non-fatal problems from the last run, one per line. */
  warnings: string[];
  running: boolean;
  stale: boolean;
  /** Instances that hold loot, versus instances expected to. */
  covered?: { withLoot: number; expected: number };
};

export async function readFreshness(source: SyncSource): Promise<Freshness> {
  const [run] = await db
    .select()
    .from(schema.syncRuns)
    .where(eq(schema.syncRuns.source, source))
    .orderBy(desc(schema.syncRuns.startedAt))
    .limit(1);

  if (!run) {
    return { lastRunAt: null, status: null, warnings: [], running: false, stale: false };
  }

  return {
    lastRunAt: run.startedAt,
    status: run.status as Freshness['status'],
    // 'partial' stores its warnings in `error`; they are the per-instance failures.
    warnings: run.status === 'ok' ? [] : (run.error ?? '').split('\n').filter(Boolean),
    running: run.status === 'running',
    stale: Date.now() - run.startedAt > STALE_AFTER_MS,
  };
}

/**
 * Loot coverage, counted from the data rather than trusted from the sync log — a run
 * that reported 'ok' weeks ago tells you nothing about a dungeon added since.
 */
export async function readLootCoverage(): Promise<{ withLoot: number; expected: number }> {
  const expected = await db
    .select({ id: schema.instances.id })
    .from(schema.instances)
    .where(eq(schema.instances.inCurrentRotation, 1));

  const withLoot = new Set(
    (
      await db
        .selectDistinct({ instanceId: schema.itemSources.instanceId })
        .from(schema.itemSources)
    )
      .map((r) => r.instanceId)
      .filter((id): id is number => id !== null),
  );

  return {
    expected: expected.length,
    withLoot: expected.filter((i) => withLoot.has(i.id)).length,
  };
}

export function describeAge(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} minutes ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} hours ago`;
  const days = Math.floor(d / 86_400_000);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
