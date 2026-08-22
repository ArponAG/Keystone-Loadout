'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import {
  ARMOR_TYPES,
  PRIMARIES,
  buildToQuery,
  type Scope,
} from '@/lib/domain/build';
import type { Build } from '@/lib/domain/filters';
import { ARMOR_TYPE_LABEL } from '@/lib/domain/slots';
import { PRIMARY_LABEL, SECONDARY_LABEL, type SecondaryKey } from '@/lib/domain/stats';

/**
 * Writes the build into the URL rather than into React state — see lib/domain/build.ts.
 * Reordering uses explicit up/down buttons instead of drag-and-drop: no dependency,
 * keyboard-operable, and unambiguous about what rank a stat ended up at.
 */
export function BuildForm({ build, scope }: { build: Build; scope: Scope }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: Build, nextScope: Scope = scope) {
    startTransition(() => {
      router.push(`/gear?${buildToQuery(next, nextScope)}`, { scroll: false });
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target > 3) return;
    const order = [...build.secondaryOrder] as SecondaryKey[];
    [order[index], order[target]] = [order[target], order[index]];
    apply({ ...build, secondaryOrder: order as unknown as Build['secondaryOrder'] });
  }

  return (
    <div
      className={`rounded-lg border border-line bg-surface p-4 transition-opacity ${pending ? 'opacity-60' : ''}`}
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* --- armor type --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Armor type
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {ARMOR_TYPES.map((type) => (
              <Choice
                key={type}
                selected={build.armorType === type}
                onClick={() => apply({ ...build, armorType: type })}
              >
                {ARMOR_TYPE_LABEL[type]}
              </Choice>
            ))}
          </div>
        </fieldset>

        {/* --- primary --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Primary stat
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PRIMARIES.map((primary) => (
              <Choice
                key={primary}
                selected={build.primary === primary}
                onClick={() => apply({ ...build, primary })}
              >
                {PRIMARY_LABEL[primary]}
              </Choice>
            ))}
          </div>
        </fieldset>

        {/* --- secondary ranking --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Secondaries, best first
          </legend>
          <ol className="space-y-1">
            {build.secondaryOrder.map((key, index) => (
              <li key={key} className="flex items-center gap-2">
                <span className="tabular w-4 text-xs text-ink-faint">{index + 1}</span>
                <span className="min-w-[5.5rem] text-sm text-ink">{SECONDARY_LABEL[key]}</span>
                <span className="flex gap-0.5">
                  <Arrow
                    label={`Move ${SECONDARY_LABEL[key]} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Arrow>
                  <Arrow
                    label={`Move ${SECONDARY_LABEL[key]} down`}
                    disabled={index === 3}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Arrow>
                </span>
              </li>
            ))}
          </ol>
        </fieldset>
      </div>

      {/* --- scope --- */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-xs tracking-wide text-ink-faint uppercase">Compare</span>
        <Choice selected={scope === 'rotation'} onClick={() => apply(build, 'rotation')}>
          M+ rotation only
        </Choice>
        <Choice selected={scope === 'all'} onClick={() => apply(build, 'all')}>
          Everything synced
        </Choice>
        <span className="text-xs text-ink-faint">
          {scope === 'rotation'
            ? 'Same tier, so items are directly comparable.'
            : 'Mixes dungeon and raid tiers — ilvl differs, compare with care.'}
        </span>
      </div>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
        selected
          ? 'border-accent bg-accent-muted/40 text-accent'
          : 'border-line-strong bg-raised text-ink-soft hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-sm border border-line-strong bg-raised px-1.5 text-xs text-ink-soft transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-ink-soft"
    >
      {children}
    </button>
  );
}
