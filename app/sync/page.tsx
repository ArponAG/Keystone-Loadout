import { desc } from 'drizzle-orm';

import { db, dbExists, schema } from '@/lib/db';
import { Banner, EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

const SOURCES = [
  { key: 'instances', command: 'npm run sync:instances' },
  { key: 'loot', command: 'npm run sync:loot' },
  { key: 'news', command: 'npm run sync:news' },
] as const;

const DAY = 86_400_000;

function ago(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < DAY) return `${Math.floor(d / 3_600_000)} h ago`;
  return `${Math.floor(d / DAY)} d ago`;
}

/** Green under a day, amber under a week, red beyond. See planning/05-ui.md §7. */
function staleness(ms: number | null): string {
  if (ms === null) return 'text-ink-faint';
  const d = Date.now() - ms;
  if (d < DAY) return 'text-ok';
  if (d < 7 * DAY) return 'text-stale';
  return 'text-error';
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'text-ok',
  partial: 'text-stale',
  error: 'text-error',
  running: 'text-running',
};

export default async function SyncPage() {
  if (!dbExists()) {
    return (
      <>
        <PageHeader title="Sync" />
        <EmptyState
          title="No database yet"
          body="data/app.db has not been created. Run the migration first."
          command="npx drizzle-kit migrate"
        />
      </>
    );
  }

  const runs = await db
    .select()
    .from(schema.syncRuns)
    .orderBy(desc(schema.syncRuns.startedAt))
    .limit(50);

  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.source)) latest.set(r.source, r);

  // A 'running' row older than 30 minutes almost certainly means a crashed process.
  const crashed = [...latest.values()].filter(
    (r) => r.status === 'running' && Date.now() - r.startedAt > 30 * 60_000,
  );

  return (
    <>
      <PageHeader
        title="Sync"
        lead="What is stale and how to fix it. Read-only — a full loot sync is ~530 Blizzard requests and must not be one click away."
      />

      {crashed.length > 0 ? (
        <div className="mb-6">
          <Banner variant="error">
            {crashed.length === 1 ? 'A sync run appears' : `${crashed.length} sync runs appear`} to
            have crashed — still marked <code className="font-mono">running</code> after 30 minutes.
            The next run will mark {crashed.length === 1 ? 'it' : 'them'} as failed.
          </Banner>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            <tr className="border-b border-line-strong text-xs tracking-wide text-ink-faint uppercase">
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Last run</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Records</th>
              <th className="px-4 py-3 font-medium">Fix</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(({ key, command }) => {
              const run = latest.get(key);
              return (
                <tr key={key} className="border-b border-line last:border-0 hover:bg-raised">
                  <td className="px-4 py-3 text-body text-ink">{key}</td>
                  <td className={`px-4 py-3 text-sm ${staleness(run?.startedAt ?? null)}`}>
                    {run ? ago(run.startedAt) : 'never'}
                  </td>
                  <td className={`px-4 py-3 text-sm ${run ? STATUS_COLOR[run.status] : 'text-ink-faint'}`}>
                    {run?.status ?? '—'}
                  </td>
                  <td className="tabular px-4 py-3 text-sm text-ink-soft">
                    {run?.recordCount ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-sm bg-inset px-2 py-1 font-mono text-xs text-accent">
                      {command}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {runs.some((r) => r.error) ? (
        <div className="mt-6 space-y-2">
          <h2 className="text-h2 text-ink">Recent errors</h2>
          {runs
            .filter((r) => r.error)
            .slice(0, 5)
            .map((r) => (
              <div key={r.id} className="rounded-md border border-line bg-inset p-3">
                <p className="text-xs text-ink-faint">
                  {r.source} · {ago(r.startedAt)}
                </p>
                <pre className="mt-1 overflow-x-auto font-mono text-sm text-error">{r.error}</pre>
              </div>
            ))}
        </div>
      ) : null}
    </>
  );
}
