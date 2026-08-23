'use client';

import { useState } from 'react';

import { FitScoreBadge } from '@/components/FitScoreBadge';
import { WowIcon } from '@/components/WowIcon';
import { Banner } from '@/components/ui';
import { itemIconUrl, qualityColor, wowheadItemUrl } from '@/lib/domain/icons';
import { PER_SLOT_CHOICES, type CandidateItem, type Recommendations } from '@/lib/domain/recommend';
import { SECONDARY_LABEL, type SecondaryKey } from '@/lib/domain/stats';
import type { LootSource, ResolvedBuild } from '@/lib/raiderio/recommend-for-character';

/**
 * "What to get next", written for someone new to the game.
 *
 * The headline ordering — biggest item level gap first, and which dungeon covers the
 * most slots — needs no configuration and no knowledge of stat priorities. Stat fit is
 * offered as a refinement further down, not as a prerequisite, because a new player
 * does not know their priority and should still get a useful answer.
 */
export function NextUpgrades({
  recommendations,
  build,
  order,
  onReorder,
  perSlot,
  onPerSlot,
  source,
  onSource,
  busy,
}: {
  recommendations: Recommendations;
  build: ResolvedBuild;
  order: SecondaryKey[];
  onReorder: (next: SecondaryKey[]) => void;
  perSlot: number;
  onPerSlot: (n: number) => void;
  source: LootSource;
  onSource: (v: LootSource) => void;
  busy: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  const controls = (
    <Controls
      perSlot={perSlot}
      onPerSlot={onPerSlot}
      source={source}
      onSource={onSource}
      busy={busy}
    />
  );

  if (recommendations.bySlot.length === 0) {
    return (
      <section>
        <Header build={build} />
        {controls}
        <Banner variant="info">
          Every slot is already at or above what your current key level rewards. To upgrade
          further you need to push higher keys, or look to raid.
        </Banner>
      </section>
    );
  }

  const slots = showAll ? recommendations.bySlot : recommendations.bySlot.slice(0, 4);
  const hidden = recommendations.bySlot.length - slots.length;

  return (
    <section>
      <Header build={build} />
      {controls}

      {/*
        "Which dungeon should I run tonight?" was already being computed and then thrown
        away — byDungeon has been in the payload all along with nothing rendering it.
        It is the question a new player actually has, and it cannot be answered from the
        per-slot list without cross-referencing eleven dungeon names by hand.
      */}
      <BestRuns recommendations={recommendations} />

      <div className="grid gap-3 lg:grid-cols-2">
        {slots.map((rec) => (
          <article key={rec.slot} className="overflow-hidden rounded-xl bg-surface/70">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-raised/50 px-3.5 py-2.5">
              <div className="flex items-baseline gap-2.5">
                <h4 className="text-h3 font-semibold text-ink">{rec.label}</h4>
                <span className="tabular text-xs text-ink-faint">
                  {rec.currentItemLevel} <span className="text-ink-faint/60">→</span>{' '}
                  <span className="font-medium text-ink">{rec.targetItemLevel}</span>
                </span>
              </div>

              <span
                className="tabular rounded-md px-2 py-0.5 text-xs font-bold"
                style={{
                  color: 'var(--color-ok)',
                  backgroundColor: 'color-mix(in srgb, var(--color-ok) 15%, transparent)',
                }}
                title={`${rec.label} is ${rec.currentItemLevel}. Your Great Vault would award ${rec.targetItemLevel}, so this slot is ${rec.gain} item levels behind.`}
              >
                +{rec.gain} ilvl
              </span>
            </div>

            <ul>
              {rec.candidates.map((c) => (
                <Candidate key={c.id} item={c} />
              ))}
            </ul>

          </article>
        ))}
      </div>

      {hidden > 0 || showAll ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 rounded-lg bg-raised px-3.5 py-2 text-xs font-medium text-ink-soft transition-colors hover:text-accent"
        >
          {showAll ? 'Show fewer slots' : `Show ${hidden} more slot${hidden > 1 ? 's' : ''}`}
        </button>
      ) : null}

      <StatPriority order={order} onReorder={onReorder} />
    </section>
  );
}

function Header({ build }: { build: ResolvedBuild }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h2 font-semibold text-ink">What to Get Next</h3>
        {/*
          These three describe the filter that produced the list, so they read as one
          line of prose rather than three loud chips. Before, each had its own hand-picked
          colour scheme — the spec badge alone matched on substrings like "prot" and
          "fire" across five palettes — which made the filter louder than the results.
        */}
        {build.specName || build.armorType || build.primary ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            {[build.specName, build.armorType, build.primary]
              .filter(Boolean)
              .map((part, i) => (
                <span key={i} className="rounded-md bg-raised px-2 py-0.5 capitalize">
                  {part}
                </span>
              ))}
          </span>
        ) : null}
      </div>
      <span className="text-xs text-ink-faint">Ranked by item level gap, then stat fit</span>
    </div>
  );
}

