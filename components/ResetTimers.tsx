'use client';

import { useEffect, useState } from 'react';

import {
  RESET_ANCHORS,
  RESET_REGIONS,
  formatCountdown,
  nextReset,
  resetProgress,
  type ResetKind,
  type ResetRegion,
} from '@/lib/domain/reset';

const STORAGE_KEY = 'keystone.resetTimers.minimised';

/** Weekly and daily read as a pair, so they get one colour each rather than a palette. */
const KIND_COLOUR: Record<ResetKind, string> = {
  weekly: 'var(--color-track-veteran)',
  daily: 'var(--color-track-champion)',
};

/** Under this much left, the countdown starts insisting. */
const URGENT_MS = 60 * 60_000;

/**
 * Reset countdowns, pinned bottom-right on every page.
 *
 * Rendered entirely on the client. The countdown depends on the current second, so
 * server-rendering it would guarantee a hydration mismatch and a flash of stale numbers;
 * `mounted` keeps the markup empty until the browser owns it.
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
    // One timer for the whole panel rather than one per row: every countdown ticks off
    // the same second, and separate intervals would drift apart visibly.
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

  // The single most urgent number, so collapsing the panel does not mean losing the
  // information entirely.
  const soonest = RESET_REGIONS.flatMap((region) =>
    (['daily', 'weekly'] as ResetKind[]).map((kind) => ({
      region,
      kind,
      at: nextReset(region, kind, now),
    })),
  ).sort((a, b) => a.at - b.at)[0];

  if (minimised) {
    const remaining = soonest.at - now;
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        title="Show weekly and daily reset timers"
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full border border-line bg-surface/95 py-2 pr-4 pl-2.5 shadow-lg backdrop-blur transition-colors hover:border-line-strong"
      >
        <Ring
          progress={resetProgress(soonest.region, soonest.kind, now)}
          colour={KIND_COLOUR[soonest.kind]}
          size={22}
        />
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
          {RESET_ANCHORS[soonest.region].label} {soonest.kind}
        </span>
        <span
          className="tabular text-sm font-bold"
          style={{ color: remaining < URGENT_MS ? 'var(--color-stale)' : KIND_COLOUR[soonest.kind] }}
        >
          {formatCountdown(remaining)}
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label="Weekly and daily reset timers"
      className="fixed right-4 bottom-4 z-40 w-[17.5rem] overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="flex-1 text-[10px] font-semibold tracking-[0.12em] text-ink-faint uppercase">
          Reset timers
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded
          aria-label="Minimise reset timers"
          title="Minimise"
          className="-mr-1 grid h-6 w-6 place-items-center rounded-md text-ink-faint transition-colors hover:bg-raised hover:text-ink"
        >
          {/* A minus, not a cross: this collapses to a pill rather than closing, and a
              cross would promise a dismissal that does not happen. */}
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" d="M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="space-y-1.5 px-3 pb-3">
        {RESET_REGIONS.map((region) => (
          <section key={region} className="rounded-xl bg-raised/40 px-3 py-2.5">
            <h3 className="mb-2 text-[10px] font-bold tracking-[0.14em] text-ink-soft uppercase">
              {RESET_ANCHORS[region].label}
            </h3>
            <div className="space-y-2.5">
              {(['weekly', 'daily'] as ResetKind[]).map((kind) => (
                <Row key={kind} region={region} kind={kind} now={now} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

function Row({ region, kind, now }: { region: ResetRegion; kind: ResetKind; now: number }) {
  const at = nextReset(region, kind, now);
  const remaining = at - now;
  const colour = KIND_COLOUR[kind];

  // The last hour is where the number stops being trivia and starts being a decision,
  // so it changes colour rather than merely getting smaller.
  const urgent = remaining < URGENT_MS;

  return (
    <div className="flex items-center gap-2.5">
      <Ring progress={resetProgress(region, kind, now)} colour={colour} size={26} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: colour }}
          >
            {kind}
          </span>
          <span
            className="tabular text-[13px] leading-none font-bold"
            style={{ color: urgent ? 'var(--color-stale)' : 'var(--color-ink)' }}
          >
            {formatCountdown(remaining)}
          </span>
        </div>
        {/* Rendered from the raw instant so it lands in the reader's own timezone, not
            whichever one the server happens to run in. */}
        <div className="tabular mt-0.5 text-[10px] text-ink-faint">
          {new Date(at).toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * How far through the current period we are.
 *
 * A ring rather than a bar: it reads at a glance without needing a width to compare
 * against, and it sits naturally beside a two-line row where a full-width bar would add
 * a third. The digits still carry the precision; this only answers "nearly there?".
 */
function Ring({ progress, colour, size }: { progress: number; colour: string; size: number }) {
  const stroke = size <= 22 ? 2.5 : 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={colour}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        // Start at twelve o'clock and fill clockwise, like every other timer.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
