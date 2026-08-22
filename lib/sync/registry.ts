/**
 * The allowlist of things /sync is permitted to run.
 *
 * This is a hard allowlist, not a convenience map. The source name arrives from a
 * browser request, and it is used to pick a script to execute — so it must never be
 * interpolated into a command. Only keys present here can run, and the script path is
 * taken from this table rather than from the request.
 */
import type { SyncSource } from '@/lib/db/sync-run';

export type SyncSourceInfo = {
  source: SyncSource;
  label: string;
  /** Path relative to the project root. Never derived from user input. */
  script: string;
  command: string;
  /** False until the script exists — the button renders disabled. */
  implemented: boolean;
  /** Roughly how long a run takes, shown in the UI so a 2-minute wait is expected. */
  estimate: string;
  /** Expensive runs ask for confirmation before starting. */
  confirm?: string;
};

export const SYNC_SOURCES: SyncSourceInfo[] = [
  {
    source: 'instances',
    label: 'Instances',
    script: 'scripts/sync-instances.ts',
    command: 'npm run sync:instances',
    implemented: true,
    estimate: '~20s, 40 requests',
  },
  {
    source: 'loot',
    label: 'Loot',
    script: 'scripts/sync-loot.ts',
    command: 'npm run sync:loot',
    implemented: true,
    estimate: '~2-4 min, ~500 requests',
    confirm:
      'A full loot sync makes roughly 500 requests to Blizzard and takes a few minutes. Start it?',
  },
  {
    source: 'news',
    label: 'News',
    script: 'scripts/sync-news.ts',
    command: 'npm run sync:news',
    implemented: false,
    estimate: '~2s, 2 requests',
  },
];

export function findSyncSource(source: string): SyncSourceInfo | undefined {
  return SYNC_SOURCES.find((s) => s.source === source);
}