function Controls({
  perSlot,
  onPerSlot,
  source,
  onSource,
  busy,
}: {
  perSlot: number;
  onPerSlot: (n: number) => void;
  source: LootSource;
  onSource: (v: LootSource) => void;
  busy: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-surface/50 px-3.5 py-2.5">
      <span className="flex items-center gap-2">
        <span className="text-[11px] tracking-wide text-ink-faint uppercase">Per slot</span>
        <span className="flex gap-1">
          {PER_SLOT_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onPerSlot(n)}
              aria-pressed={perSlot === n}
              className={`tabular rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                perSlot === n
                  ? 'bg-accent-muted/45 text-accent'
                  : 'bg-raised text-ink-soft hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </span>
      </span>

      <span className="flex items-center gap-2">
        <span className="text-[11px] tracking-wide text-ink-faint uppercase">Source</span>
        <span className="flex gap-1">
          {SOURCE_TABS.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSource(value)}
              aria-pressed={source === value}
              title={hint}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                source === value
                  ? 'bg-accent-muted/45 text-accent'
                  : 'bg-raised text-ink-soft hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </span>
      </span>

      {busy ? <span className="text-xs text-ink-faint">Updating…</span> : null}

      {/*
        Stated once here rather than on every raid row. Written out in full because the
        short version ("+N figures compare Mythic+ vault rewards") assumed the reader
        already knew what +N measured and what a vault reward was — which is exactly the
        knowledge a new player does not have.
      */}
      {source !== 'mplus' ? (
        <span className="w-full text-xs leading-relaxed text-ink-faint">
          <span className="font-medium text-ink-soft">+N</span> is how far that slot is
          behind your Great Vault reward. Raid gear drops at a different item level on
          each difficulty, so for raid picks it is a rough guide rather than an exact gain.
        </span>
      ) : null}
    </div>
  );
}

const SOURCE_TABS: { value: LootSource; label: string; hint: string }[] = [
  { value: 'all', label: 'All', hint: 'Mythic+ and raid ranked together' },
  { value: 'mplus', label: 'Mythic+', hint: 'This season’s dungeon rotation only' },
  { value: 'raid', label: 'Raid', hint: 'Current-tier raid drops only' },
];

/** "What should I run tonight" — the dungeon covering the most weak slots. */
function BestRuns({ recommendations }: { recommendations: Recommendations }) {
  const top = recommendations.byDungeon.filter((d) => d.slots.length > 1).slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl bg-surface/50 p-3.5">
      <p className="mb-2 text-[11px] tracking-wide text-ink-faint uppercase">
        Best value runs — one dungeon, several slots
      </p>
      <div className="flex flex-wrap gap-2">
        {top.map((d) => (
          <span
            key={d.instanceId}
            className="flex items-center gap-2 rounded-lg bg-raised px-3 py-1.5"
            title={`Upgrades: ${d.slots.join(', ')}`}
          >
            <span className="text-item font-semibold text-ink">{d.instanceName}</span>
            <span className="tabular text-xs text-ink-faint">
              {d.slots.length} slots
            </span>
            <span
              className="tabular rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                color: 'var(--color-ok)',
                backgroundColor: 'color-mix(in srgb, var(--color-ok) 15%, transparent)',
              }}
            >
              +{d.totalGain}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Candidate({ item }: { item: CandidateItem }) {
  const isRaid = item.instanceType === 'raid';

  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-raised">
      <WowIcon src={itemIconUrl(item.iconFileId)} size={36} quality={item.quality} rounded="md" />

      <div className="min-w-0 flex-1">
        <a
          href={wowheadItemUrl(item.id)}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-item font-semibold transition-opacity hover:opacity-80"
          style={{ color: qualityColor(item.quality) }}
        >
          {item.name}
        </a>
        {/*
          Source as plain text, not a coloured chip. Eleven dungeons previously got
          eleven hand-assigned palettes with a string hash as fallback, which gave every
          row a second bright colour competing with the item's own quality colour.
        */}
        <span className="block truncate text-xs text-ink-faint">
          {isRaid ? (
            <span className="font-medium" style={{ color: 'var(--color-track-myth)' }}>
              Raid
            </span>
          ) : null}
          {isRaid ? ' · ' : ''}
          {item.instanceName}
          {item.encounterName ? ` · ${item.encounterName}` : ''}
        </span>
      </div>

      <FitScoreBadge score={item.score} />
    </li>
  );
}

function StatPriority({
  order,
  onReorder,
}: {
  order: SecondaryKey[];
  onReorder: (next: SecondaryKey[]) => void;
}) {
  return (
    <details className="group mt-3 rounded-xl bg-surface/50">
      <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink">
        Know your stat priority? Tune the percentages
      </summary>
      <div className="space-y-3 px-3.5 pb-3.5">
        <p className="text-xs leading-relaxed text-ink-faint">
          The percentage reflects how much of an item’s secondary stats match your priority.
          It does not change which slot is furthest behind — that is item level. For a real
          answer, sim it on{' '}
          <a
            href="https://www.raidbots.com/simbot/droptimizer"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            Raidbots
          </a>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          {order.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const next = [...order];
                next.splice(index, 1);
                next.unshift(key);
                onReorder(next);
              }}
              className="rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-accent"
              title={`Move ${SECONDARY_LABEL[key]} to priority 1`}
            >
              <span className="tabular mr-1.5 font-bold text-accent">{index + 1}</span>
              {SECONDARY_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}
