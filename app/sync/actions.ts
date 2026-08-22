'use server';

import { spawn } from 'node:child_process';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/lib/db';
import { findSyncSource } from '@/lib/sync/registry';

export type StartSyncResult = { ok: true } | { ok: false; error: string };

/**
 * Start an ETL script from the /sync page.
 *
 * The plan originally made /sync read-only precisely because a loot sync is ~500
 * Blizzard requests and should not be one careless click away. Since it now is, the
 * safety has to live here instead:
 *
 *  - the source is resolved through a hard allowlist, never interpolated into a shell
 *  - a run already in flight blocks a second one, so a double-click cannot double-sync
 *  - the child is detached and its own sync_runs row is the single source of truth for
 *    progress, so a browser refresh or navigation cannot orphan or duplicate the work
 */
export async function startSync(source: string): Promise<StartSyncResult> {
  const info = findSyncSource(source);
  if (!info) {
    return { ok: false, error: `Unknown sync source "${source}".` };
  }
  if (!info.implemented) {
    return { ok: false, error: `${info.label} sync is not built yet.` };
  }

  // Concurrency lock. sync_runs is the shared state, so this also blocks a run started
  // from the terminal — which is the behaviour we want.
  const running = db
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(and(eq(schema.syncRuns.source, info.source), eq(schema.syncRuns.status, 'running')))
    .all();

  if (running.length > 0) {
    return { ok: false, error: `A ${info.label.toLowerCase()} sync is already running.` };
  }

  // Create the row here rather than letting the child do it. Two reasons:
  //  - /sync shows 'running' the instant this returns, instead of a second later
  //    once tsx has finished booting
  //  - it closes the double-click race, where two clicks could both pass the lock
  //    check above because neither child had written its row yet
  const [row] = db
    .insert(schema.syncRuns)
    .values({ source: info.source, startedAt: Date.now(), status: 'running' })
    .returning({ id: schema.syncRuns.id })
    .all();

  const root = process.cwd();
  const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  // execPath + a fixed script path: no shell, nothing from the request reaches argv.
  const child = spawn(process.execPath, [tsx, info.script, `--run-id=${row.id}`], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });

  child.on('error', (e) => {
    console.error(`[sync] failed to spawn ${info.script}:`, e);
    // Otherwise the row would sit at 'running' until the 30-minute reaper.
    db.update(schema.syncRuns)
      .set({ status: 'error', finishedAt: Date.now(), error: `Failed to start: ${e.message}` })
      .where(eq(schema.syncRuns.id, row.id))
      .run();
  });

  // Let the sync outlive the request that started it.
  child.unref();

  revalidatePath('/sync');
  return { ok: true };
}
