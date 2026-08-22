'use client';

import { useState } from 'react';

import { WowIcon } from '@/components/WowIcon';
import { slugIconUrl } from '@/lib/domain/icons';
import type { MythicPlus, TalentBuild } from '@/lib/raiderio/character';

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
    <div className="flex-1 px-4 py-3 text-center">
      <div className="tabular text-h1" style={{ color: colour ?? 'var(--color-ink)' }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs tracking-wide text-ink-soft uppercase">{label}</div>
      {sub ? <div className="text-xs text-ink-faint">{sub}</div> : null}
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
      <h3 className="mb-3 text-h2 text-ink">Mythic+ Progression</h3>

      <div className="mb-3 flex flex-wrap divide-x divide-line rounded-lg border border-line bg-surface">
        {/* Raider.IO's own tier colour for the score — the same green/orange their site uses. */}
        <Tile
          value={mplus.score.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          label={role || 'Score'}
          sub="Mythic+ Score"
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
        <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-ink-faint">
          No Mythic+ runs recorded this season.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr className="border-b border-line-strong text-xs tracking-wide text-ink-faint uppercase">
                <th className="px-4 py-2 font-medium">Dungeon</th>
                <th className="px-4 py-2 font-medium">Key</th>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {mplus.bestRuns.map((run) => {
                const timed = run.upgrades > 0;
                return (
                  <tr key={run.dungeon} className="border-b border-line last:border-0 hover:bg-raised">
                    <td className="px-4 py-2 text-sm text-ink">
                      <a href={run.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {run.dungeon}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="tabular text-sm"
                        style={{ color: timed ? 'var(--color-ok)' : 'var(--color-ink-soft)' }}
                      >
                        +{run.level}
                        {timed ? ` ${'+'.repeat(run.upgrades)}` : ''}
                      </span>
                    </td>
                    <td className="tabular px-4 py-2 text-sm text-ink-soft">
                      {duration(run.clearTimeMs)}
                      <span className="ml-1 text-xs text-ink-faint">
                        / {duration(run.parTimeMs)}
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

// ------------------------------------------------------------- Talent build

export function TalentBuildSection({ build, spec }: { build: TalentBuild; spec: string }) {
  const [copied, setCopied] = useState(false);

  // subTreeId 0 is the class/spec tree; anything else is a hero talent tree.
  const main = build.picks.filter((p) => p.subTreeId === 0);
  const hero = build.picks.filter((p) => p.subTreeId !== 0);

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
        <h3 className="text-h2 text-ink">Talent Build</h3>
        <span className="text-sm text-ink-faint">
          {spec} · {build.picks.length} talents
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-auto rounded-md border border-line-strong bg-raised px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent"
          title="Copy the in-game import string"
        >
          {copied ? 'Copied ✓' : 'Copy import string'}
        </button>
      </div>

      <div className="space-y-4">
        <TalentGroup title="Class & Spec" picks={main} />
        {hero.length > 0 ? <TalentGroup title="Hero talents" picks={hero} /> : null}
      </div>

      <details className="mt-3 rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-2 text-sm text-ink-soft hover:text-ink">
          Import string
        </summary>
        <p className="border-t border-line p-4 font-mono text-xs break-all text-ink-faint">
          {build.importString}
        </p>
      </details>
    </section>
  );
}

function TalentGroup({ title, picks }: { title: string; picks: TalentBuild['picks'] }) {
  if (picks.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h4 className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
        {title} <span className="text-ink-soft">({picks.length})</span>
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {picks.map((pick) => (
          <span
            key={`${pick.name}-${pick.row}`}
            className="flex items-center gap-1.5 rounded-md bg-raised py-1 pr-2 pl-1"
            title={`${pick.name} — rank ${pick.rank}/${pick.maxRanks}`}
          >
            <WowIcon src={slugIconUrl(pick.icon, 'medium')} size={22} rounded="sm" />
            <span className="text-xs text-ink-soft">{pick.name}</span>
            {pick.maxRanks > 1 ? (
              <span className="tabular text-xs text-accent">
                {pick.rank}/{pick.maxRanks}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
