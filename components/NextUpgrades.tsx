'use client';

import { useState } from 'react';

import { FitScoreBadge } from '@/components/FitScoreBadge';
import { WowIcon } from '@/components/WowIcon';
import { Banner } from '@/components/ui';
import { itemIconUrl, qualityColor, wowheadItemUrl } from '@/lib/domain/icons';
import type { Recommendations } from '@/lib/domain/recommend';
import { SECONDARY_LABEL, type SecondaryKey } from '@/lib/domain/stats';
import type { ResolvedBuild } from '@/lib/raiderio/recommend-for-character';

const SECONDARIES: SecondaryKey[] = ['haste', 'crit', 'mastery', 'vers'];

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
}: {
  recommendations: Recommendations;
  build: ResolvedBuild;
  order: SecondaryKey[];
  onReorder: (next: SecondaryKey[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (recommendations.bySlot.length === 0) {
    return (
      <section>
        <h3 className="mb-3 text-h2 text-ink">What to get next</h3>
        <Banner variant="info">
          Every slot is already at or above what your current key level rewards. To upgrade
          further you need to push higher keys, or look to raid.
        </Banner>
      </section>
    );
  }

  const slots = showAll ? recommendations.bySlot : recommendations.bySlot.slice(0, 5);
  const topDungeon = recommendations.byDungeon[0];

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-h2 text-ink">What to get next</h3>
        <span className="text-sm text-ink-faint">
          {build.specName ? `${build.specName} · ` : ''}
          {build.armorType ?? 'any armor'} · {build.primary ?? 'any primary'}
        </span>
      </div>

      <p className="mb-4 text-sm text-ink-soft">
        Ranked by how many item levels you would gain. Everything here drops in this
        season’s Mythic+ dungeons, so at your key level it all arrives at the same item
        level — the only real choice is which slot to fix first.
      </p>

      {/* The question a new player actually has: what do I run tonight? */}
      {topDungeon && topDungeon.slots.length > 1 ? (
        <div className="mb-4">
          <Banner variant="info">
            <strong className="text-ink">Best single dungeon: {topDungeon.instanceName}</strong> —
            it can upgrade {topDungeon.slots.length} of your slots.{' '}
            {recommendations.byDungeon
              .slice(1, 3)
              .map((d) => `${d.instanceName} (${d.slots.length})`)
              .join(', ')}{' '}
            are next best.
          </Banner>
        </div>
      ) : null}

      <div className="space-y-3">
        {slots.map((rec) => (
          <div key={rec.slot} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex flex-wrap items-baseline gap-x-2 border-b border-line px-4 py-2">
              <span className="text-h3 text-ink">{rec.label}</span>
              <span className="text-sm text-ink-faint">
                <span className="tabular">{rec.currentItemLevel}</span> →{' '}
                <span className="tabular text-ink-soft">{rec.targetItemLevel}</span>
              </span>
              <span
                className="tabular ml-auto rounded-sm px-2 py-0.5 text-xs"
                style={{
                  color: 'var(--color-ok)',
                  backgroundColor: 'color-mix(in srgb, var(--color-ok) 15%, transparent)',
                }}
              >
                +{rec.gain} ilvl
              </span>
            </div>

            <ul>
              {rec.candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 last:border-0"
                >
                  <WowIcon
                    src={itemIconUrl(c.iconFileId)}
                    size={30}
                    quality={c.quality}
                    rounded="sm"
                  />
                  <a
                    href={wowheadItemUrl(c.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-item hover:underline"
                    style={{ color: qualityColor(c.quality) }}
                  >
                    {c.name}
                  </a>
                  <span className="text-xs text-ink-faint">
                    {c.instanceName}
                    {c.encounterName ? ` — ${c.encounterName}` : ''}
                  </span>
                  <span className="ml-auto">
                    <FitScoreBadge score={c.score} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {recommendations.bySlot.length > 5 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 rounded-md border border-line-strong bg-raised px-3 py-1.5 text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          {showAll ? 'Show fewer' : `Show all ${recommendations.bySlot.length} slots`}
        </button>
      ) : null}

      {/* Optional refinement, deliberately below the answer rather than above it. */}
      <details className="mt-4 rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-2 text-sm text-ink-soft hover:text-ink">
          Know your stat priority? Tune the percentages
        </summary>
        <div className="border-t border-line p-4">
          <p className="mb-3 text-xs text-ink-faint">
            The percentage is how much of an item’s secondary stats land on the ones you
            care about. It does not change which slot is furthest behind — that is item
            level only. Leave this alone if you are not sure; no API knows a spec’s real
            stat priority, so this is your call, and{' '}
            <a
              href="https://www.raidbots.com/simbot/droptimizer"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Raidbots
            </a>{' '}
            gives the properly simulated answer.
          </p>
          <div className="flex flex-wrap gap-1.5">
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
                className="rounded-md border border-line-strong bg-raised px-2.5 py-1 text-sm text-ink-soft transition-colors hover:border-accent hover:text-accent"
                title={`Move ${SECONDARY_LABEL[key]} to first`}
              >
                <span className="tabular mr-1 text-xs text-ink-faint">{index + 1}</span>
                {SECONDARY_LABEL[key]}
              </button>
            ))}
            {SECONDARIES.length !== order.length ? null : null}
          </div>
        </div>
      </details>

      <p className="mt-3 text-xs text-ink-faint">
        Trinkets and weapons are left out — their value comes from procs and weapon damage,
        which item level and stat weights cannot see.
      </p>
    </section>
  );
}
