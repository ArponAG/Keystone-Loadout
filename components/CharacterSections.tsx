'use client';

import { useState } from 'react';

import { WowIcon } from '@/components/WowIcon';
import { slugIconUrl } from '@/lib/domain/icons';
import type { MythicPlus, TalentBuild, TalentPick, TalentTree } from '@/lib/raiderio/character';

// ------------------------------------------------------------ Mythic+ card

function Tile({
  value,
  label,
  sub,
  colour,
}: {
  value: string | number;
  label: string;
  sub?: string;
  colour?: string;
}) {
  return (
    <div className="rounded-xl bg-surface/70 px-4 py-3 text-center">
      <div className="tabular text-h1" style={{ color: colour ?? 'var(--color-ink)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] tracking-wide text-ink-soft uppercase">{label}</div>
      {sub ? <div className="text-[11px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function MythicPlusProgression({
  mplus,
  role,
}: {
  mplus: MythicPlus;
  role: string;
}) {
  return (
    <section>
      <h3 className="mb-3 text-h2 font-semibold text-ink">Mythic+ Progression</h3>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Raider.IO's own tier colour for the score — the same green/orange their site uses. */}
        <Tile
          value={mplus.score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          label={role || 'Score'}
          sub="Mythic+ score"
          colour={mplus.colour}
        />
        <Tile value={mplus.timedRuns} label="Timed" sub="of best runs" />
        <Tile value={mplus.highestKey > 0 ? `+${mplus.highestKey}` : '—'} label="Highest" sub="key completed" />
        {mplus.ranks ? (
          <Tile
            value={mplus.ranks.realm > 0 ? `#${mplus.ranks.realm}` : '—'}
            label="Realm"
            sub={mplus.ranks.region > 0 ? `#${mplus.ranks.region} region` : undefined}
          />
        ) : null}
      </div>

      {mplus.bestRuns.length === 0 ? (
        <p className="rounded-xl bg-surface/70 px-4 py-6 text-center text-sm text-ink-faint">
          No Mythic+ runs recorded this season.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-surface/70">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr className="text-[10px] tracking-wider text-ink-faint uppercase">
                <th className="px-4 pt-3 pb-2 font-medium">Dungeon</th>
                <th className="px-4 pt-3 pb-2 font-medium">Key</th>
                <th className="px-4 pt-3 pb-2 font-medium">Time</th>
                <th className="px-4 pt-3 pb-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {mplus.bestRuns.map((run) => {
                const timed = run.upgrades > 0;
                // How much of the par time was used. Under 1 is a timed key, and the
                // closer to 1 the nearer it was to depleting — which is the thing you
                // actually want to see when deciding what you can push.
                const ratio = run.parTimeMs > 0 ? run.clearTimeMs / run.parTimeMs : 1;

                return (
                  <tr key={run.dungeon} className="transition-colors hover:bg-raised">
                    <td className="px-4 py-2 text-sm text-ink">
                      <a href={run.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {run.dungeon}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="tabular rounded-md px-1.5 py-0.5 text-xs font-semibold"
                        style={{
                          color: timed ? 'var(--color-ok)' : 'var(--color-ink-soft)',
                          backgroundColor: timed
                            ? 'color-mix(in srgb, var(--color-ok) 15%, transparent)'
                            : 'var(--color-raised)',
                        }}
                        title={timed ? `Timed with ${run.upgrades} upgrade${run.upgrades > 1 ? 's' : ''}` : 'Completed over time'}
                      >
                        +{run.level}
                        {timed ? ` ${'+'.repeat(run.upgrades)}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="tabular text-sm text-ink-soft">{duration(run.clearTimeMs)}</span>
                      <span className="tabular ml-1 text-xs text-ink-faint">
                        / {duration(run.parTimeMs)}
                      </span>
                      {/* A bar reads faster than two timestamps: how close to depleting. */}
                      <span className="mt-1 block h-[3px] w-24 overflow-hidden rounded-full bg-inset">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, ratio * 100)}%`,
                            backgroundColor: timed ? 'var(--color-ok)' : 'var(--color-stale)',
                          }}
                        />
                      </span>
                    </td>
                    <td className="tabular px-4 py-2 text-right text-sm text-ink-soft">
                      {run.score.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-ink-faint">
        “Timed” counts best runs per dungeon, not lifetime totals — Raider.IO’s public API
        does not expose the lifetime counters shown on their own site.
      </p>
    </section>
  );
}

// -------------------------------------------------------- Raid progression

export type RaidProgress = {
  summary: string;
  total_bosses: number;
  mythic_bosses_killed: number;
  heroic_bosses_killed: number;
  normal_bosses_killed: number;
};

const DIFFICULTIES = [
  { key: 'normal_bosses_killed', label: 'N', colour: 'var(--color-track-veteran)' },
  { key: 'heroic_bosses_killed', label: 'H', colour: 'var(--color-track-champion)' },
  { key: 'mythic_bosses_killed', label: 'M', colour: 'var(--color-track-myth)' },
] as const;

/**
 * Raider.IO slugs a tier before it has a public name — "tier-mn-1". Title-casing that
 * produced "Tier Mn 1" on screen, which is not a raid anyone can look for, so those are
 * labelled by what they are instead of being dressed up as a name.
 */
function raidLabel(slug: string): string {
  if (/^tier-/.test(slug)) return 'Current tier';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RaidProgression({ raids }: { raids: Record<string, RaidProgress> }) {
  const entries = Object.entries(raids);
  if (entries.length === 0) return null;

  const killed = (p: RaidProgress) =>
    p.normal_bosses_killed + p.heroic_bosses_killed + p.mythic_bosses_killed;

  // Raider.IO's own `summary` field is an empty string until something dies, which is
  // why this table used to render a column of blanks. Counting from the per-difficulty
  // numbers always says something, including "nothing yet".
  const anyProgress = entries.some(([, p]) => killed(p) > 0);

  return (
    <section>
      <h3 className="mb-3 text-h2 font-semibold text-ink">Raid Progression</h3>

      {!anyProgress ? (
        <p className="rounded-xl bg-surface/70 px-4 py-6 text-center text-sm text-ink-faint">
          No raid bosses killed this expansion.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries
            .sort(([, a], [, b]) => killed(b) - killed(a))
            .map(([slug, p]) => (
              <div key={slug} className="flex items-center gap-3 rounded-xl bg-surface/70 px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-item font-medium text-ink">
                  {raidLabel(slug)}
                </span>

                <span className="flex shrink-0 gap-1.5">
                  {DIFFICULTIES.map(({ key, label, colour }) => {
                    const n = p[key];
                    const done = n > 0;
                    return (
                      <span
                        key={key}
                        className="tabular rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          color: done ? colour : 'var(--color-ink-faint)',
                          backgroundColor: done
                            ? `color-mix(in srgb, ${colour} 18%, transparent)`
                            : 'var(--color-raised)',
                        }}
                        title={`${label === 'N' ? 'Normal' : label === 'H' ? 'Heroic' : 'Mythic'}: ${n} of ${p.total_bosses}`}
                      >
                        {label} {n}/{p.total_bosses}
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------- Talent build

export function TalentBuildSection({ build, spec }: { build: TalentBuild; spec: string }) {
  const [copied, setCopied] = useState(false);

  const columns: { key: TalentTree; label: string }[] = [
    { key: 'class', label: 'Class Talents' },
    { key: 'hero', label: 'Hero Talents' },
    { key: 'spec', label: 'Spec Talents' },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(build.importString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-h2 font-semibold text-ink">Talent Build</h3>
        <span className="text-xs text-ink-faint">
          {spec} · {build.picks.length} talents
        </span>
        {/*
          Icon only. With no label the state has to live in the glyph, so a successful
          copy swaps the clipboard for a tick — the one moment feedback actually matters,
          since nothing else on screen confirms a clipboard write happened.
        */}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Import string copied' : 'Copy the in-game import string'}
          title={copied ? 'Copied' : 'Copy the in-game import string'}
          className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors"
          style={
            copied
              ? { color: 'var(--color-ok)', backgroundColor: 'color-mix(in srgb, var(--color-ok) 18%, transparent)' }
              : { color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-muted)' }
          }
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {copied ? (
              <path d="M20 6L9 17l-5-5" />
            ) : (
              <>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 012-2h10" />
              </>
            )}
          </svg>
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {columns.map((column) => {
          const picks = build.picks.filter((p) => p.tree === column.key);
          return (
            <div key={column.key} className="rounded-xl bg-surface/70 p-3">
              <h4 className="mb-2.5 text-center text-[10px] tracking-wider text-ink-faint uppercase">
                {column.label}
                <span className="tabular ml-1.5 text-ink-faint/70">{picks.length}</span>
              </h4>
              {picks.length === 0 ? (
                <p className="text-center text-xs text-ink-faint">—</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {picks.map((pick) => (
                    <TalentIcon key={`${pick.name}-${pick.row}-${pick.col}`} pick={pick} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}

/**
 * Icon only, like the in-game tree. The name lives in the tooltip: linking to
 * wowhead.com/spell= means the Wowhead embed gives a real talent tooltip rather than a
 * plain title attribute.
 *
 * Partially-ranked talents get a dimmer border, so 1/2 reads differently from 2/2 at a
 * glance without having to read the badge.
 */
function TalentIcon({ pick }: { pick: TalentPick }) {
  const maxed = pick.rank >= pick.maxRanks;

  const icon = (
    <span className="relative block">
      <WowIcon
        src={slugIconUrl(pick.icon, 'medium')}
        size={34}
        rounded="sm"
        alt={pick.name}
        className={maxed ? 'ring-1 ring-accent/70' : 'ring-1 ring-line-strong opacity-80'}
      />
      {pick.maxRanks > 1 ? (
        <span className="tabular absolute -right-1 -bottom-1 rounded-sm bg-base px-1 text-[10px] leading-tight text-accent ring-1 ring-line-strong">
          {pick.rank}/{pick.maxRanks}
        </span>
      ) : null}
    </span>
  );

  if (!pick.spellId) {
    return <span title={pick.name}>{icon}</span>;
  }

  return (
    <a
      href={`https://www.wowhead.com/spell=${pick.spellId}`}
      target="_blank"
      rel="noreferrer"
      title={pick.name}
    >
      {icon}
    </a>
  );
}
