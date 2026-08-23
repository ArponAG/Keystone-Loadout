'use client';

import { useEffect, useState } from 'react';

import {
  RESET_ANCHORS,
  RESET_REGIONS,
  formatCountdown,
  nextReset,
  type ResetKind,
  type ResetRegion,
} from '@/lib/domain/reset';

const STORAGE_KEY = 'keystone.resetTimers.minimised';

/** Weekly and daily read as a pair, so they get one colour each rather than one palette. */
const KIND_COLOUR: Record<ResetKind, string> = {
  weekly: 'var(--color-track-veteran)',
  daily: 'var(--color-track-champion)',
};

/**
 * Reset countdowns, pinned bottom-right on every page.
 *
 * Rendered entirely on the client. The countdown depends on the current second, so
 * server-rendering it would guarantee a hydration mismatch and a flash of stale numbers;
 * `mounted` keeps the markup empty until the browser owns it.
 *
 * The absolute time is shown alongside every countdown deliberately. "1d 22h" answers
 * "how long", but the thing people actually plan around is "which evening", and only a
 * real timestamp in the reader's own timezone answers that.
 */
export function ResetTimers() {
  const [mounted, setMounted] = useState(false);
  const [minimised, setMinimised] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    try {
      setMinimised(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Storage disabled. The panel simply opens expanded each visit.
    }
  }, []);

  useEffect(() => {
    // One timer for the whole panel rather than one per row: eight countdowns tick off
    // the same second, and eight intervals would drift apart visibly.
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function toggle() {
    const next = !minimised;
    setMinimised(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Not persisting is survivable; the toggle still works for this session.
    }
  }

  if (!mounted) return null;

  // The single most urgent number, used as the collapsed label so minimising does not
  // mean losing the information entirely.
  const soonest = RESET_REGIONS.flatMap((region) =>
    (['daily', 'weekly'] as ResetKind[]).map((kind) => ({
      region,
      kind,
      at: nextReset(region, kind, now),
    })),
  ).sort((a, b) => a.at - b.at)[0];

  if (minimised) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        title="Show weekly and daily reset timers"
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-xl border border-line bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur transition-colors hover:border-line-strong"
      >
        <ClockIcon />
        <span className="font-medium text-ink-soft">
          {RESET_ANCHORS[soonest.region].label} {soonest.kind}
        </span>
        <span className="tabular font-semibold" style={{ color: KIND_COLOUR[soonest.kind] }}>
          {formatCountdown(soonest.at - now)}
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Weekly and daily reset timers"
      className="fixed right-4 bottom-4 z-40 w-[19rem] overflow-hidden rounded-xl border border-line bg-surface/95 shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <ClockIcon />
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-ink uppercase">
          Reset timers
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded
          aria-label="Minimise reset timers"
          title="Minimise"
          className="grid h-6 w-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-raised hover:text-ink"
        >
          {/* A minus, not an X: the panel collapses to a pill rather than closing, and a
              cross would promise a dismissal that does not happen. */}
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="divide-y divide-line">
        {RESET_REGIONS.map((region) => (
          <RegionRow key={region} region={region} now={now} />
        ))}
      </div>
    </aside>
  );
}

function RegionRow({ region, now }: { region: ResetRegion; now: number }) {
  const anchor = RESET_ANCHORS[region];

  return (
    <div className="flex gap-3 px-3.5 py-2.5">
      <span className="w-7 shrink-0 pt-0.5 text-xs font-bold tracking-wide text-ink-faint">
        {anchor.label}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        {(['weekly', 'daily'] as ResetKind[]).map((kind) => (
          <Row key={kind} region={region} kind={kind} now={now} />
        ))}
      </div>
    </div>
  );
}

function Row({ region, kind, now }: { region: ResetRegion; kind: ResetKind; now: number }) {
  const at = nextReset(region, kind, now);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[10px] font-semibold tracking-wider uppercase"
          style={{ color: KIND_COLOUR[kind] }}
        >
          {kind}
        </span>
        <span className="tabular text-sm font-semibold" style={{ color: KIND_COLOUR[kind] }}>
          {formatCountdown(at - now)}
        </span>
      </div>
      {/* Rendered from the raw instant, so it lands in the reader's own timezone rather
          than in whatever zone the server happens to run in. */}
      <div className="tabular text-[10px] text-ink-faint">
        {new Date(at).toLocaleString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-ink-faint"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
  );
}
