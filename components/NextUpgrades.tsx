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
function getSpecBadgeStyle(specName: string | null | undefined): string {
  if (!specName) return 'border-accent/40 bg-accent-muted/20 text-accent';
  const name = specName.toLowerCase();

  if (name.includes('prot') || name.includes('guardian') || name.includes('blood') || name.includes('brewmaster') || name.includes('vengeance')) {
    return 'border-sky-500/40 bg-sky-500/15 text-sky-300';
  }
  if (name.includes('holy') || name.includes('resto') || name.includes('mistweaver') || name.includes('preservation') || name.includes('discipline')) {
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  }
  if (name.includes('fire') || name.includes('fury') || name.includes('havoc') || name.includes('arms') || name.includes('destruction')) {
    return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
  }
  if (name.includes('frost') || name.includes('arcane') || name.includes('balance') || name.includes('elemental') || name.includes('devastation')) {
    return 'border-teal-500/40 bg-teal-500/15 text-teal-300';
  }
  if (name.includes('shadow') || name.includes('affliction') || name.includes('demonology') || name.includes('subtlety') || name.includes('unholy')) {
    return 'border-purple-500/40 bg-purple-500/15 text-purple-300';
  }
  return 'border-accent/40 bg-accent-muted/20 text-accent';
}

function getArmorBadgeStyle(armorType: string | null | undefined): string {
  switch (armorType?.toLowerCase()) {
    case 'plate':
      return 'border-slate-500/40 bg-slate-500/15 text-slate-300';
    case 'mail':
      return 'border-blue-500/40 bg-blue-500/15 text-blue-300';
    case 'leather':
      return 'border-amber-600/40 bg-amber-600/15 text-amber-300';
    case 'cloth':
      return 'border-violet-500/40 bg-violet-500/15 text-violet-300';
    default:
      return 'border-line-strong bg-inset/90 text-ink-soft';
  }
}

function getPrimaryStatBadgeStyle(primary: string | null | undefined): string {
  switch (primary?.toLowerCase()) {
    case 'strength':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
    case 'agility':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
    case 'intellect':
      return 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300';
    default:
      return 'border-line-strong bg-inset/90 text-ink-soft';
  }
}

const INSTANCE_COLOR_MAP: Record<string, string> = {
  "kings' rest": 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  'temple of sethraliss': 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  'ruby life pools': 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  'voidscar arena': 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  'altar of fangs': 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  'murder row': 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  'the blinding vale': 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
  'sporefall': 'border-lime-500/40 bg-lime-500/15 text-lime-300',
  'the tidebound grotto': 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  'the venomous abyss': 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300',
  'den of nalorakk': 'border-amber-600/40 bg-amber-600/15 text-amber-300',
};

const INSTANCE_PALETTES = [
  'border-amber-500/40 bg-amber-500/15 text-amber-300',
  'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  'border-rose-500/40 bg-rose-500/15 text-rose-300',
  'border-purple-500/40 bg-purple-500/15 text-purple-300',
  'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
  'border-teal-500/40 bg-teal-500/15 text-teal-300',
  'border-orange-500/40 bg-orange-500/15 text-orange-300',
  'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300',
  'border-sky-500/40 bg-sky-500/15 text-sky-300',
];

function getInstanceBadgeStyle(name: string): string {
  const clean = name.toLowerCase().trim();
  if (INSTANCE_COLOR_MAP[clean]) return INSTANCE_COLOR_MAP[clean];

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return INSTANCE_PALETTES[Math.abs(hash) % INSTANCE_PALETTES.length];
}

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
      <section className="space-y-3">
        <h3 className="text-h2 font-semibold text-ink border-b border-line pb-2.5">What to Get Next</h3>
        <Banner variant="info">
          Every slot is already at or above what your current key level rewards. To upgrade
          further you need to push higher keys, or look to raid.
        </Banner>
      </section>
    );
  }

  const slots = showAll ? recommendations.bySlot : recommendations.bySlot.slice(0, 5);

  return (
    <section className="space-y-4 rounded-2xl border border-line/50 bg-raised/20 p-4 sm:p-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-h2 font-semibold text-ink">What to Get Next</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              {build.specName ? (
                <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${getSpecBadgeStyle(build.specName)}`}>
                  {build.specName}
                </span>
              ) : null}
              {build.armorType ? (
                <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold capitalize tracking-wide ${getArmorBadgeStyle(build.armorType)}`}>
                  {build.armorType}
                </span>
              ) : null}
              {build.primary ? (
                <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold capitalize tracking-wide ${getPrimaryStatBadgeStyle(build.primary)}`}>
                  {build.primary}
                </span>
              ) : null}
            </div>
          </div>
          <span className="text-xs text-ink-faint">
            Ranked by highest item level gain
          </span>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-accent/20 via-line/20 to-transparent" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {slots.map((rec) => (
          <div key={rec.slot} className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-surface/80 shadow-xs">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-raised/40 px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-h3 font-semibold text-ink">{rec.label}</span>
                  <span className="text-xs font-mono text-ink-faint">
                    <span className="tabular">{rec.currentItemLevel}</span> →{' '}
                    <span className="tabular font-medium text-ink">{rec.targetItemLevel}</span>
                  </span>
                </div>

                <span
                  className="tabular rounded-md px-2 py-0.5 text-xs font-bold"
                  style={{
                    color: 'var(--color-ok)',
                    backgroundColor: 'color-mix(in srgb, var(--color-ok) 15%, transparent)',
                  }}
                >
                  +{rec.gain} ilvl
                </span>
              </div>

              <ul className="divide-y divide-line/60">
                {rec.candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-raised"
                  >
                    <WowIcon
                      src={itemIconUrl(c.iconFileId)}
                      size={40}
                      quality={c.quality}
                      rounded="md"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <a
                        href={wowheadItemUrl(c.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-item font-semibold hover:underline transition-colors"
                        style={{ color: qualityColor(c.quality) }}
                      >
                        {c.name}
                      </a>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          c.instanceType === 'raid'
                            ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                            : 'border-accent/40 bg-accent-muted/20 text-accent'
                        }`}>
                          {c.instanceType === 'raid' ? 'Raid' : 'Dungeon'}
                        </span>
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${getInstanceBadgeStyle(c.instanceName)}`}>
                          {c.instanceName}
                        </span>
                        {c.encounterName ? (
                          <span className="truncate text-xs text-ink-faint">
                            {c.encounterName}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 pl-1">
                      <FitScoreBadge score={c.score} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      {recommendations.bySlot.length > 5 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="rounded-lg border border-line-strong bg-raised px-3.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          {showAll ? 'Show fewer slots' : `Show all ${recommendations.bySlot.length} slots`}
        </button>
      ) : null}

      <details className="group rounded-xl border border-line bg-surface/60 transition-colors hover:border-line-strong">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink">
          Know your stat priority? Tune the percentages
        </summary>
        <div className="border-t border-line p-4 space-y-3">
          <p className="text-xs text-ink-faint leading-relaxed">
            The percentage reflects how much of an item’s secondary stats match your priority.
            It does not change which slot is furthest behind (that is based on item level).
            For precise simulations, use{' '}
            <a
              href="https://www.raidbots.com/simbot/droptimizer"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Raidbots Droptimizer
            </a>.
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
                className="rounded-lg border border-line-strong bg-raised px-3 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
                title={`Move ${SECONDARY_LABEL[key]} to priority 1`}
              >
                <span className="tabular mr-1.5 font-bold text-accent">{index + 1}</span>
                {SECONDARY_LABEL[key]}
              </button>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
