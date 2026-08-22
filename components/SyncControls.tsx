'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { startSync } from '@/app/sync/actions';
import type { SyncSourceInfo } from '@/lib/sync/registry';

export function SyncButton({
  info,
  isRunning,
}: {
  info: SyncSourceInfo;
  isRunning: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  // Reset the armed state once a run is actually in flight.
  useEffect(() => {
    if (isRunning) setArmed(false);
  }, [isRunning]);

  if (!info.implemented) {
    return (
      <span className="text-xs text-ink-faint" title={`${info.command} does not exist yet`}>
        not built yet
      </span>
    );
  }

  const disabled = pending || isRunning;

  function fire() {
    setError(null);
    setArmed(false);
    startTransition(async () => {
      const result = await startSync(info.source);
      if (!result.ok) setError(result.error);
      // The action creates the sync_runs row before spawning, so this refresh
      // reliably picks up 'running'.
      router.refresh();
    });
  }

  // Expensive syncs use an inline two-step rather than window.confirm: a native
  // dialog blocks the thread and browsers can suppress it outright.
  function onClick() {
    if (info.confirm && !armed) {
      setArmed(true);
      return;
    }
    fire();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={onClick}
        onBlur={() => setArmed(false)}
        disabled={disabled}
        title={info.estimate}
        className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          armed
            ? 'border-stale bg-stale/10 text-stale hover:bg-stale/20'
            : 'border-line-strong bg-raised text-ink hover:border-accent hover:text-accent disabled:hover:border-line-strong disabled:hover:text-ink'
        }`}
      >
        {isRunning ? 'Running…' : pending ? 'Starting…' : armed ? 'Confirm?' : 'Run sync'}
      </button>
      {armed ? <span className="max-w-[13rem] text-xs text-stale">{info.confirm}</span> : null}
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </div>
  );
}

/**
 * While any sync is in flight, refresh the page so the row updates on its own.
 * Polling only exists while something is running — an idle /sync makes no requests.
 */
export function SyncAutoRefresh({ anyRunning }: { anyRunning: boolean }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!anyRunning) return;

    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    const poll = setInterval(() => router.refresh(), 3000);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [anyRunning, router]);

  useEffect(() => {
    if (!anyRunning) setElapsed(0);
  }, [anyRunning]);

  if (!anyRunning) return null;

  return (
    <span className="text-xs text-running">
      live · refreshing every 3s{elapsed > 0 ? ` · ${elapsed}s` : ''}
    </span>
  );
}
